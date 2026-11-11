/**
 * iOS Contacts against the contract merged in Identity #27
 * (nearsy-identity-functions 295e0f44, docs/operations/contacts-hmac-contract-v1.md).
 *
 * The server is a local double of that contract. Everything on this side is the
 * real iOS stack: controller, callable adapter, HTTP transport (with an injected
 * fetch) and the SecureStore session adapter (with an in-memory keychain).
 * No network, no native modules, no Identity deployment is exercised.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createSecureReevaluatePendingStore } from '../alerts/reevaluatePendingStore.ios';
import {
  createMemoryReevaluatePendingStore,
  registerReevaluatePendingStore,
} from '../alerts/reevaluatePendingStore.ts';
import {
  registerReevaluateProximityNoticesInvoker,
  reevaluateProximityNoticesNow,
  resumePendingReevaluateProximityNotices,
  scheduleReevaluateProximityNotices,
} from '../alerts/reevaluateProximityNotices.ts';
import { createContactsHmacCallableClient } from '../contacts/adapter';
import { observeContactsEpoch } from '../contacts/contactsSessionState';
import { invokeContactsHmacCallableHttp } from '../contacts/contactsCallableHttp';
import {
  isContactsSyncRetryable,
  presentContactsSyncError,
} from '../contacts/contactsErrorPresentation';
import {
  CONTACTS_OP_SKIPPED_REASON,
  classifyContactsOutcome,
  createContactsOperationRunner,
  driveContactsOperation,
  type ContactsOutcomeView,
} from '../contacts/contactsOperationCoordinator';
import {
  CONTACTS_DISABLE_PENDING_REASON,
  disableContactsSyncFlow,
  enableAndSyncContacts,
  reconcilePendingDisable,
  refreshVerifiedActorKeysFlow,
  syncGrantedAddressBook,
  withdrawContactSource,
  type ContactsControllerPorts,
} from '../contacts/controller';
import { ContactsHmacClientError } from '../contacts/errors';
import {
  createSecureStoreContactsSessionStore,
  type ExpoSecureStoreLike,
} from '../contacts/iosContactsSession.ios';
import type { ContactsPermissionStatus } from '../contacts/port';
import es from '../i18n/locales/es';
import enSettings from '../i18n/resources/settings';

// ---------- Identity contract double ----------

class Rejected extends Error {
  constructor(
    readonly reason: string,
    readonly status = 'FAILED_PRECONDITION',
  ) {
    super(reason);
  }
}

type StoredSource = { version: number; content: string };

/** §5 of the contract, for one account. Rejections never write. */
function createIdentityDouble(seed: { epoch?: number; enabled?: boolean } = {}) {
  const state = {
    epoch: seed.epoch ?? 0,
    enabled: seed.enabled ?? false,
    sources: new Map<string, StoredSource>(),
    fences: new Map<string, number>(),
  };
  const base = (extra: Record<string, unknown>) => ({
    contactsSyncEnabled: state.enabled,
    contactsEpoch: state.epoch,
    notifyNearbyContactsEffective: state.enabled,
    syncCommitted: true,
    ...extra,
  });
  const purge = () => {
    const had = state.sources.size > 0 || state.fences.size > 0;
    state.sources.clear();
    state.fences.clear();
    return had;
  };
  const handlers: Record<string, (data: any) => unknown> = {
    enableContactsSync(data) {
      if (data.contactsEpoch === undefined) {
        if (state.epoch > 0) throw new Rejected('contacts-epoch-required');
      } else if (data.contactsEpoch !== state.epoch) {
        throw new Rejected('contacts-epoch-mismatch');
      }
      const first = !state.enabled;
      if (first) {
        state.enabled = true;
        purge();
      }
      return base({ result: 'enabled', keyCount: 1, reevaluateRequired: first });
    },
    syncContactHashes(data) {
      if (data.contactsEpoch !== state.epoch) {
        throw new Rejected('contacts-epoch-mismatch');
      }
      if (!state.enabled) throw new Rejected('contacts-not-enabled', 'PERMISSION_DENIED');
      const fence = state.fences.get(data.sourceId);
      if (fence != null && data.snapshotVersion <= fence) {
        throw new Rejected('contacts-source-removed');
      }
      const content = JSON.stringify(data.identifiers);
      const stored = state.sources.get(data.sourceId);
      if (stored && data.snapshotVersion < stored.version) {
        throw new Rejected('contacts-snapshot-stale');
      }
      const reply = (result: string, reevaluateRequired: boolean) =>
        base({
          result,
          sourceId: data.sourceId,
          snapshotVersion: data.snapshotVersion,
          identifierCount: data.identifiers.length,
          reevaluateRequired,
        });
      if (stored && data.snapshotVersion === stored.version) {
        if (stored.content !== content) throw new Rejected('contacts-snapshot-conflict');
        return reply('idempotent', false);
      }
      state.sources.set(data.sourceId, { version: data.snapshotVersion, content });
      return reply('synced', true);
    },
    disableContactsSync(data) {
      if (data.contactsEpoch !== state.epoch) {
        throw new Rejected('contacts-epoch-mismatch');
      }
      const hadEffect = state.enabled || purge();
      purge();
      state.enabled = false;
      state.epoch += 1;
      return base({ result: 'disabled', keyCount: 1, reevaluateRequired: hadEffect });
    },
    removeContactSource(data) {
      if (data.contactsEpoch !== state.epoch) {
        throw new Rejected('contacts-epoch-mismatch');
      }
      const known = data.knownSnapshotVersion ?? 0;
      const stored = state.sources.get(data.sourceId);
      const fence = Math.max(state.fences.get(data.sourceId) ?? 0, known);
      if (stored && data.knownSnapshotVersion !== undefined && stored.version > known) {
        return base({
          result: 'superseded',
          sourceId: data.sourceId,
          snapshotVersion: stored.version,
          reevaluateRequired: false,
        });
      }
      if (stored) {
        state.sources.delete(data.sourceId);
        state.fences.set(data.sourceId, Math.max(fence, stored.version));
        return base({
          result: 'removed',
          sourceId: data.sourceId,
          snapshotVersion: stored.version,
          reevaluateRequired: true,
        });
      }
      state.fences.set(data.sourceId, fence);
      return base({ result: 'absent', sourceId: data.sourceId, reevaluateRequired: false });
    },
    refreshVerifiedActorKeys() {
      return base({ result: 'refreshed', keyCount: 1, reevaluateRequired: false });
    },
  };
  return { state, handlers };
}

// ---------- Real iOS stack over the double ----------

type Gate = { promise: Promise<void>; open: () => void };

function gate(): Gate {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
}

function fakeKeychain() {
  const data = new Map<string, string>();
  const store: ExpoSecureStoreLike = {
    async getItemAsync(key) {
      return data.get(key) ?? null;
    },
    async setItemAsync(key, value) {
      assert.match(key, /^[A-Za-z0-9._-]+$/, `invalid SecureStore key ${key}`);
      data.set(key, value);
    },
    async deleteItemAsync(key) {
      data.delete(key);
    },
  };
  return { store, data };
}

function createStack(input: {
  identity: ReturnType<typeof createIdentityDouble>;
  uid?: string;
  keychain?: ReturnType<typeof fakeKeychain>;
  permission?: ContactsPermissionStatus;
}) {
  const { identity } = input;
  const uid = input.uid ?? 'uid-a';
  const keychain = input.keychain ?? fakeKeychain();
  const calls: Array<{ name: string; data: any }> = [];
  /** Requests fail without reaching the server. */
  const net = { down: false };
  /** The server applies these, and the response is lost on the way back. */
  const loseResponse = new Set<string>();
  /** Answers are held after the server applied them. */
  const holdResponse = new Map<string, Gate>();
  /** Requests are held before the server sees them. */
  const holdRequest = new Map<string, Gate>();

  const fetchImpl = (async (url: string, init: RequestInit) => {
    const name = String(url).split('/').pop()!;
    const data = JSON.parse(String(init.body)).data;
    calls.push({ name, data });
    const before = holdRequest.get(name);
    if (before) {
      holdRequest.delete(name);
      await before.promise;
    }
    if (net.down) throw new TypeError('Network request failed');
    let body: unknown;
    let status = 200;
    try {
      body = { result: identity.handlers[name](data) };
    } catch (err) {
      if (!(err instanceof Rejected)) throw err;
      status = 400;
      body = {
        error: {
          status: err.status,
          message: `Rejected. (${err.reason})`,
          details: { reason: err.reason },
        },
      };
    }
    if (loseResponse.delete(name)) throw new TypeError('Network request failed');
    const after = holdResponse.get(name);
    if (after) {
      holdResponse.delete(name);
      await after.promise;
    }
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;

  const client = createContactsHmacCallableClient({
    invoke: (name, data) =>
      invokeContactsHmacCallableHttp(
        {
          projectId: 'nearsy-dev',
          environment: 'development',
          functionName: name,
          idToken: 'test-id-token',
          appCheckToken: 'test-app-check',
          data,
        },
        { fetchImpl },
      ),
  });

  const book = {
    permission: input.permission ?? ('granted' as ContactsPermissionStatus),
    rows: [{ phoneNumbers: [{ number: '+14155552671' }] }] as Array<{
      phoneNumbers: Array<{ number: string }>;
    }>,
    log: [] as string[],
    /** Reading the book fails with this error when set. */
    readError: null as Error | null,
  };
  const pendingStore = createSecureReevaluatePendingStore(async () => keychain.store);
  const reevaluate = { scheduled: 0 };
  const session = createSecureStoreContactsSessionStore(uid, async () => keychain.store);
  const ports: ContactsControllerPorts = {
    client,
    session,
    book: {
      getPermission: async () => {
        book.log.push('getPermission');
        return book.permission;
      },
      requestPermission: async () => {
        book.log.push('requestPermission');
        book.permission = 'granted';
        return 'granted';
      },
      readRows: async () => {
        book.log.push('readRows');
        if (book.readError) throw book.readError;
        return book.rows;
      },
    },
    createRandomHex: () => 'abcdef0123456789',
    sleep: async () => {},
    reevaluatePending: {
      isPending: () => pendingStore.isPending(uid),
      markPending: () => pendingStore.markPending(uid),
      clear: () => pendingStore.clearIfUid(uid),
    },
    afterIdentity: async () => {
      reevaluate.scheduled += 1;
    },
  };
  const named = (name: string) => calls.filter((c) => c.name === name);
  return {
    uid,
    ports,
    session,
    book,
    calls,
    named,
    net,
    loseResponse,
    holdResponse,
    holdRequest,
    keychain,
    pendingStore,
    reevaluate,
  };
}

const tick = () => new Promise((r) => setTimeout(r, 0));
const until = async (done: () => boolean) => {
  for (let i = 0; i < 200 && !done(); i += 1) await tick();
  assert.ok(done(), 'condition never became true');
};

// ---------- First enable and reactivation ----------

describe('Enable carries the confirmed epoch', () => {
  it('first enable on a new install reads the epoch first and never sends {}', async () => {
    const stack = createStack({ identity: createIdentityDouble() });
    const out = await enableAndSyncContacts(stack.ports);
    assert.equal(out.ok && out.bookSynced, true);
    assert.deepEqual(
      stack.calls.map((c) => c.name),
      ['refreshVerifiedActorKeys', 'enableContactsSync', 'syncContactHashes'],
    );
    assert.deepEqual(stack.named('enableContactsSync')[0].data, { contactsEpoch: 0 });
    assert.equal(classifyContactsOutcome('enable', out, false).view, 'synced');
    assert.equal((await stack.session.load())?.contactsEpoch, 0);
  });

  it('keeps consent first: the OS prompt comes before any Identity call', async () => {
    const stack = createStack({
      identity: createIdentityDouble(),
      permission: 'undetermined',
    });
    const seenAtPrompt: number[] = [];
    const request = stack.ports.book.requestPermission;
    stack.ports.book.requestPermission = async () => {
      seenAtPrompt.push(stack.calls.length);
      return request();
    };
    await enableAndSyncContacts(stack.ports);
    assert.deepEqual(seenAtPrompt, [0]);
    assert.ok(stack.book.log.indexOf('requestPermission') < stack.book.log.indexOf('readRows'));
  });

  it('denied OS access sends no enable and reads no book', async () => {
    const stack = createStack({ identity: createIdentityDouble(), permission: 'denied' });
    const out = await enableAndSyncContacts(stack.ports);
    assert.equal(out.ok === false && out.reason, 'contacts-os-denied');
    assert.equal(stack.named('enableContactsSync').length, 0);
    assert.equal(stack.book.log.includes('readRows'), false);
  });

  it('reactivation uses the epoch from the disable response, with no refresh', async () => {
    const identity = createIdentityDouble();
    const stack = createStack({ identity });
    await enableAndSyncContacts(stack.ports);
    await disableContactsSyncFlow(stack.ports);
    assert.equal(identity.state.epoch, 1);
    stack.calls.length = 0;

    const out = await enableAndSyncContacts(stack.ports);
    assert.equal(out.ok && out.bookSynced, true);
    assert.deepEqual(
      stack.calls.map((c) => c.name),
      ['enableContactsSync', 'syncContactHashes'],
    );
    assert.deepEqual(stack.calls[0].data, { contactsEpoch: 1 });
    assert.equal(stack.calls[1].data.contactsEpoch, 1);
  });

  it('the adapter refuses to send an enable without an epoch', async () => {
    let invoked = false;
    const client = createContactsHmacCallableClient({
      invoke: async () => {
        invoked = true;
        return {};
      },
    });
    await assert.rejects(
      client.enableContactsSync({} as never),
      (err: ContactsHmacClientError) => err.reason === 'contacts-epoch-required',
    );
    assert.equal(invoked, false);
  });
});

// ---------- Unknown epoch ----------

describe('Epoch unknown', () => {
  it('account disabled on another install: uses the live epoch, not 0', async () => {
    const identity = createIdentityDouble({ epoch: 3 });
    const stack = createStack({ identity });
    const out = await enableAndSyncContacts(stack.ports);
    assert.equal(out.ok && out.bookSynced, true);
    assert.deepEqual(stack.named('enableContactsSync')[0].data, { contactsEpoch: 3 });
    assert.equal(stack.named('syncContactHashes')[0].data.contactsEpoch, 3);
  });

  it('refresh cannot answer: no enable, no book read, no invented success', async () => {
    const stack = createStack({ identity: createIdentityDouble({ epoch: 3 }) });
    stack.net.down = true;
    const out = await enableAndSyncContacts(stack.ports);
    assert.equal(out.ok, false);
    assert.equal(stack.named('refreshVerifiedActorKeys').length, 1, 'one attempt, no polling');
    assert.equal(stack.named('enableContactsSync').length, 0);
    assert.equal(stack.book.log.includes('readRows'), false);
    const view = classifyContactsOutcome('enable', out, false);
    assert.equal(view.view, 'error');
    assert.equal(view.enabled, null, 'state stays unconfirmed');
    assert.equal(view.retryable, true);
    assert.equal(view.retryKind, 'enable');
  });

  it('a retry with no stored epoch and the integration off uploads nothing', async () => {
    const stack = createStack({ identity: createIdentityDouble({ epoch: 2 }) });
    const out = await syncGrantedAddressBook(stack.ports);
    assert.equal(out.ok === false && out.reason, 'contacts-not-enabled');
    assert.equal(stack.named('syncContactHashes').length, 0);
    assert.equal(stack.named('enableContactsSync').length, 0, 'never re-enables');
    assert.equal(classifyContactsOutcome('sync', out, true).enabled, false);
  });
});

// ---------- Mismatch ----------

async function seedEpoch(stack: ReturnType<typeof createStack>, epoch: number) {
  await stack.session.save({
    sourceId: 'ios_testdevice01',
    contactsEpoch: epoch,
    snapshotVersion: null,
    fingerprint: null,
  });
}

describe('contacts-epoch-mismatch', () => {
  it('enable, refreshed off: reads state and does not reactivate on its own', async () => {
    const identity = createIdentityDouble({ epoch: 3 });
    const stack = createStack({ identity });
    await seedEpoch(stack, 2);
    const out = await enableAndSyncContacts(stack.ports);
    assert.equal(out.ok === false && out.reason, 'contacts-epoch-mismatch');
    assert.equal(stack.named('enableContactsSync').length, 1);
    assert.equal(stack.named('refreshVerifiedActorKeys').length, 1);
    assert.equal(identity.state.enabled, false);
    assert.equal(stack.named('syncContactHashes').length, 0);
    assert.equal(stack.book.log.includes('readRows'), false);
    const view = classifyContactsOutcome('enable', out, false);
    assert.equal(view.enabled, false);
    assert.equal(view.retryKind, 'enable');

    // A new tap is a new intent, and it has the refreshed epoch.
    const again = await enableAndSyncContacts(stack.ports);
    assert.equal(again.ok && again.bookSynced, true);
    assert.deepEqual(stack.named('enableContactsSync')[1].data, { contactsEpoch: 3 });
  });

  it('enable, refreshed on: nothing to enable, uploads at the live epoch', async () => {
    const identity = createIdentityDouble({ epoch: 3, enabled: true });
    const stack = createStack({ identity });
    await seedEpoch(stack, 2);
    const out = await enableAndSyncContacts(stack.ports);
    assert.equal(out.ok && out.bookSynced, true);
    assert.equal(stack.named('enableContactsSync').length, 1);
    assert.equal(stack.named('syncContactHashes')[0].data.contactsEpoch, 3);
  });

  it('sync, refreshed off: stops and does not re-enable', async () => {
    const identity = createIdentityDouble({ epoch: 3 });
    const stack = createStack({ identity });
    await seedEpoch(stack, 2);
    const out = await syncGrantedAddressBook(stack.ports);
    assert.equal(out.ok === false && out.reason, 'contacts-not-enabled');
    assert.equal(out.ok === false && out.identityEnabled, false);
    assert.equal(stack.named('syncContactHashes').length, 1);
    assert.equal(stack.named('enableContactsSync').length, 0);
  });

  it('sync, refreshed on: uploads once at the new epoch', async () => {
    const identity = createIdentityDouble({ epoch: 3, enabled: true });
    const stack = createStack({ identity });
    await seedEpoch(stack, 2);
    const out = await syncGrantedAddressBook(stack.ports);
    assert.equal(out.ok && out.bookSynced, true);
    assert.deepEqual(
      stack.named('syncContactHashes').map((c) => c.data.contactsEpoch),
      [2, 3],
    );
  });

  it('disable, refreshed on: stays pending until an explicit retry at the new epoch', async () => {
    const identity = createIdentityDouble({ epoch: 3, enabled: true });
    const stack = createStack({ identity });
    await seedEpoch(stack, 2);
    const out = await disableContactsSyncFlow(stack.ports);
    assert.equal(out.ok === false && out.reason, CONTACTS_DISABLE_PENDING_REASON);
    assert.equal(identity.state.enabled, true, 'may be a new activation elsewhere');
    assert.equal(stack.named('disableContactsSync').length, 1);
    const view = classifyContactsOutcome('disable', out, true);
    assert.equal(view.enabled, true);
    assert.equal(view.retryKind, 'disable');

    const retry = await disableContactsSyncFlow(stack.ports);
    assert.equal(retry.ok, true);
    assert.equal(identity.state.enabled, false);
    assert.deepEqual(
      stack.named('disableContactsSync').map((c) => c.data.contactsEpoch),
      [2, 3],
    );
    assert.equal((await stack.session.load())?.disablePending, false);
  });

  it('remove, refreshed off: done, sources were purged', async () => {
    const stack = createStack({ identity: createIdentityDouble({ epoch: 3 }) });
    await seedEpoch(stack, 2);
    const out = await withdrawContactSource(stack.ports);
    assert.equal(out.ok, true);
    assert.equal(stack.named('removeContactSource').length, 1);
  });

  it('a mismatch right after a refresh does not refresh again', async () => {
    const stack = createStack({ identity: createIdentityDouble({ epoch: 3 }) });
    const original = stack.ports.client.enableContactsSync;
    stack.ports.client.enableContactsSync = async (request) =>
      original({ contactsEpoch: request.contactsEpoch + 1 });
    const out = await enableAndSyncContacts(stack.ports);
    assert.equal(out.ok === false && out.reason, 'contacts-epoch-mismatch');
    assert.equal(stack.named('refreshVerifiedActorKeys').length, 1);
  });
});

// ---------- Lost responses and no network ----------

describe('Lost response', () => {
  it('lost enable: the state stays unconfirmed and a retry repeats the same body', async () => {
    const identity = createIdentityDouble();
    const stack = createStack({ identity });
    await seedEpoch(stack, 0);
    stack.loseResponse.add('enableContactsSync');
    const out = await enableAndSyncContacts(stack.ports);
    assert.equal(out.ok, false);
    assert.equal(identity.state.enabled, true, 'it did commit');
    assert.equal(classifyContactsOutcome('enable', out, false).enabled, null);
    assert.equal(stack.named('syncContactHashes').length, 0);

    const retry = await enableAndSyncContacts(stack.ports);
    assert.equal(retry.ok && retry.bookSynced, true);
    assert.deepEqual(
      stack.named('enableContactsSync').map((c) => c.data),
      [{ contactsEpoch: 0 }, { contactsEpoch: 0 }],
    );
  });

  it('lost sync: same book retries the same version and confirms as idempotent', async () => {
    const identity = createIdentityDouble({ enabled: true });
    const stack = createStack({ identity });
    await seedEpoch(stack, 0);
    stack.loseResponse.add('syncContactHashes');
    const lost = await syncGrantedAddressBook(stack.ports);
    assert.equal(lost.ok, false);
    assert.equal((await stack.session.load())?.fingerprint, null, 'not shown as synced');

    const retry = await syncGrantedAddressBook(stack.ports);
    assert.equal(retry.ok && retry.result.result, 'idempotent');
    assert.equal(retry.ok && retry.bookSynced, true);
    assert.deepEqual(
      stack.named('syncContactHashes').map((c) => c.data.snapshotVersion),
      [1, 1],
    );
  });

  it('lost sync, then the book changed: a greater version, never a conflict', async () => {
    const identity = createIdentityDouble({ enabled: true });
    const stack = createStack({ identity });
    await seedEpoch(stack, 0);
    stack.loseResponse.add('syncContactHashes');
    await syncGrantedAddressBook(stack.ports);
    stack.book.rows = [{ phoneNumbers: [{ number: '+14155552672' }] }];
    const retry = await syncGrantedAddressBook(stack.ports);
    assert.equal(retry.ok && retry.result.result, 'synced');
    assert.deepEqual(
      stack.named('syncContactHashes').map((c) => c.data.snapshotVersion),
      [1, 2],
    );
  });

  it('lost disable: the retry reads the barrier as a mismatch and confirms off', async () => {
    const identity = createIdentityDouble({ enabled: true });
    const stack = createStack({ identity });
    await seedEpoch(stack, 0);
    stack.loseResponse.add('disableContactsSync');
    const out = await disableContactsSyncFlow(stack.ports);
    assert.equal(out.ok && out.result.contactsSyncEnabled, false);
    assert.equal(stack.named('disableContactsSync').length, 2);
    assert.equal(stack.named('refreshVerifiedActorKeys').length, 1);
    assert.equal((await stack.session.load())?.contactsEpoch, 1);
  });

  it('no network: disable stops after bounded attempts and offers disable again', async () => {
    const identity = createIdentityDouble({ enabled: true });
    const stack = createStack({ identity });
    await seedEpoch(stack, 0);
    stack.net.down = true;
    const out = await disableContactsSyncFlow(stack.ports);
    assert.equal(out.ok, false);
    assert.equal(stack.named('disableContactsSync').length, 3);
    assert.equal(stack.named('refreshVerifiedActorKeys').length, 0);
    const view = classifyContactsOutcome('disable', out, true);
    assert.equal(view.enabled, null);
    assert.equal(view.retryKind, 'disable', 'a turn-off retry is not a sync');
  });

  it('no network: enable and sync report a recoverable error', async () => {
    const identity = createIdentityDouble({ enabled: true });
    const stack = createStack({ identity });
    await seedEpoch(stack, 0);
    stack.net.down = true;
    const sync = await syncGrantedAddressBook(stack.ports);
    assert.equal(sync.ok, false);
    assert.equal(stack.named('syncContactHashes').length, 1, 'no automatic retries');
    assert.equal(classifyContactsOutcome('sync', sync, true).retryable, true);
    const enable = await enableAndSyncContacts(stack.ports);
    assert.equal(classifyContactsOutcome('enable', enable, false).enabled, null);
  });
});

// ---------- Turning off cancels ----------

describe('Turning off cancels earlier intents', () => {
  it('a late enabled response restores nothing and starts no upload', async () => {
    const identity = createIdentityDouble();
    const stack = createStack({ identity });
    await seedEpoch(stack, 0);
    const held = gate();
    stack.holdResponse.set('enableContactsSync', held);
    const runner = createContactsOperationRunner();

    const enable = runner.run(stack.uid, 'enable', ({ isCurrent }) =>
      enableAndSyncContacts({ ...stack.ports, isCancelled: () => !isCurrent() }),
    );
    await until(() => stack.named('enableContactsSync').length === 1);

    // The turn-off does not wait for the running enable.
    const disable = runner.run(stack.uid, 'disable', () =>
      disableContactsSyncFlow(stack.ports),
    );
    await disable.promise;
    assert.equal(identity.state.enabled, false);
    assert.equal(runner.isCurrent(enable.token), false);

    stack.book.log.length = 0;
    held.open();
    const late = await enable.promise;
    assert.equal(late.ok === false && late.reason, CONTACTS_OP_SKIPPED_REASON);
    assert.equal(stack.named('syncContactHashes').length, 0);
    assert.equal(stack.book.log.includes('readRows'), false);
    assert.equal(identity.state.enabled, false);
    assert.equal(
      classifyContactsOutcome('enable', late, false).enabled,
      null,
      'a skipped result never moves the toggle',
    );
  });

  it('a late enable applied after the disable is rejected by the barrier', async () => {
    const identity = createIdentityDouble({ enabled: false });
    const stack = createStack({ identity });
    await seedEpoch(stack, 0);
    const held = gate();
    stack.holdRequest.set('enableContactsSync', held);
    const runner = createContactsOperationRunner();
    const enable = runner.run(stack.uid, 'enable', ({ isCurrent }) =>
      enableAndSyncContacts({ ...stack.ports, isCancelled: () => !isCurrent() }),
    );
    await until(() => stack.named('enableContactsSync').length === 1);
    await runner.run(stack.uid, 'disable', () => disableContactsSyncFlow(stack.ports)).promise;
    held.open();
    await enable.promise;
    assert.equal(identity.state.enabled, false, 'both orders end off');
    assert.equal(identity.state.epoch, 1);
    assert.equal(stack.named('syncContactHashes').length, 0);
  });

  it('turning off during the epoch read never sends the enable', async () => {
    const stack = createStack({ identity: createIdentityDouble() });
    const held = gate();
    stack.holdResponse.set('refreshVerifiedActorKeys', held);
    let cancelled = false;
    const enable = enableAndSyncContacts({ ...stack.ports, isCancelled: () => cancelled });
    await until(() => stack.named('refreshVerifiedActorKeys').length === 1);
    cancelled = true;
    held.open();
    const out = await enable;
    assert.equal(out.ok === false && out.reason, CONTACTS_OP_SKIPPED_REASON);
    assert.equal(stack.named('enableContactsSync').length, 0);
  });

  it('a late sync confirmation is discarded: epoch raised, snapshot not confirmed', async () => {
    const identity = createIdentityDouble({ enabled: true });
    const stack = createStack({ identity });
    await seedEpoch(stack, 0);
    const held = gate();
    stack.holdResponse.set('syncContactHashes', held);
    const runner = createContactsOperationRunner();
    const sync = runner.run(stack.uid, 'sync', ({ isCurrent }) =>
      syncGrantedAddressBook({ ...stack.ports, isCancelled: () => !isCurrent() }),
    );
    await until(() => stack.named('syncContactHashes').length === 1);
    await runner.run(stack.uid, 'disable', () => disableContactsSyncFlow(stack.ports)).promise;
    held.open();
    const late = await sync.promise;
    assert.equal(late.ok === false && late.reason, CONTACTS_OP_SKIPPED_REASON);
    const session = await stack.session.load();
    assert.equal(session?.contactsEpoch, 1);
    assert.equal(session?.fingerprint, null);
  });

  it('a queued retry behind a turn-off never reaches Identity with old intent', async () => {
    const runner = createContactsOperationRunner();
    const held = gate();
    const running = runner.run('uid-a', 'refresh', async () => {
      await held.promise;
      return { ok: false, reason: 'x', bookSynced: false };
    });
    let ran = false;
    const queued = runner.run('uid-a', 'sync', async () => {
      ran = true;
      return { ok: false, reason: 'x', bookSynced: false };
    });
    runner.run('uid-a', 'disable', async () => ({ ok: false, reason: 'x', bookSynced: false }));
    held.open();
    await running.promise;
    const out = await queued.promise;
    assert.equal(ran, false);
    assert.equal(out.ok === false && out.reason, CONTACTS_OP_SKIPPED_REASON);
  });

  it('drive drops the late view of a cancelled enable', async () => {
    const runner = createContactsOperationRunner();
    const held = gate();
    const views: ContactsOutcomeView[] = [];
    const drive = driveContactsOperation({
      runner,
      uid: 'uid-a',
      kind: 'enable',
      previousEnabled: false,
      waitMs: 1000,
      task: async () => {
        await held.promise;
        return {
          ok: true,
          bookSynced: true,
          result: {
            result: 'synced',
            contactsSyncEnabled: true,
            contactsEpoch: 0,
            notifyNearbyContactsEffective: true,
            syncCommitted: true,
            reevaluateRequired: false,
          },
        };
      },
      isActive: () => true,
      readServerState: async () => null,
      onView: (view) => views.push(view),
    });
    await runner.run('uid-a', 'disable', async () => ({
      ok: false,
      reason: 'x',
      bookSynced: false,
    })).promise;
    held.open();
    await drive;
    assert.deepEqual(views.map((v) => v.view), ['syncing']);
  });
});

// ---------- Remove and superseded ----------

describe('removeContactSource', () => {
  it('knownSnapshotVersion is the highest sent, including an uncertain one', async () => {
    const identity = createIdentityDouble({ enabled: true });
    const stack = createStack({ identity });
    await seedEpoch(stack, 0);
    await syncGrantedAddressBook(stack.ports);
    stack.book.rows = [{ phoneNumbers: [{ number: '+14155552672' }] }];
    stack.net.down = true;
    await syncGrantedAddressBook(stack.ports);
    assert.equal(identity.state.sources.size, 1);
    stack.net.down = false;

    const out = await withdrawContactSource(stack.ports);
    assert.equal(out.ok && out.result.result, 'removed');
    assert.deepEqual(stack.named('removeContactSource')[0].data, {
      sourceId: 'ios_testdevice01',
      contactsEpoch: 0,
      knownSnapshotVersion: 2,
    });
  });

  it('nothing sent in this epoch: known is 0, even after an earlier epoch', async () => {
    const identity = createIdentityDouble({ enabled: true });
    const stack = createStack({ identity });
    await seedEpoch(stack, 0);
    await syncGrantedAddressBook(stack.ports);
    await disableContactsSyncFlow(stack.ports);
    identity.state.enabled = true;
    await withdrawContactSource(stack.ports);
    assert.deepEqual(stack.named('removeContactSource')[0].data, {
      sourceId: 'ios_testdevice01',
      contactsEpoch: 1,
      knownSnapshotVersion: 0,
    });
  });

  it('after remove the next upload takes a version above the fence', async () => {
    const identity = createIdentityDouble({ enabled: true });
    const stack = createStack({ identity });
    await seedEpoch(stack, 0);
    await syncGrantedAddressBook(stack.ports);
    await withdrawContactSource(stack.ports);
    const again = await syncGrantedAddressBook(stack.ports);
    assert.equal(again.ok && again.bookSynced, true);
    assert.deepEqual(
      stack.named('syncContactHashes').map((c) => c.data.snapshotVersion),
      [1, 2],
    );
  });

  function seedNewerOnServer(identity: ReturnType<typeof createIdentityDouble>) {
    identity.state.sources.set('ios_testdevice01', { version: 9, content: '[]' });
  }

  it('superseded with the withdrawal still current: removes again with that version', async () => {
    const identity = createIdentityDouble({ enabled: true });
    const stack = createStack({ identity, permission: 'denied' });
    await seedEpoch(stack, 0);
    seedNewerOnServer(identity);
    const out = await withdrawContactSource(stack.ports);
    assert.equal(out.ok && out.result.result, 'removed');
    assert.deepEqual(
      stack.named('removeContactSource').map((c) => c.data.knownSnapshotVersion),
      [0, 9],
    );
    assert.equal(identity.state.sources.size, 0);
  });

  it('superseded with access back: the source stays and is not shown as withdrawn', async () => {
    const identity = createIdentityDouble({ enabled: true });
    const stack = createStack({ identity, permission: 'denied' });
    await seedEpoch(stack, 0);
    seedNewerOnServer(identity);
    const original = stack.ports.book.getPermission;
    stack.ports.book.getPermission = async () => {
      await original();
      return 'granted';
    };
    const out = await withdrawContactSource(stack.ports);
    assert.equal(out.ok && out.result.result, 'superseded');
    assert.equal(stack.named('removeContactSource').length, 1);
    assert.equal(identity.state.sources.size, 1);
    const view = classifyContactsOutcome('sync', out, true);
    assert.equal(view.view, 'idle');
    assert.equal(view.reason, null);
    assert.equal(view.enabled, true);

    // The local version was raised: the next upload clears the stored one.
    const next = await syncGrantedAddressBook(stack.ports);
    assert.equal(next.ok && next.bookSynced, true);
    assert.equal(stack.named('syncContactHashes')[0].data.snapshotVersion, 10);
  });

  it('superseded twice stops instead of looping', async () => {
    const identity = createIdentityDouble({ enabled: true });
    const stack = createStack({ identity, permission: 'denied' });
    await seedEpoch(stack, 0);
    seedNewerOnServer(identity);
    // A newer snapshot lands before every remove.
    identity.handlers.removeContactSource = ((real) => (data: any) => {
      identity.state.sources.set('ios_testdevice01', {
        version: data.knownSnapshotVersion + 1,
        content: '[]',
      });
      return real(data);
    })(identity.handlers.removeContactSource);
    const out = await withdrawContactSource(stack.ports);
    assert.equal(out.ok === false && out.reason, 'contacts-os-denied');
    assert.equal(stack.named('removeContactSource').length, 2);
    assert.equal(identity.state.sources.size, 1);
  });
});

// ---------- Pending turn-off across restarts ----------

describe('Pending disable across restarts', () => {
  /** A turn-off whose request never reached the server, then the app closes. */
  async function closedWithPendingDisable(
    identity: ReturnType<typeof createIdentityDouble>,
    keychain = fakeKeychain(),
  ) {
    const before = createStack({ identity, keychain });
    await seedEpoch(before, identity.state.epoch);
    before.net.down = true;
    const out = await disableContactsSyncFlow(before.ports);
    assert.equal(out.ok === false && out.reason, CONTACTS_DISABLE_PENDING_REASON);
    assert.equal(identity.state.enabled, true, 'the server never saw it');
    return createStack({ identity, keychain });
  }

  it('the intent is on the keychain before the request leaves', async () => {
    const identity = createIdentityDouble({ enabled: true });
    const stack = createStack({ identity });
    await seedEpoch(stack, 0);
    const held = gate();
    stack.holdRequest.set('disableContactsSync', held);
    const out = disableContactsSyncFlow(stack.ports);
    await until(() => stack.named('disableContactsSync').length === 1);
    const reopened = createSecureStoreContactsSessionStore(
      stack.uid,
      async () => stack.keychain.store,
    );
    assert.equal((await reopened.load())?.disablePending, true);
    held.open();
    await out;
    assert.equal((await reopened.load())?.disablePending, false);
  });

  it('it survives a restart with no other local state', async () => {
    const identity = createIdentityDouble({ enabled: true });
    const keychain = fakeKeychain();
    const before = createStack({ identity, keychain });
    before.net.down = true;
    await disableContactsSyncFlow(before.ports);
    const after = createStack({ identity, keychain });
    assert.equal((await after.session.load())?.disablePending, true);
  });

  it('after a restart, enable and sync send nothing while the server is on', async () => {
    const identity = createIdentityDouble({ enabled: true });
    const stack = await closedWithPendingDisable(identity);

    const enable = await enableAndSyncContacts(stack.ports);
    assert.equal(enable.ok === false && enable.reason, CONTACTS_DISABLE_PENDING_REASON);
    const sync = await syncGrantedAddressBook(stack.ports);
    assert.equal(sync.ok === false && sync.reason, CONTACTS_DISABLE_PENDING_REASON);

    assert.equal(stack.named('enableContactsSync').length, 0);
    assert.equal(stack.named('syncContactHashes').length, 0);
    assert.equal(stack.named('disableContactsSync').length, 0);
    assert.deepEqual(stack.book.log, [], 'no prompt and no book read');
  });

  it('recovering with the server off completes it, and only then shows off', async () => {
    const identity = createIdentityDouble({ enabled: true });
    const stack = await closedWithPendingDisable(identity);
    // The lost request landed after all, or another device turned it off.
    identity.state.enabled = false;
    identity.state.epoch += 1;

    const out = await reconcilePendingDisable(stack.ports);
    assert.equal(out.ok, true);
    assert.equal(classifyContactsOutcome('refresh', out, true).enabled, false);
    assert.equal(classifyContactsOutcome('refresh', out, true).view, 'idle');
    assert.equal(stack.named('disableContactsSync').length, 0);
    assert.equal((await stack.session.load())?.disablePending, false);

    // Turning on again is now a new intent with the confirmed epoch.
    const again = await enableAndSyncContacts(stack.ports);
    assert.equal(again.ok && again.bookSynced, true);
  });

  it('recovering with the server on shows pending and never resends by itself', async () => {
    const identity = createIdentityDouble({ epoch: 4, enabled: true });
    const stack = await closedWithPendingDisable(identity);
    // A new activation from another device: a later epoch, on.
    identity.state.epoch = 6;

    const out = await reconcilePendingDisable(stack.ports);
    assert.equal(out.ok === false && out.reason, CONTACTS_DISABLE_PENDING_REASON);
    assert.equal(stack.named('refreshVerifiedActorKeys').length, 1, 'one read, no polling');
    assert.equal(stack.named('disableContactsSync').length, 0);
    assert.equal(identity.state.enabled, true);
    const view = classifyContactsOutcome('refresh', out, true);
    assert.equal(view.enabled, true, 'not shown as off');
    assert.equal(view.retryable, true);
    assert.equal(view.retryKind, 'disable');
    assert.equal((await stack.session.load())?.disablePending, true);

    // The explicit retry uses the epoch that read stored.
    const retry = await disableContactsSyncFlow(stack.ports);
    assert.equal(retry.ok, true);
    assert.deepEqual(stack.named('disableContactsSync')[0].data, { contactsEpoch: 6 });
    assert.equal(identity.state.enabled, false);
  });

  it('recovering without network keeps it and invents nothing', async () => {
    const identity = createIdentityDouble({ enabled: true });
    const stack = await closedWithPendingDisable(identity);
    stack.net.down = true;
    const out = await reconcilePendingDisable(stack.ports);
    assert.equal(out.ok === false && out.reason, CONTACTS_DISABLE_PENDING_REASON);
    const view = classifyContactsOutcome('refresh', out, true);
    assert.equal(view.enabled, null, 'state stays unconfirmed');
    assert.equal(view.retryKind, 'disable');
    assert.equal((await stack.session.load())?.disablePending, true);
    assert.equal(stack.named('refreshVerifiedActorKeys').length, 1);
  });

  it('nothing pending: recovering makes no Identity call', async () => {
    const stack = createStack({ identity: createIdentityDouble({ enabled: true }) });
    await seedEpoch(stack, 0);
    const out = await reconcilePendingDisable(stack.ports);
    assert.equal(out.ok === false && out.reason, CONTACTS_OP_SKIPPED_REASON);
    assert.equal(stack.calls.length, 0);
  });

  it('it survives sign-out with source, versions and marker, and stays per UID', async () => {
    const keychain = fakeKeychain();
    const identity = createIdentityDouble({ enabled: true });
    const a = createStack({ identity, keychain });
    await seedEpoch(a, 0);
    await syncGrantedAddressBook(a.ports);
    const before = await a.session.load();
    a.net.down = true;
    await disableContactsSyncFlow(a.ports);
    assert.equal(await a.pendingStore.isPending(a.uid), true);
    await a.session.forgetEpoch();

    const after = await a.session.load();
    assert.equal(after?.contactsEpoch, null);
    assert.equal(after?.disablePending, true);
    assert.equal(after?.sourceId, before?.sourceId);
    assert.equal(after?.snapshotVersion, before?.snapshotVersion);
    assert.equal(await a.pendingStore.isPending(a.uid), true);

    const b = createStack({
      identity: createIdentityDouble(),
      uid: 'uid-b',
      keychain,
    });
    const out = await enableAndSyncContacts(b.ports);
    assert.equal(out.ok && out.bookSynced, true, 'another account is not blocked');
  });
});

// ---------- Upload after a mismatch needs the same intent ----------

describe('Sync after a mismatch keeps to the same intent', () => {
  async function staleSync() {
    const identity = createIdentityDouble({ epoch: 3, enabled: true });
    const stack = createStack({ identity });
    await seedEpoch(stack, 2);
    return { identity, stack };
  }

  it('turned off while the mismatch was on its way: no refresh and no upload', async () => {
    const { stack } = await staleSync();
    const held = gate();
    stack.holdResponse.set('syncContactHashes', held);
    let cancelled = false;
    const sync = syncGrantedAddressBook({ ...stack.ports, isCancelled: () => cancelled });
    await until(() => stack.named('syncContactHashes').length === 1);
    cancelled = true;
    held.open();
    const out = await sync;
    assert.equal(out.ok === false && out.reason, CONTACTS_OP_SKIPPED_REASON);
    assert.equal(stack.named('syncContactHashes').length, 1);
    assert.equal(stack.named('refreshVerifiedActorKeys').length, 0);
  });

  it('turned off during the state read: an "on" answer does not restore the intent', async () => {
    const { stack } = await staleSync();
    const held = gate();
    stack.holdResponse.set('refreshVerifiedActorKeys', held);
    const runner = createContactsOperationRunner();
    const sync = runner.run(stack.uid, 'sync', ({ isCurrent }) =>
      syncGrantedAddressBook({ ...stack.ports, isCancelled: () => !isCurrent() }),
    );
    await until(() => stack.named('refreshVerifiedActorKeys').length === 1);
    runner.invalidate(stack.uid);
    held.open();
    const out = await sync.promise;
    assert.equal(out.ok === false && out.reason, CONTACTS_OP_SKIPPED_REASON);
    assert.equal(stack.named('syncContactHashes').length, 1);
    assert.equal(stack.named('enableContactsSync').length, 0);
  });

  it('account changed or signed out during the read: same result', async () => {
    const { stack } = await staleSync();
    const held = gate();
    stack.holdResponse.set('refreshVerifiedActorKeys', held);
    let signedInUid = stack.uid;
    const sync = syncGrantedAddressBook({
      ...stack.ports,
      isCancelled: () => signedInUid !== stack.uid,
    });
    await until(() => stack.named('refreshVerifiedActorKeys').length === 1);
    signedInUid = 'uid-b';
    held.open();
    const out = await sync;
    assert.equal(out.ok === false && out.reason, CONTACTS_OP_SKIPPED_REASON);
    assert.equal(stack.named('syncContactHashes').length, 1);
  });

  it('a turn-off pending from elsewhere blocks the upload', async () => {
    const { stack } = await staleSync();
    const held = gate();
    stack.holdResponse.set('refreshVerifiedActorKeys', held);
    const sync = syncGrantedAddressBook(stack.ports);
    await until(() => stack.named('refreshVerifiedActorKeys').length === 1);
    await stack.session.update((current) => ({ ...current!, disablePending: true }));
    held.open();
    const out = await sync;
    assert.equal(out.ok === false && out.reason, CONTACTS_DISABLE_PENDING_REASON);
    assert.equal(stack.named('syncContactHashes').length, 1);
  });

  it('OS access withdrawn meanwhile: no upload and no prompt', async () => {
    const { stack } = await staleSync();
    const held = gate();
    stack.holdResponse.set('refreshVerifiedActorKeys', held);
    const sync = syncGrantedAddressBook(stack.ports);
    await until(() => stack.named('refreshVerifiedActorKeys').length === 1);
    stack.book.permission = 'denied';
    held.open();
    const out = await sync;
    assert.equal(out.ok === false && out.reason, 'contacts-os-denied');
    assert.equal(stack.named('syncContactHashes').length, 1);
    assert.equal(stack.book.log.includes('requestPermission'), false);
  });

  it('with everything still valid it uploads once at the live epoch', async () => {
    const { stack } = await staleSync();
    const out = await syncGrantedAddressBook(stack.ports);
    assert.equal(out.ok && out.bookSynced, true);
    assert.deepEqual(
      stack.named('syncContactHashes').map((c) => c.data.contactsEpoch),
      [2, 3],
    );
  });
});

// ---------- Epoch and UID ----------

describe('Epoch monotonic per account', () => {
  it('a response from an older epoch changes nothing, confirmation included', async () => {
    const stack = createStack({ identity: createIdentityDouble() });
    await stack.session.save({
      sourceId: 'ios_testdevice01',
      contactsEpoch: 5,
      snapshotVersion: 2,
      fingerprint: 'confirmed',
    });
    await stack.session.update((current) => observeContactsEpoch(current, 4));
    const session = await stack.session.load();
    assert.equal(session?.contactsEpoch, 5);
    assert.equal(session?.fingerprint, 'confirmed');
  });

  it('a late response never lowers the epoch and an old confirmation is discarded', async () => {
    const identity = createIdentityDouble({ epoch: 4, enabled: true });
    const stack = createStack({ identity });
    await seedEpoch(stack, 4);
    const held = gate();
    stack.holdResponse.set('syncContactHashes', held);
    const sync = syncGrantedAddressBook(stack.ports);
    await until(() => stack.named('syncContactHashes').length === 1);
    // Another response raised the epoch while this confirmation was on its way.
    await stack.session.save({
      ...(await stack.session.load())!,
      contactsEpoch: 5,
      fingerprint: null,
    });
    held.open();
    const out = await sync;
    assert.equal(out.ok && out.bookSynced, false, 'not confirmed for an older epoch');
    const session = await stack.session.load();
    assert.equal(session?.contactsEpoch, 5);
    assert.equal(session?.fingerprint, null);
  });

  it('versions keep growing across epochs for a stable source', async () => {
    const identity = createIdentityDouble({ enabled: true });
    const stack = createStack({ identity });
    await seedEpoch(stack, 0);
    await syncGrantedAddressBook(stack.ports);
    await disableContactsSyncFlow(stack.ports);
    await enableAndSyncContacts(stack.ports);
    assert.deepEqual(
      stack.named('syncContactHashes').map((c) => [c.data.contactsEpoch, c.data.snapshotVersion]),
      [
        [0, 1],
        [1, 2],
      ],
    );
  });

  it('the epoch survives a restart of the same session', async () => {
    const keychain = fakeKeychain();
    const identity = createIdentityDouble();
    const first = createStack({ identity, keychain });
    await enableAndSyncContacts(first.ports);
    await disableContactsSyncFlow(first.ports);
    const second = createStack({ identity, keychain });
    await enableAndSyncContacts(second.ports);
    assert.equal(second.named('refreshVerifiedActorKeys').length, 0);
    assert.deepEqual(second.named('enableContactsSync')[0].data, { contactsEpoch: 1 });
  });
});

describe('UID change', () => {
  it('never reuses an epoch, source or version from another account', async () => {
    const keychain = fakeKeychain();
    const a = createStack({
      identity: createIdentityDouble({ epoch: 5 }),
      uid: 'uid-a',
      keychain,
    });
    await enableAndSyncContacts(a.ports);
    const b = createStack({
      identity: createIdentityDouble({ epoch: 2 }),
      uid: 'uid-b',
      keychain,
    });
    const out = await enableAndSyncContacts(b.ports);
    assert.equal(out.ok && out.bookSynced, true);
    assert.equal(b.named('refreshVerifiedActorKeys').length, 1, 'B has no stored epoch');
    assert.deepEqual(b.named('enableContactsSync')[0].data, { contactsEpoch: 2 });
    assert.equal(b.named('syncContactHashes')[0].data.snapshotVersion, 1);
    assert.equal((await a.session.load())?.contactsEpoch, 5);
  });

  it('signing out invalidates intents and the next session asks for the epoch', async () => {
    const keychain = fakeKeychain();
    const identity = createIdentityDouble();
    const stack = createStack({ identity, keychain });
    await enableAndSyncContacts(stack.ports);
    const sourceId = (await stack.session.load())?.sourceId;
    await stack.session.forgetEpoch();
    assert.equal((await stack.session.load())?.contactsEpoch, null);
    assert.equal((await stack.session.load())?.sourceId, sourceId, 'the source stays stable');

    stack.calls.length = 0;
    await disableContactsSyncFlow(stack.ports);
    assert.deepEqual(
      stack.calls.map((c) => c.name),
      ['refreshVerifiedActorKeys', 'disableContactsSync'],
    );
    assert.equal(identity.state.enabled, false);
  });
});

// ---------- Reevaluate ----------

describe('Reevaluate pending per UID', () => {
  it('a "nothing changed" answer to the first attempt clears the marker', async () => {
    const identity = createIdentityDouble({ enabled: true });
    const stack = createStack({ identity });
    await seedEpoch(stack, 0);
    await refreshVerifiedActorKeysFlow(stack.ports);
    assert.equal(await stack.pendingStore.isPending(stack.uid), false);
    assert.equal(stack.reevaluate.scheduled, 0);
  });

  it('a retry after a lost response still reevaluates, though it answers false', async () => {
    const identity = createIdentityDouble({ enabled: true });
    const stack = createStack({ identity });
    await seedEpoch(stack, 0);
    stack.loseResponse.add('syncContactHashes');
    await syncGrantedAddressBook(stack.ports);
    assert.equal(await stack.pendingStore.isPending(stack.uid), true);
    assert.equal(stack.reevaluate.scheduled, 0);

    const retry = await syncGrantedAddressBook(stack.ports);
    assert.equal(retry.ok && retry.result.reevaluateRequired, false);
    assert.equal(stack.reevaluate.scheduled, 1);
    assert.equal(await stack.pendingStore.isPending(stack.uid), true, 'until reevaluate succeeds');
  });

  it('a definite rejection on a first attempt leaves no marker', async () => {
    const stack = createStack({ identity: createIdentityDouble({ epoch: 1 }) });
    await seedEpoch(stack, 1);
    await syncGrantedAddressBook(stack.ports);
    assert.equal(await stack.pendingStore.isPending(stack.uid), false);
  });

  it('a pending marker survives a definite rejection', async () => {
    const stack = createStack({ identity: createIdentityDouble({ epoch: 1 }) });
    await seedEpoch(stack, 1);
    await stack.pendingStore.markPending(stack.uid);
    await syncGrantedAddressBook(stack.ports);
    assert.equal(await stack.pendingStore.isPending(stack.uid), true);
  });

  it('disable with an effect reevaluates, and a prior marker stays until it succeeds', async () => {
    const identity = createIdentityDouble({ enabled: true });
    const stack = createStack({ identity });
    await seedEpoch(stack, 0);
    await stack.pendingStore.markPending(stack.uid);
    await disableContactsSyncFlow(stack.ports);
    assert.equal(stack.reevaluate.scheduled, 1);
    assert.equal(await stack.pendingStore.isPending(stack.uid), true);
  });

  it('already off with a marker from a cancelled call still reevaluates', async () => {
    const identity = createIdentityDouble();
    const stack = createStack({ identity });
    await seedEpoch(stack, 0);
    await stack.pendingStore.markPending(stack.uid);
    const out = await disableContactsSyncFlow(stack.ports);
    assert.equal(out.ok && out.result.reevaluateRequired, false);
    assert.equal(stack.reevaluate.scheduled, 1);
  });

  it('markers are per UID on the keychain: another account never overwrites one', async () => {
    const { store } = fakeKeychain();
    const pending = createSecureReevaluatePendingStore(async () => store);
    await pending.markPending('uid-a');
    await pending.markPending('uid-b');
    await pending.clearIfUid('uid-b');
    assert.equal(await pending.isPending('uid-a'), true);
    assert.equal(await pending.isPending('uid-b'), false);
  });

  it('honors a marker from the previous single-slot key only for its own UID', async () => {
    const { store } = fakeKeychain();
    await store.setItemAsync('nearsy.alerts.v1.reevaluatePendingUid', 'uid-a');
    const pending = createSecureReevaluatePendingStore(async () => store);
    assert.equal(await pending.isPending('uid-a'), true);
    assert.equal(await pending.isPending('uid-b'), false);
    await pending.clearIfUid('uid-a');
    assert.equal(await pending.isPending('uid-a'), false);
  });

  it('a flush after the account changed keeps the marker and resumes on return', async () => {
    const pending = createMemoryReevaluatePendingStore();
    registerReevaluatePendingStore(pending);
    let currentUid = 'uid-a';
    const invoked: string[] = [];
    registerReevaluateProximityNoticesInvoker(
      async (uid) => {
        if (uid !== currentUid) throw new Error('reevaluate-uid-changed');
        invoked.push(uid);
      },
      () => currentUid,
    );
    scheduleReevaluateProximityNotices();
    await reevaluateProximityNoticesNow();
    assert.equal(await pending.isPending('uid-a'), false);

    await pending.markPending('uid-a');
    currentUid = 'uid-b';
    await resumePendingReevaluateProximityNotices();
    assert.equal(await pending.isPending('uid-b'), false, 'B does not inherit it');
    assert.equal(await pending.isPending('uid-a'), true);

    currentUid = 'uid-a';
    await resumePendingReevaluateProximityNotices();
    await reevaluateProximityNoticesNow();
    assert.equal(await pending.isPending('uid-a'), false);
    assert.deepEqual(invoked, ['uid-a', 'uid-a']);
    registerReevaluateProximityNoticesInvoker(null);
  });
});

// ---------- Reconciling never touches the book ----------

describe('Reconciling does not touch the address book', () => {
  it('refresh, disable and mismatch handling never ask for permission or read rows', async () => {
    const identity = createIdentityDouble({ epoch: 3, enabled: true });
    const stack = createStack({ identity, permission: 'undetermined' });
    await refreshVerifiedActorKeysFlow(stack.ports);
    await seedEpoch(stack, 2);
    await disableContactsSyncFlow(stack.ports);
    assert.deepEqual(stack.book.log, []);
  });

  it('a sync retry reads the permission and never prompts', async () => {
    const stack = createStack({
      identity: createIdentityDouble({ enabled: true }),
      permission: 'undetermined',
    });
    await seedEpoch(stack, 0);
    await syncGrantedAddressBook(stack.ports);
    assert.equal(stack.book.log.includes('requestPermission'), false);
    assert.equal(stack.book.log.includes('readRows'), false);
  });

  it('a rate-limited epoch read is one recoverable error, not a loop', async () => {
    const identity = createIdentityDouble();
    identity.handlers.refreshVerifiedActorKeys = () => {
      throw new Rejected('contacts-rate-limited', 'RESOURCE_EXHAUSTED');
    };
    const stack = createStack({ identity });
    const out = await enableAndSyncContacts(stack.ports);
    assert.equal(out.ok === false && out.reason, 'contacts-rate-limited');
    assert.equal(stack.named('refreshVerifiedActorKeys').length, 1);
    const view = classifyContactsOutcome('enable', out, false);
    assert.equal(view.enabled, false);
    assert.equal(view.retryKind, 'enable');
  });
});

// ---------- contacts-epoch-required copy ----------

describe('contacts-epoch-required', () => {
  const t = ((key: string) => key) as never;

  it('survives the real HTTP transport as its own reason', async () => {
    await assert.rejects(
      (async () => {
        const fetchImpl = (async () =>
          new Response(
            JSON.stringify({
              error: {
                status: 'FAILED_PRECONDITION',
                message: 'Update the app. (contacts-epoch-required)',
                details: { reason: 'contacts-epoch-required' },
              },
            }),
            { status: 400 },
          )) as unknown as typeof fetch;
        await invokeContactsHmacCallableHttp(
          {
            projectId: 'nearsy-dev',
            environment: 'development',
            functionName: 'enableContactsSync',
            idToken: 'test-id-token',
            appCheckToken: 'test-app-check',
            data: {},
          },
          { fetchImpl },
        );
      })(),
      (err: ContactsHmacClientError) => err.reason === 'contacts-epoch-required',
    );
  });

  it('is handled like a mismatch, with its own copy and no retry', async () => {
    const stack = createStack({ identity: createIdentityDouble({ epoch: 1 }) });
    await seedEpoch(stack, 1);
    const client = {
      ...stack.ports.client,
      enableContactsSync: async () => {
        throw new ContactsHmacClientError('contacts-epoch-required', 'x');
      },
    };
    const out = await enableAndSyncContacts({ ...stack.ports, client });
    assert.equal(out.ok === false && out.reason, 'contacts-epoch-required');
    assert.equal(stack.named('refreshVerifiedActorKeys').length, 1);
    const view = classifyContactsOutcome('enable', out, false);
    assert.equal(view.retryable, false);
    assert.equal(view.retryKind, null);
    assert.equal(isContactsSyncRetryable('contacts-epoch-required'), false);
    assert.equal(
      presentContactsSyncError('contacts-epoch-required', t),
      'settings.contacts.errors.epochRequired',
    );
  });

  it('EN and ES ask to update and do not block the rest of the app', () => {
    const en = (enSettings as any).contacts.errors.epochRequired as string;
    const spanish = (es as any).settings.contacts.errors.epochRequired as string;
    assert.match(en, /Update Nearsy/);
    assert.match(en, /Everything else keeps working/);
    assert.match(spanish, /Actualiza Nearsy/);
    assert.match(spanish, /El resto de la app sigue funcionando/);
  });

  it('auth lookup failure is retryable, unconfirmed, and keeps consent', () => {
    const view = classifyContactsOutcome(
      'sync',
      { ok: false, reason: 'contacts-auth-lookup-failed', bookSynced: false },
      true,
    );
    assert.equal(view.retryable, true);
    assert.equal(view.enabled, null);
    assert.equal(
      presentContactsSyncError('contacts-auth-lookup-failed', t),
      'settings.contacts.errors.unavailable',
    );
  });
});

// ---------- Book read failures ----------

describe('A book that cannot be read is never an empty snapshot', () => {
  it('a read failure after enable sends no syncContactHashes and keeps the last snapshot', async () => {
    const stack = createStack({ identity: createIdentityDouble() });
    const first = await enableAndSyncContacts(stack.ports);
    assert.equal(first.ok && first.bookSynced, true);
    const sentBefore = stack.named('syncContactHashes').length;
    const sessionBefore = await stack.session.load();

    stack.book.readError = new Error('contacts-read-unavailable');
    await assert.rejects(syncGrantedAddressBook(stack.ports));
    assert.equal(stack.named('syncContactHashes').length, sentBefore);
    assert.deepEqual(await stack.session.load(), sessionBefore);
  });

  it('a read failure on first enable never uploads an empty book', async () => {
    const stack = createStack({ identity: createIdentityDouble() });
    stack.book.readError = new Error('contacts-read-incomplete');
    await assert.rejects(enableAndSyncContacts(stack.ports));
    assert.equal(stack.named('syncContactHashes').length, 0);
  });
});

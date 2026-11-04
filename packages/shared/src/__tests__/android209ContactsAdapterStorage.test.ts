/**
 * Loads the real Android adapter (contactsHmac.android.ts + contactsBook.android.ts)
 * and replaces only native modules, so UID separation is proven on the code that
 * ships, not on the non-Android stub.
 * Run: node --experimental-strip-types --test packages/shared/src/__tests__/android209ContactsAdapterStorage.test.ts
 */
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { before, beforeEach, describe, it } from 'node:test';

import {
  DISABLE_CONTACTS_SYNC as DISABLE,
  ENABLE_CONTACTS_SYNC as ENABLE,
  REFRESH_VERIFIED_ACTOR_KEYS as REFRESH,
  REMOVE_CONTACT_SOURCE as REMOVE,
  SYNC_CONTACT_HASHES as SYNC,
} from '../contactsHmac/contactsHmacContract.ts';
import { FakeIdentity, identityRejects } from './helpers/contactsIdentityFake.ts';

type Env = {
  uid: string | null;
  storage: Map<string, string>;
  calls: Array<{ name: string; data: any; uid: string | null }>;
  respond: (name: string, data: any) => unknown;
  permission: string;
  contacts: Array<{ emails?: Array<{ email: string }> }>;
  appCheck: 'ready' | 'error';
  reevaluations: number;
  authListener: ((user: { uid: string } | null) => void) | null;
  randomFill: number;
};

const env: Env = {
  uid: null,
  storage: new Map(),
  calls: [],
  respond: () => undefined,
  permission: 'granted',
  contacts: [],
  appCheck: 'ready',
  reevaluations: 0,
  authListener: null,
  randomFill: 0,
};
(globalThis as any).__contactsAdapterEnv = env;

const moduleSource = (code: string) =>
  `data:text/javascript,${encodeURIComponent(code)}`;
const ENV = 'globalThis.__contactsAdapterEnv';

const NATIVE_MODULES: Record<string, string> = {
  '@react-native-async-storage/async-storage': `export default {
    getItem: async (k) => ${ENV}.storage.get(k) ?? null,
    setItem: async (k, v) => { ${ENV}.storage.set(k, v); },
    removeItem: async (k) => { ${ENV}.storage.delete(k); },
  };`,
  'expo-crypto': `export const getRandomBytesAsync = async (n) => {
    ${ENV}.randomFill += 1;
    return new Uint8Array(n).fill(${ENV}.randomFill);
  };`,
  '../config/firebaseConfig.android': `export const firebaseAuth = {
    get currentUser() { return ${ENV}.uid ? { uid: ${ENV}.uid } : null; },
    onAuthStateChanged(listener) {
      ${ENV}.authListener = listener;
      return () => {};
    },
  };`,
  '../config/appCheckBootstrap': `
    export const ensureAppCheckInitialized = async () => ({ status: ${ENV}.appCheck });
    export const getAppCheckInitStatus = () => ({ status: ${ENV}.appCheck });`,
  '../config/identityFunctions': `
    export const getIdentityFunctionsRegion = () => 'us-central1';
    export const getIdentityFunctions = () => ({
      httpsCallable: (name) => async (data) => {
        ${ENV}.calls.push({ name, data, uid: ${ENV}.uid });
        return { data: ${ENV}.respond(name, data) };
      },
    });`,
  '../alerts/reevaluateProximityNotices': `export const scheduleReevaluateProximityNotices = () => {
    ${ENV}.reevaluations += 1;
  };`,
};

registerHooks({
  resolve(specifier, context, next) {
    const code = NATIVE_MODULES[specifier];
    if (code) return { url: moduleSource(code), shortCircuit: true };
    return next(specifier, context);
  },
});

// contactsBook.android.ts loads expo-contacts with a guarded require().
(globalThis as any).require = (id: string) => {
  if (id !== 'expo-contacts') throw new Error(`unexpected require ${id}`);
  return {
    Fields: { Emails: 'emails', PhoneNumbers: 'phoneNumbers' },
    getPermissionsAsync: async () => ({ status: env.permission }),
    requestPermissionsAsync: async () => ({ status: env.permission }),
    getContactsAsync: async ({ pageSize, pageOffset }: any) => ({
      data: env.contacts.slice(pageOffset, pageOffset + pageSize),
      hasNextPage: pageOffset + pageSize < env.contacts.length,
    }),
  };
};

const LEGACY_KEY = 'nearsy.contacts.sourceId.v1';
const SOURCE_KEY = (uid: string) => `nearsy.contacts.sourceId.v2:${uid}`;
const STATE_KEY = (uid: string) => `nearsy.contacts.state.v1:${uid}`;
const LEGACY_SOURCE = 'legacyDeviceSource';

/** One Identity account per uid, following the contract at #27. */
const accounts = new Map<string, FakeIdentity>();
function account(uid: string): FakeIdentity {
  if (!accounts.has(uid)) accounts.set(uid, new FakeIdentity());
  return accounts.get(uid) as FakeIdentity;
}
function respondAsIdentity(name: string, data: any): unknown {
  return account(env.uid as string).call(name, data);
}
function callsNamed(name: string) {
  return env.calls.filter((c) => c.name === name);
}

function saved(uid: string) {
  return JSON.parse(env.storage.get(STATE_KEY(uid)) ?? 'null');
}

async function flush(): Promise<void> {
  await new Promise((done) => setTimeout(done, 5));
}

describe('Android adapter storage', () => {
  let adapter: typeof import('../contactsHmac/contactsHmac.android.ts');

  before(async () => {
    adapter = await import('../contactsHmac/contactsHmac.android.ts');
  });

  beforeEach(async () => {
    // A new session for every test, as a sign-out does in the app.
    env.uid = null;
    adapter.getContactsSyncStatus();
    env.authListener?.(null);
    env.storage.clear();
    accounts.clear();
    env.calls.length = 0;
    env.respond = respondAsIdentity;
    env.permission = 'granted';
    env.contacts = [{ emails: [{ email: 'ada@b.co' }] }];
    env.appCheck = 'ready';
    env.reevaluations = 0;
    env.randomFill = 0;
  });

  async function openMore(uid: string) {
    env.uid = uid;
    env.authListener?.({ uid });
    await adapter.bindContactsUserDoc(uid, account(uid).userDoc());
  }

  it('does not credit the device-wide source to the first account', async () => {
    env.storage.set(LEGACY_KEY, LEGACY_SOURCE);
    await openMore('uid-a');
    const op = await adapter.enableThenSyncContacts();
    assert.equal(op.status, 'ok');
    const sent = env.calls.find((c) => c.name === 'syncContactHashes');
    assert.notEqual(sent?.data.sourceId, LEGACY_SOURCE);
    assert.equal(env.storage.get(SOURCE_KEY('uid-a')), sent?.data.sourceId);
    assert.equal(env.storage.get(LEGACY_KEY), LEGACY_SOURCE, 'left untouched');
    await flush();
    assert.equal(saved('uid-a').sourceId, sent?.data.sourceId);
    assert.equal(saved('uid-a').lastAckedVersion, 1);
  });

  it('separates sources, versions and acks by account', async () => {
    await openMore('uid-a');
    await adapter.enableThenSyncContacts();
    await flush();
    const sourceA = saved('uid-a').sourceId;

    env.uid = 'uid-b';
    env.authListener?.({ uid: 'uid-b' });
    assert.equal(adapter.getContactsSyncStatus().snapshot, 'none');
    await openMore('uid-b');
    await adapter.enableThenSyncContacts();
    await flush();
    const sourceB = saved('uid-b').sourceId;

    assert.notEqual(sourceA, sourceB);
    assert.equal(saved('uid-a').sourceId, sourceA, 'A untouched by B');
    const callsAsB = env.calls.filter((c) => c.uid === 'uid-b');
    assert.ok(callsAsB.length >= 2);
    for (const call of callsAsB) {
      if (call.data.sourceId) assert.equal(call.data.sourceId, sourceB);
    }
  });

  it('keeps the source, versions and fences this account already proved it owns', async () => {
    env.storage.set(LEGACY_KEY, LEGACY_SOURCE);
    env.storage.set(
      STATE_KEY('uid-a'),
      JSON.stringify({
        sourceId: 'ownedSource1',
        contactsEpoch: 2,
        lastAckedVersion: 7,
        lastAckedFingerprint: 'fp1:0000000000000000',
        removedSnapshotFloor: 9,
      }),
    );
    account('uid-a').epoch = 2;
    await openMore('uid-a');
    await adapter.enableThenSyncContacts();
    const sent = env.calls.find((c) => c.name === 'syncContactHashes');
    assert.equal(sent?.data.sourceId, 'ownedSource1');
    assert.equal(sent?.data.snapshotVersion, 10, 'above the fence');
    assert.equal(env.storage.get(SOURCE_KEY('uid-a')), 'ownedSource1');
  });

  it('a late result of account A does not write to account B', async () => {
    await openMore('uid-a');
    let release: (v: unknown) => void = () => {};
    env.respond = (name, data) =>
      name === 'enableContactsSync'
        ? new Promise((done) => {
            release = done;
          })
        : respondAsIdentity(name, data);
    const first = adapter.enableThenSyncContacts();
    await flush();
    env.uid = 'uid-b';
    env.authListener?.({ uid: 'uid-b' });
    release(account('uid-a').wire({ result: 'enabled', contactsSyncEnabled: true }));
    assert.equal((await first).status, 'stale');
    await flush();
    assert.equal(env.storage.has(STATE_KEY('uid-b')), false);
    assert.equal(saved('uid-a')?.lastAckedVersion ?? null, null, 'no late write for A either');
    assert.equal(env.calls.filter((c) => c.name === 'syncContactHashes').length, 0);
  });

  it('App Check failure is its own cause and sends nothing', async () => {
    await openMore('uid-a');
    env.appCheck = 'error';
    const op = await adapter.enableThenSyncContacts();
    assert.equal(op.status, 'failed');
    assert.equal(
      op.status === 'failed' && adapter.contactsHmacErrorToI18nKey(op.error.reason),
      'appCheck',
    );
    assert.equal(env.calls.length, 0);
  });

  it('a book over the local ceiling is a cap, never a truncated success', async () => {
    await openMore('uid-a');
    env.contacts = Array.from({ length: 20_001 }, (_, i) => ({
      emails: [{ email: `u${i}@ex.co` }],
    }));
    const op = await adapter.enableThenSyncContacts();
    assert.equal(op.status, 'failed');
    assert.equal(
      op.status === 'failed' && op.error.reason,
      'contacts-identifier-cap',
    );
    assert.equal(env.calls.filter((c) => c.name === 'syncContactHashes').length, 0);
    assert.equal(adapter.getContactsSyncStatus().enablement, 'enabled');
    assert.equal(adapter.getContactsSyncStatus().snapshot, 'pending');
  });

  it('stores no address-book content on the device', async () => {
    await openMore('uid-a');
    await adapter.enableThenSyncContacts();
    await flush();
    assert.doesNotMatch(JSON.stringify([...env.storage.entries()]), /ada@b\.co/);
  });
});

describe('Android adapter on the contract of Identity #27', () => {
  let adapter: typeof import('../contactsHmac/contactsHmac.android.ts');
  const UID = 'uid-a';
  const later = () => new Promise((done) => setTimeout(done, 5));

  before(async () => {
    adapter = await import('../contactsHmac/contactsHmac.android.ts');
  });

  beforeEach(async () => {
    env.uid = null;
    adapter.getContactsSyncStatus();
    env.authListener?.(null);
    env.storage.clear();
    accounts.clear();
    env.calls.length = 0;
    env.respond = respondAsIdentity;
    env.permission = 'granted';
    env.contacts = [{ emails: [{ email: 'ada@b.co' }] }];
    env.appCheck = 'ready';
    env.reevaluations = 0;
    env.uid = UID;
    env.authListener?.({ uid: UID });
    await later();
  });

  const readAccount = () =>
    adapter.bindContactsUserDoc(UID, account(UID).userDoc());
  const status = () => adapter.getContactsSyncStatus();

  describe('More opens with the read still on its way', () => {
    it('is not shown as off, sends nothing, and keeps the screen usable', async () => {
      const before = status();
      assert.equal(before.stateConfirmed, false);
      assert.equal(adapter.contactsToggleLocked(before), true);
      assert.equal(adapter.contactsStatusCopyKey(before), 'status.confirming');
      assert.equal(adapter.contactsCanRetry(before), false);

      assert.equal((await adapter.enableThenSyncContacts()).status, 'not_ready');
      assert.equal((await adapter.retryContactsSync()).status, 'not_ready');
      assert.equal(env.calls.length, 0);

      await readAccount();
      const after = status();
      assert.equal(after.stateConfirmed, true);
      assert.equal(after.enablement, 'off');
      assert.equal(adapter.contactsToggleLocked(after), false);
    });

    it('an account already on shows on after the read, without any call', async () => {
      const identity = account(UID);
      identity.enabled = true;
      identity.epoch = 3;
      await readAccount();
      assert.equal(status().enablement, 'enabled');
      assert.equal(status().consent, false);
      assert.equal(env.calls.length, 0);
    });

    it('a read during an operation applies when it settles', async () => {
      await readAccount();
      let release: (v: unknown) => void = () => {};
      env.respond = (name, data) =>
        name === REFRESH
          ? new Promise((done) => {
              release = done;
            })
          : respondAsIdentity(name, data);
      env.authListener?.(null);
      env.authListener?.({ uid: UID });
      const refresh = adapter.refreshContactsActorKeys();
      await later();
      await readAccount();
      assert.equal(status().stateConfirmed, false, 'not while the call is open');
      release(account(UID).wire({ result: 'refreshed' }));
      await refresh;
      await later();
      assert.equal(status().stateConfirmed, true);
    });
  });

  describe('First enable', () => {
    it('reads the live epoch first, sends it, then syncs. It never assumes 0', async () => {
      const identity = account(UID);
      identity.epoch = 4;
      // The document has no usable field here: that is not epoch 0.
      await adapter.bindContactsUserDoc(UID, {
        contactsSyncEnabled: false,
        contactsEpoch: null,
      });
      assert.equal((await adapter.enableThenSyncContacts()).status, 'ok');
      assert.deepEqual(
        env.calls.map((c) => c.name),
        [REFRESH, ENABLE, SYNC],
      );
      assert.deepEqual(callsNamed(ENABLE)[0].data, { contactsEpoch: 4 });
      assert.equal(callsNamed(SYNC)[0].data.contactsEpoch, 4);
      assert.equal(status().snapshot, 'synced');
    });

    it('a read of the document is not a confirmed epoch', async () => {
      account(UID).epoch = 2;
      await readAccount();
      await adapter.enableThenSyncContacts();
      assert.equal(callsNamed(REFRESH).length, 1);
    });

    it('if the read cannot confirm, nothing is sent, and it does not poll', async () => {
      await readAccount();
      env.respond = (name, data) => {
        if (name === REFRESH) throw identityRejects('contacts-rate-limited');
        return respondAsIdentity(name, data);
      };
      assert.equal((await adapter.enableThenSyncContacts()).status, 'failed');
      assert.equal(callsNamed(ENABLE).length, 0);
      assert.equal(callsNamed(REFRESH).length, 1);
      await later();
      assert.equal(callsNamed(REFRESH).length, 1);
      assert.equal(status().enablement, 'off');
    });

    it('an account that reads on is not enabled again, and syncs', async () => {
      const identity = account(UID);
      identity.enabled = true;
      identity.epoch = 2;
      await adapter.bindContactsUserDoc(UID, {
        contactsSyncEnabled: false,
        contactsEpoch: 2,
      });
      assert.equal((await adapter.enableThenSyncContacts()).status, 'ok');
      assert.equal(callsNamed(ENABLE).length, 0);
      assert.equal(status().snapshot, 'synced');
    });
  });

  describe('Reactivation', () => {
    it('needs a new action and uses the epoch the disable returned', async () => {
      await readAccount();
      await adapter.enableThenSyncContacts();
      env.calls.length = 0;
      assert.equal((await adapter.disableContactsIntegration()).status, 'ok');
      assert.equal(status().enablement, 'off');
      assert.equal(status().consent, false);
      await later();
      assert.equal(callsNamed(ENABLE).length, 0, 'nothing turns it back on');
      await readAccount();
      await later();
      assert.equal(callsNamed(ENABLE).length, 0, 'not even re-opening More');

      assert.equal((await adapter.enableThenSyncContacts()).status, 'ok');
      assert.deepEqual(callsNamed(ENABLE)[0].data, { contactsEpoch: 1 });
      assert.equal(callsNamed(REFRESH).length, 0, 'the epoch was already confirmed');
      assert.equal(status().snapshot, 'synced');
    });

    it('never sends an enable without an epoch, on any path', async () => {
      await readAccount();
      await adapter.enableThenSyncContacts();
      await adapter.disableContactsIntegration();
      await adapter.enableThenSyncContacts();
      for (const call of callsNamed(ENABLE)) {
        assert.equal(typeof call.data.contactsEpoch, 'number');
      }
    });
  });

  describe('Mismatch', () => {
    it('reads the state, stays off and does not reactivate an old intent', async () => {
      await readAccount();
      await adapter.enableThenSyncContacts();
      await adapter.disableContactsIntegration();
      // Another install disabled again: this client's epoch is now old.
      account(UID).epoch = 9;
      env.calls.length = 0;
      const op = await adapter.enableThenSyncContacts();
      assert.equal(op.status, 'failed');
      assert.deepEqual(
        env.calls.map((c) => c.name),
        [ENABLE, REFRESH],
      );
      assert.equal(status().enablement, 'off');
      assert.equal(status().errorKey, 'epochMismatch');
      assert.equal(status().consent, false);
      assert.equal(account(UID).enabled, false);
      await later();
      assert.equal(saved(UID).contactsEpoch, 9);

      // A new action, with the epoch that read returned.
      env.calls.length = 0;
      assert.equal((await adapter.enableThenSyncContacts()).status, 'ok');
      assert.deepEqual(callsNamed(ENABLE)[0].data, { contactsEpoch: 9 });
    });

    it('on a sync: reads off, stops, and never re-enables', async () => {
      await readAccount();
      await adapter.enableThenSyncContacts();
      const identity = account(UID);
      identity.enabled = false;
      identity.epoch = 5;
      env.contacts = [{ emails: [{ email: 'new@b.co' }] }];
      env.calls.length = 0;
      await adapter.retryContactsSync();
      assert.equal(callsNamed(ENABLE).length, 0);
      assert.equal(identity.enabled, false);
      assert.equal(status().enablement, 'off');
      assert.equal(status().consent, false);
    });

    it('on a sync: reads on, and uploads once at the live epoch', async () => {
      await readAccount();
      env.respond = (name, data) => {
        if (name === SYNC) throw identityRejects('contacts-rate-limited');
        return respondAsIdentity(name, data);
      };
      await adapter.enableThenSyncContacts();
      const identity = account(UID);
      identity.epoch = 5; // Moved on by another install, still on.
      env.respond = respondAsIdentity;
      env.calls.length = 0;
      assert.equal((await adapter.retryContactsSync()).status, 'ok');
      assert.deepEqual(
        env.calls.map((c) => c.name),
        [SYNC, REFRESH, SYNC],
      );
      assert.equal(callsNamed(SYNC)[1].data.contactsEpoch, 5);
      assert.equal(callsNamed(ENABLE).length, 0);
      assert.equal(status().snapshot, 'synced');
    });

    it('when the read does not answer, the result stays pending and later reads first', async () => {
      await readAccount();
      env.respond = (name, data) => {
        if (name === SYNC) throw identityRejects('contacts-rate-limited');
        return respondAsIdentity(name, data);
      };
      await adapter.enableThenSyncContacts();
      account(UID).epoch = 5;
      env.respond = (name, data) => {
        if (name === REFRESH) throw identityRejects('contacts-rate-limited');
        return respondAsIdentity(name, data);
      };
      await adapter.retryContactsSync();
      assert.equal(status().enablement, 'enabled', 'not declared off without proof');
      assert.equal(status().snapshot, 'pending');

      // Retrying a sync is not a request to turn on: reads off, stays off.
      account(UID).enabled = false;
      env.respond = respondAsIdentity;
      env.calls.length = 0;
      await adapter.retryContactsSync();
      assert.deepEqual(env.calls.map((c) => c.name), [REFRESH]);
      assert.equal(status().enablement, 'off');
      assert.equal(account(UID).enabled, false);
    });

    it('recognizes contacts-epoch-required as recoverable, with its own copy', () => {
      assert.equal(
        adapter.contactsHmacErrorToI18nKey('contacts-epoch-required'),
        'epochRequired',
      );
    });
  });

  describe('Remove', () => {
    it('sends the highest version sent in this epoch', async () => {
      await readAccount();
      await adapter.enableThenSyncContacts();
      env.permission = 'denied';
      env.calls.length = 0;
      await adapter.retryContactsSync();
      assert.equal(callsNamed(REMOVE)[0].data.knownSnapshotVersion, 1);
      assert.equal(status().snapshot, 'pending');
    });

    it('includes an uncertain upload, which fences it while in flight', async () => {
      await readAccount();
      env.respond = (name, data) => {
        if (name === SYNC) {
          throw Object.assign(new Error('network'), { code: 'functions/unavailable' });
        }
        return respondAsIdentity(name, data);
      };
      await adapter.enableThenSyncContacts();
      assert.equal(status().snapshot, 'uncertain');
      env.respond = respondAsIdentity;
      env.permission = 'denied';
      env.calls.length = 0;
      await adapter.retryContactsSync();
      assert.equal(callsNamed(REMOVE)[0].data.knownSnapshotVersion, 1);
      assert.equal(account(UID).fences.get(callsNamed(REMOVE)[0].data.sourceId), 1);
    });

    it('with nothing sent in this epoch it says 0', async () => {
      env.permission = 'denied';
      await readAccount();
      await adapter.enableThenSyncContacts();
      assert.equal(callsNamed(REMOVE)[0].data.knownSnapshotVersion, 0);
    });

    it('superseded is not a withdrawal: raises the version, keeps the intent, retries once', async () => {
      await readAccount();
      env.respond = (name, data) => {
        if (name === SYNC) throw identityRejects('contacts-rate-limited');
        return respondAsIdentity(name, data);
      };
      await adapter.enableThenSyncContacts();
      const identity = account(UID);
      const sourceId = saved(UID).sourceId;
      identity.sources.set(sourceId, { version: 7, fingerprint: 'fp1:other' });
      env.respond = respondAsIdentity;
      env.permission = 'denied';
      env.calls.length = 0;
      await adapter.retryContactsSync();
      const removes = callsNamed(REMOVE);
      assert.equal(removes.length, 2);
      assert.equal(removes[0].data.knownSnapshotVersion, 1);
      assert.equal(removes[1].data.knownSnapshotVersion, 7);
      assert.equal(identity.sources.has(sourceId), false);
      assert.equal(status().snapshot, 'pending');
      await later();
      assert.ok(saved(UID).removedSnapshotFloor >= 7, 'next upload goes above it');
    });

    it('still superseded after that: not shown as removed, not synced, no loop', async () => {
      await readAccount();
      env.respond = (name, data) => {
        if (name === SYNC) throw identityRejects('contacts-rate-limited');
        return respondAsIdentity(name, data);
      };
      await adapter.enableThenSyncContacts();
      const sourceId = saved(UID).sourceId;
      env.respond = (name, data) => {
        if (name !== REMOVE) return respondAsIdentity(name, data);
        return account(UID).wire({
          result: 'superseded',
          sourceId,
          snapshotVersion: 9,
        });
      };
      env.permission = 'denied';
      env.calls.length = 0;
      assert.equal((await adapter.retryContactsSync()).status, 'ok');
      assert.equal(callsNamed(REMOVE).length, 2);
      assert.equal(status().snapshot, 'pending');
      await later();
      const state = saved(UID);
      assert.equal(state.highestAttemptedVersion, 9, 'raised');
      assert.equal(state.lastAckedVersion, null);
      assert.equal(state.uncertainOp, null);
    });
  });

  describe('Lost reply', () => {
    it('enable: retried with the same body, and it answers enabled', async () => {
      await readAccount();
      let lost = true;
      env.respond = (name, data) => {
        const reply = respondAsIdentity(name, data);
        if (name === ENABLE && lost) {
          lost = false;
          throw Object.assign(new Error('network'), { code: 'functions/unavailable' });
        }
        return reply;
      };
      assert.equal((await adapter.enableThenSyncContacts()).status, 'uncertain');
      assert.equal(status().enablement, 'enable_uncertain');
      assert.equal((await adapter.retryContactsSync()).status, 'ok');
      const enables = callsNamed(ENABLE);
      assert.deepEqual(enables[0].data, enables[1].data);
      assert.equal(status().snapshot, 'synced');
      assert.equal(env.reevaluations >= 1, true, 'owed from the lost reply');
    });

    it('disable: the retry reads off and is done, with no second barrier', async () => {
      await readAccount();
      await adapter.enableThenSyncContacts();
      let lost = true;
      env.respond = (name, data) => {
        const reply = respondAsIdentity(name, data);
        if (name === DISABLE && lost) {
          lost = false;
          throw Object.assign(new Error('network'), { code: 'functions/unavailable' });
        }
        return reply;
      };
      assert.equal((await adapter.disableContactsIntegration()).status, 'uncertain');
      assert.equal(status().enablement, 'disable_uncertain');
      env.reevaluations = 0;
      assert.equal((await adapter.retryContactsSync()).status, 'ok');
      assert.equal(status().enablement, 'off');
      assert.equal(account(UID).epoch, 1);
      assert.equal(env.reevaluations, 1, 'owed from the lost reply');
    });

  });

  describe('Turning off during an operation', () => {
    it('cancels the enable: its reply starts no upload and brings no consent back', async () => {
      await readAccount();
      let release: (v: unknown) => void = () => {};
      env.respond = (name, data) => {
        if (name !== ENABLE) return respondAsIdentity(name, data);
        const reply = account(UID).commit(name, data);
        return new Promise((done) => {
          release = () => done(reply);
        });
      };
      const enabling = adapter.enableThenSyncContacts();
      await later();
      assert.equal(status().operation, 'enable');
      assert.equal(adapter.contactsToggleLocked(status()), false, 'can be turned off');

      const disabling = adapter.disableContactsIntegration();
      assert.equal(adapter.contactsToggleLocked(status()), true, 'no second disable');
      assert.equal((await disabling).status, 'ok');
      release(undefined);
      assert.equal((await enabling).status, 'cancelled');
      await later();

      assert.equal(callsNamed(SYNC).length, 0, 'no upload');
      assert.equal(status().enablement, 'off');
      assert.equal(status().consent, false);
      assert.equal(account(UID).enabled, false);
      assert.equal(saved(UID).userConsent, false);
      assert.equal(saved(UID).contactsEpoch, 1);
    });

    it('cancels at the permission prompt: the book is not read', async () => {
      await readAccount();
      let answer: (v: unknown) => void = () => {};
      const original = (globalThis as any).require;
      (globalThis as any).require = (id: string) => ({
        ...original(id),
        requestPermissionsAsync: () =>
          new Promise((done) => {
            answer = () => done({ status: 'granted' });
          }),
        getContactsAsync: async () => {
          throw new Error('must not read the book');
        },
      });
      try {
        const enabling = adapter.enableThenSyncContacts();
        await later();
        assert.equal(status().stage, 'permission');
        assert.equal((await adapter.disableContactsIntegration()).status, 'ok');
        answer(undefined);
        assert.equal((await enabling).status, 'cancelled');
        assert.equal(callsNamed(SYNC).length, 0);
      } finally {
        (globalThis as any).require = original;
      }
    });

    it('a late reply of a timed-out enable only raises the epoch, and asks for a reevaluate', async () => {
      await readAccount();
      await adapter.enableThenSyncContacts();
      await adapter.disableContactsIntegration();
      env.calls.length = 0;
      env.reevaluations = 0;
      let release: (v: unknown) => void = () => {};
      env.respond = (name, data) => {
        if (name !== ENABLE) return respondAsIdentity(name, data);
        return new Promise((done) => {
          release = done;
        });
      };
      const enabling = adapter.enableThenSyncContacts();
      await later();
      await adapter.disableContactsIntegration();
      release(
        account(UID).wire({
          result: 'enabled',
          contactsSyncEnabled: true,
          contactsEpoch: 8,
          reevaluateRequired: true,
        }),
      );
      assert.equal((await enabling).status, 'cancelled');
      await later();
      assert.equal(status().enablement, 'off');
      assert.equal(callsNamed(SYNC).length, 0);
      assert.equal(saved(UID).contactsEpoch, 8);
      assert.ok(env.reevaluations >= 1);
    });

    it('an older reply cannot lower the stored epoch', async () => {
      await readAccount();
      await adapter.enableThenSyncContacts();
      await adapter.disableContactsIntegration();
      await adapter.bindContactsUserDoc(UID, {
        contactsSyncEnabled: false,
        contactsEpoch: 0,
      });
      await later();
      assert.equal(saved(UID).contactsEpoch, 1);
    });

    it('a disable keeps reevaluate pending for this account', async () => {
      await readAccount();
      await adapter.enableThenSyncContacts();
      env.reevaluations = 0;
      await adapter.disableContactsIntegration();
      assert.equal(env.reevaluations, 1);
    });
  });

  describe('A pending disable across restarts', () => {
    const network = () =>
      Object.assign(new Error('network'), { code: 'functions/unavailable' });
    /** Same account, new process: what is on the device is all that remains. */
    function restart() {
      env.authListener?.(null);
      env.authListener?.({ uid: UID });
    }
    async function enabledThenLostDisable(commit: boolean) {
      await readAccount();
      await adapter.enableThenSyncContacts();
      env.respond = (name, data) => {
        if (name !== DISABLE) return respondAsIdentity(name, data);
        if (commit) void respondAsIdentity(name, data);
        throw network();
      };
      assert.equal((await adapter.disableContactsIntegration()).status, 'uncertain');
      await later();
      env.respond = respondAsIdentity;
      env.calls.length = 0;
    }

    it('is on the device, per account, before anything is sent', async () => {
      await readAccount();
      await adapter.enableThenSyncContacts();
      await later();
      let atSend: any = null;
      env.respond = (name, data) => {
        if (name === DISABLE) atSend = saved(UID);
        return respondAsIdentity(name, data);
      };
      await adapter.disableContactsIntegration();
      assert.equal(atSend.uncertainOp, 'disable');
      assert.equal(atSend.userConsent, false);
      assert.equal(atSend.pendingUpload, null);
    });

    it('survives a failure before sending too', async () => {
      await readAccount();
      await adapter.enableThenSyncContacts();
      env.appCheck = 'error';
      await adapter.disableContactsIntegration();
      await later();
      assert.equal(saved(UID).uncertainOp, 'disable');
      assert.equal(env.calls.filter((c) => c.name === DISABLE).length, 0);
    });

    it('after a restart it blocks enable and sync, and is not shown as done', async () => {
      await enabledThenLostDisable(false);
      restart();
      await readAccount();
      await later();
      const shown = status();
      assert.equal(shown.enablement, 'disable_uncertain');
      assert.equal(shown.consent, false);
      assert.equal(adapter.contactsStatusCopyKey(shown), 'status.disableUncertain');
      assert.equal((await adapter.enableThenSyncContacts()).status, 'not_ready');
      assert.equal(env.calls.length, 0, 'not even a resend');
    });

    it('if the server is already off, the read completes it', async () => {
      await enabledThenLostDisable(true);
      restart();
      await readAccount();
      await later();
      assert.equal(status().enablement, 'off');
      assert.equal(saved(UID).uncertainOp, null);
      assert.equal(env.calls.length, 0);
      assert.ok(env.reevaluations >= 1, 'owed from the lost reply');
    });

    it('if the server is on, it waits for an explicit retry and sends nothing by itself', async () => {
      await enabledThenLostDisable(false);
      restart();
      await readAccount();
      await later();
      assert.equal(env.calls.length, 0);
      assert.equal(account(UID).enabled, true);
      assert.equal(adapter.contactsCanRetry(status()), true);
      assert.equal((await adapter.retryContactsSync()).status, 'ok');
      assert.equal(account(UID).enabled, false);
      assert.equal(status().enablement, 'off');
    });

    it('on at a later epoch may be a new activation: it reads and stops', async () => {
      await enabledThenLostDisable(true);
      // Another device turned it back on: the lost disable did land before that.
      const identity = account(UID);
      identity.enabled = true;
      identity.epoch = 4;
      env.calls.length = 0;
      assert.equal((await adapter.retryContactsSync()).status, 'failed');
      assert.deepEqual(
        env.calls.map((c) => c.name),
        [DISABLE, REFRESH],
      );
      assert.equal(identity.enabled, true, 'that activation is untouched');
      const shown = status();
      assert.equal(shown.enablement, 'disable_uncertain');
      assert.equal(adapter.contactsStatusCopyKey(shown), 'errors.epochMismatch');
      await later();
      assert.equal(saved(UID).contactsEpoch, 4);
      assert.equal(saved(UID).uncertainOp, 'disable');

      // The user sees it and asks again: now it applies, at the epoch just read.
      env.calls.length = 0;
      assert.equal((await adapter.retryContactsSync()).status, 'ok');
      assert.deepEqual(env.calls.map((c) => c.name), [DISABLE]);
      assert.equal(env.calls[0].data.contactsEpoch, 4);
      assert.equal(identity.enabled, false);
    });

    it('a read at a later epoch that is still on does not send a disable either', async () => {
      await enabledThenLostDisable(true);
      const identity = account(UID);
      identity.enabled = true;
      identity.epoch = 4;
      restart();
      await readAccount();
      await later();
      assert.equal(env.calls.length, 0);
      assert.equal(status().enablement, 'disable_uncertain');
      assert.equal(identity.enabled, true);
    });

    it('a cached off at the same epoch does not declare it done', async () => {
      await enabledThenLostDisable(false);
      restart();
      await adapter.bindContactsUserDoc(UID, {
        contactsSyncEnabled: false,
        contactsEpoch: 0,
      });
      assert.equal(status().enablement, 'disable_uncertain');
    });

    it('belongs to its account', async () => {
      await enabledThenLostDisable(false);
      env.uid = 'uid-b';
      env.authListener?.({ uid: 'uid-b' });
      await adapter.bindContactsUserDoc('uid-b', account('uid-b').userDoc());
      assert.equal(status().enablement, 'off');
      assert.equal((await adapter.enableThenSyncContacts()).status, 'ok');
      assert.equal(account(UID).enabled, true);
    });
  });

  describe('Sync after a mismatch', () => {
    /** Enabled with a pending upload, and the epoch moved on by another install. */
    async function pendingBehindLiveEpoch() {
      await readAccount();
      env.respond = (name, data) => {
        if (name === SYNC) throw identityRejects('contacts-rate-limited');
        return respondAsIdentity(name, data);
      };
      await adapter.enableThenSyncContacts();
      account(UID).epoch = 5;
      env.calls.length = 0;
      let answer: (v: unknown) => void = () => {};
      env.respond = (name, data) => {
        if (name !== REFRESH) return respondAsIdentity(name, data);
        return new Promise((done) => {
          answer = () => done(account(UID).wire({ result: 'refreshed' }));
        });
      };
      const retry = adapter.retryContactsSync();
      await later();
      assert.equal(callsNamed(REFRESH).length, 1);
      return { retry, answer: () => answer(undefined) };
    }
    const syncsAfterMismatch = () => callsNamed(SYNC).length - 1;

    it('goes out once when everything is still in force', async () => {
      const { retry, answer } = await pendingBehindLiveEpoch();
      answer();
      assert.equal((await retry).status, 'ok');
      assert.equal(syncsAfterMismatch(), 1);
    });

    it('not after turning off', async () => {
      const { retry, answer } = await pendingBehindLiveEpoch();
      env.respond = respondAsIdentity;
      await adapter.disableContactsIntegration();
      answer();
      assert.equal((await retry).status, 'cancelled');
      assert.equal(syncsAfterMismatch(), 0);
      assert.equal(status().consent, false);
    });

    it('not after signing out', async () => {
      const { retry, answer } = await pendingBehindLiveEpoch();
      env.uid = null;
      env.authListener?.(null);
      answer();
      assert.equal((await retry).status, 'stale');
      assert.equal(syncsAfterMismatch(), 0);
    });

    it('not under another account', async () => {
      const { retry, answer } = await pendingBehindLiveEpoch();
      env.uid = 'uid-b';
      env.authListener?.({ uid: 'uid-b' });
      answer();
      assert.equal((await retry).status, 'stale');
      assert.equal(syncsAfterMismatch(), 0);
      assert.equal(env.calls.filter((c) => c.uid === 'uid-b').length, 0);
    });

    it('not if the OS permission went away, and nothing is withdrawn or prompted', async () => {
      const { retry, answer } = await pendingBehindLiveEpoch();
      env.permission = 'denied';
      answer();
      assert.equal((await retry).status, 'failed');
      assert.equal(syncsAfterMismatch(), 0);
      assert.equal(callsNamed(REMOVE).length, 0);
      assert.equal(status().snapshot, 'pending');
    });

    it('the automatic resend does not re-enable and stops on off', async () => {
      env.respond = (name, data) => {
        if (name === SYNC) {
          throw Object.assign(new Error('network'), { code: 'functions/unavailable' });
        }
        return respondAsIdentity(name, data);
      };
      await readAccount();
      await adapter.enableThenSyncContacts();
      env.respond = respondAsIdentity;
      const identity = account(UID);
      identity.enabled = false;
      identity.epoch = 5;
      env.authListener?.(null);
      env.authListener?.({ uid: UID });
      env.calls.length = 0;
      await adapter.bindContactsUserDoc(UID, { contactsSyncEnabled: true, contactsEpoch: 0 });
      await later();
      assert.equal(callsNamed(ENABLE).length, 0);
      assert.equal(identity.enabled, false);
      assert.equal(status().enablement, 'off');
    });
  });

  describe('The first read fails', () => {
    it('offers only a read again, and keeps everything else locked', async () => {
      adapter.expectContactsUserDocRead(UID);
      assert.equal(adapter.contactsStatusCopyKey(status()), 'status.confirming');
      assert.equal(adapter.contactsCanRetryRead(status()), false);

      adapter.reportContactsUserDocReadFailed(UID);
      const failed = status();
      assert.equal(adapter.contactsStatusCopyKey(failed), 'status.readFailed');
      assert.equal(adapter.contactsCanRetryRead(failed), true);
      assert.equal(adapter.contactsCanRetry(failed), false);
      assert.equal(adapter.contactsToggleLocked(failed), true);
      assert.equal((await adapter.enableThenSyncContacts()).status, 'not_ready');
      assert.equal((await adapter.retryContactsSync()).status, 'not_ready');
      assert.equal((await adapter.disableContactsIntegration()).status, 'not_ready');
      assert.equal(env.calls.length, 0);
    });

    it('reading again recovers, and sends and prompts nothing', async () => {
      adapter.reportContactsUserDocReadFailed(UID);
      adapter.expectContactsUserDocRead(UID);
      assert.equal(adapter.contactsStatusCopyKey(status()), 'status.confirming');
      await adapter.bindContactsUserDoc(UID, account(UID).userDoc(), { readOnly: true });
      await later();
      assert.equal(status().stateConfirmed, true);
      assert.equal(status().readFailed, false);
      assert.equal(env.calls.length, 0);
    });

    it('that read does not resend an upload, even if one is owed', async () => {
      env.respond = (name, data) => {
        if (name === SYNC) {
          throw Object.assign(new Error('network'), { code: 'functions/unavailable' });
        }
        return respondAsIdentity(name, data);
      };
      await readAccount();
      await adapter.enableThenSyncContacts();
      env.respond = respondAsIdentity;
      env.authListener?.(null);
      env.authListener?.({ uid: UID });
      env.calls.length = 0;
      adapter.reportContactsUserDocReadFailed(UID);
      await adapter.bindContactsUserDoc(UID, account(UID).userDoc(), { readOnly: true });
      await later();
      assert.equal(env.calls.length, 0);
      assert.equal(status().snapshot, 'uncertain');
    });

    it('a late read that succeeds still applies', async () => {
      adapter.reportContactsUserDocReadFailed(UID);
      await readAccount();
      assert.equal(status().stateConfirmed, true);
      assert.equal(adapter.contactsCanRetryRead(status()), false);
    });
  });

  describe('Account change and remount', () => {
    it('a new account never receives the previous epoch or intent', async () => {
      await readAccount();
      await adapter.enableThenSyncContacts();
      await adapter.disableContactsIntegration();
      await later();
      assert.equal(saved(UID).contactsEpoch, 1);

      env.uid = 'uid-b';
      env.authListener?.({ uid: 'uid-b' });
      await adapter.bindContactsUserDoc('uid-b', {
        contactsSyncEnabled: false,
        contactsEpoch: null,
      });
      env.calls.length = 0;
      await adapter.enableThenSyncContacts();
      assert.deepEqual(env.calls[0].name, REFRESH, 'its epoch is not known');
      assert.deepEqual(callsNamed(ENABLE)[0].data, { contactsEpoch: 0 });
      assert.equal(saved(UID).contactsEpoch, 1);
    });

    it('a remount or a language change repeats nothing', async () => {
      env.respond = (name, data) => {
        if (name === SYNC) {
          throw Object.assign(new Error('network'), { code: 'functions/unavailable' });
        }
        return respondAsIdentity(name, data);
      };
      await readAccount();
      await adapter.enableThenSyncContacts();
      assert.equal(status().snapshot, 'uncertain');
      env.calls.length = 0;
      for (let i = 0; i < 3; i += 1) {
        await readAccount();
        await later();
      }
      assert.ok(env.calls.length <= 1, 'at most the one automatic resend');
      assert.equal(callsNamed(ENABLE).length, 0);
      assert.equal(callsNamed(REFRESH).length, 0);
    });

    it('a remount does not recover an intent that was cancelled', async () => {
      await readAccount();
      env.respond = (name, data) => {
        if (name === SYNC) {
          throw Object.assign(new Error('network'), { code: 'functions/unavailable' });
        }
        return respondAsIdentity(name, data);
      };
      await adapter.enableThenSyncContacts();
      env.respond = respondAsIdentity;
      await adapter.disableContactsIntegration();
      await later();
      assert.equal(saved(UID).pendingUpload, null);
      env.authListener?.(null);
      env.authListener?.({ uid: UID });
      env.calls.length = 0;
      await readAccount();
      await later();
      assert.equal(env.calls.length, 0, 'nothing is resumed');
      assert.equal(status().enablement, 'off');
    });

    it('reconciliation asks for no permission and reads no book without a grant', async () => {
      env.respond = (name, data) => {
        if (name === SYNC) {
          throw Object.assign(new Error('network'), { code: 'functions/unavailable' });
        }
        return respondAsIdentity(name, data);
      };
      await readAccount();
      await adapter.enableThenSyncContacts();
      env.respond = respondAsIdentity;
      env.permission = 'undetermined';
      env.authListener?.(null);
      env.authListener?.({ uid: UID });
      env.calls.length = 0;
      await readAccount();
      await later();
      assert.equal(env.calls.length, 0);
      assert.equal(status().snapshot, 'uncertain');
    });
  });
});

describe('Adapter and stub stay aligned', () => {
  it('export the same runtime API', async () => {
    const android = await import('../contactsHmac/contactsHmac.android.ts');
    const stub = await import('../contactsHmac/contactsHmac.ts');
    const onlyAndroid = new Set(['CONTACTS_CALLABLE_TIMEOUT_MS']);
    const androidKeys = Object.keys(android).filter((k) => !onlyAndroid.has(k)).sort();
    assert.deepEqual(androidKeys, Object.keys(stub).sort());
  });

  it('the stub never reports a working integration', async () => {
    const stub = await import('../contactsHmac/contactsHmac.ts');
    assert.equal(stub.contactsHmacAvailable(), false);
    assert.equal(stub.getContactsSyncStatus().enablement, 'off');
    assert.equal((await stub.enableThenSyncContacts()).status, 'failed');
  });
});

/**
 * Proves the diagnostic only observes. Each scenario runs twice over the same
 * Identity double: once with the f5053a4 composition reproduced below, once
 * with the traced composer and ports. Calls, order and outcomes must match.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createAppCheckBootstrap } from '../authentication/linkedinA3/appCheck/appCheckBootstrap';
import { createContactsHmacCallableClient } from '../contacts/adapter';
import { invokeContactsHmacCallableHttp } from '../contacts/contactsCallableHttp';
import { createContactsClientComposer } from '../contacts/contactsClientComposition';
import {
  createContactsOperationTrace,
  traceContactsAddressBook,
  traceContactsSession,
} from '../contacts/contactsDiagnostics';
import {
  createContactsOperationRunner,
  driveContactsOperation,
  type ContactsOutcomeView,
} from '../contacts/contactsOperationCoordinator';
import {
  disableContactsSyncFlow,
  enableAndSyncContacts,
} from '../contacts/controller';
import { createMemoryContactsSessionStore } from '../contacts/fakeClient';
import type {
  ContactsAddressBookPort,
  ContactsHmacClient,
  ContactsPermissionStatus,
  ContactsSessionStore,
} from '../contacts/port';

type Scenario = {
  permission?: ContactsPermissionStatus;
  afterRequest?: ContactsPermissionStatus;
  seedEpoch?: number | null;
  enabled?: boolean;
  /** How many forced App Check tokens fail before one succeeds. */
  forcedFailures?: number;
  respond?: (name: string) => Response | Error | null;
  cancelAfterPermission?: boolean;
  kind?: 'enable' | 'disable';
  toggles?: number;
};

function reply(name: string, enabled: boolean, epoch: number): Response {
  const results: Record<string, unknown> = {
    refreshVerifiedActorKeys: { result: 'refreshed', keyCount: 1 },
    enableContactsSync: { result: 'enabled', keyCount: 1 },
    disableContactsSync: { result: 'disabled' },
    syncContactHashes: {
      result: 'synced',
      sourceId: 'src_00000000000000000000000000000000',
      snapshotVersion: 1,
      identifierCount: 1,
    },
    removeContactSource: { result: 'removed' },
  };
  return new Response(
    JSON.stringify({
      result: {
        contactsSyncEnabled: enabled,
        contactsEpoch: epoch,
        notifyNearbyContactsEffective: enabled,
        syncCommitted: true,
        reevaluateRequired: false,
        ...(results[name] as object),
      },
    }),
    { status: 200 },
  );
}

function world(scenario: Scenario) {
  const log: string[] = [];
  let remainingForcedFailures = scenario.forcedFailures ?? 0;
  let enabled = scenario.enabled ?? false;
  const epoch = 2;

  const fetchImpl = (async (url: unknown, init?: RequestInit) => {
    const name = String(url).split('/').pop() as string;
    log.push(`fetch:${name}:${init?.method}:${String(init?.body)}`);
    const custom = scenario.respond?.(name);
    if (custom instanceof Error) throw custom;
    if (custom) return custom;
    if (name === 'enableContactsSync') enabled = true;
    if (name === 'disableContactsSync') enabled = false;
    return reply(name, enabled, epoch);
  }) as typeof fetch;

  const port = {
    initialize: async () => {
      log.push('app_check:initialize');
    },
    ensureToken: async () => {
      log.push('app_check:force');
      if (remainingForcedFailures > 0) {
        remainingForcedFailures -= 1;
        throw new Error('forced token failed');
      }
    },
    withToken: async <T,>(fn: (token: string) => Promise<T>): Promise<T> => {
      log.push('app_check:token');
      return fn('app-check-token');
    },
  };
  const native = async () => {
    log.push('app_check:create_port');
    return { port, getNativeProjectId: () => 'nearsy-pj' };
  };
  const user = {
    getIdToken: async () => {
      log.push('auth:id_token');
      return 'id-token';
    },
  };

  const memory = createMemoryContactsSessionStore({
    sourceId: null,
    contactsEpoch: scenario.seedEpoch ?? null,
  });
  const session: ContactsSessionStore = {
    load: () => {
      log.push('session:load');
      return memory.load();
    },
    update: (mutate) => {
      log.push('session:update');
      return memory.update(mutate);
    },
    save: (snapshot) => {
      log.push('session:save');
      return memory.save(snapshot);
    },
    clearFingerprint: () => {
      log.push('session:clear_fingerprint');
      return memory.clearFingerprint();
    },
    forgetEpoch: () => {
      log.push('session:forget_epoch');
      return memory.forgetEpoch();
    },
  };

  let cancelled = false;
  const book: ContactsAddressBookPort = {
    getPermission: async () => {
      log.push('permission:read');
      if (scenario.cancelAfterPermission) cancelled = true;
      return scenario.permission ?? 'granted';
    },
    requestPermission: async () => {
      log.push('permission:request');
      return scenario.afterRequest ?? 'granted';
    },
    readRows: async () => {
      log.push('contacts:read');
      return [{ phoneNumbers: [{ number: '+573001234567' }], emails: [] }];
    },
  };

  return { log, fetchImpl, port, native, user, session, book, isCancelled: () => cancelled };
}

type World = ReturnType<typeof world>;

/** iosContactsFoundation.ios.ts at f5053a4, without config lookups. */
function baselineGetClient(w: World) {
  let clientPromise: Promise<ContactsHmacClient> | null = null;
  return () => {
    if (!clientPromise) {
      clientPromise = (async () => {
        const { port, getNativeProjectId } = await w.native();
        assert.equal(getNativeProjectId(), 'nearsy-pj');
        const appCheck = createAppCheckBootstrap({ port });
        await appCheck.initialize();
        return createContactsHmacCallableClient({
          invoke: async (name, data) => {
            appCheck.ensureReady();
            const idToken = await w.user.getIdToken();
            return port.withToken((appCheckToken) =>
              invokeContactsHmacCallableHttp(
                {
                  projectId: 'nearsy-pj',
                  region: 'us-central1',
                  environment: 'production',
                  functionName: name,
                  idToken,
                  appCheckToken,
                  data,
                },
                { fetchImpl: w.fetchImpl },
              ),
            );
          },
        });
      })().catch((err) => {
        clientPromise = null;
        throw err;
      });
    }
    return clientPromise;
  };
}

async function runToggles(
  scenario: Scenario,
  mode: 'baseline' | 'traced',
) {
  const w = world(scenario);
  const composer = createContactsClientComposer({
    resolveEnvironment: () => ({
      environment: 'production',
      firebaseProjectId: 'nearsy-pj',
      region: 'us-central1',
    }),
    readJsProjectId: () => 'nearsy-pj',
    createNativeAppCheckPort: w.native,
    getCurrentUser: () => w.user,
    fetchImpl: w.fetchImpl,
  });
  const getBaselineClient = baselineGetClient(w);
  const runner = createContactsOperationRunner();
  const views: ContactsOutcomeView[] = [];
  const outcomes: unknown[] = [];

  for (let i = 0; i < (scenario.toggles ?? 1); i += 1) {
    const trace = createContactsOperationTrace();
    await driveContactsOperation({
      runner,
      uid: 'u1',
      kind: scenario.kind ?? 'enable',
      previousEnabled: scenario.enabled ?? false,
      waitMs: 2000,
      task: async () => {
        const client =
          mode === 'traced' ? await composer.getClient(trace) : await getBaselineClient();
        const ports = {
          client,
          session: mode === 'traced' ? traceContactsSession(w.session, trace) : w.session,
          book: mode === 'traced' ? traceContactsAddressBook(w.book, trace) : w.book,
          isCancelled: w.isCancelled,
          createRandomHex: () => '0123456789abcdef0123456789abcdef',
          sleep: async () => {},
        };
        const outcome =
          scenario.kind === 'disable'
            ? await disableContactsSyncFlow(ports)
            : await enableAndSyncContacts(ports);
        outcomes.push(outcome);
        return outcome;
      },
      isActive: () => true,
      readServerState: async () => ({ enabled: false, notifyNearbyContacts: false }),
      onView: (view) => views.push(view),
    });
  }
  return { log: w.log, views, outcomes };
}

async function assertParity(scenario: Scenario) {
  const baseline = await runToggles(scenario, 'baseline');
  const traced = await runToggles(scenario, 'traced');
  assert.deepEqual(traced.log, baseline.log);
  assert.deepEqual(traced.views, baseline.views);
  assert.deepEqual(traced.outcomes, baseline.outcomes);
  return traced;
}

const count = (log: string[], entry: string) =>
  log.filter((line) => line === entry).length;
const fetches = (log: string[]) =>
  log
    .filter((line) => line.startsWith('fetch:'))
    .map((line) => line.split(':')[1]);

describe('Contacts diagnostic parity with f5053a4', () => {
  it('first enable: same order, one bootstrap, one token and request per call', async () => {
    const { log } = await assertParity({});
    assert.deepEqual(log.slice(0, 6), [
      'app_check:create_port',
      'app_check:initialize',
      'app_check:force',
      'session:load',
      'permission:read',
      'session:load',
    ]);
    assert.equal(count(log, 'app_check:create_port'), 1);
    assert.equal(count(log, 'app_check:initialize'), 1);
    assert.equal(count(log, 'app_check:force'), 1);
    const sent = fetches(log);
    assert.deepEqual(sent.slice(0, 2), ['refreshVerifiedActorKeys', 'enableContactsSync']);
    assert.equal(count(log, 'app_check:token'), sent.length);
    assert.equal(count(log, 'auth:id_token'), sent.length);
    // Each request is ID token, then App Check token, then the fetch.
    const first = log.findIndex((line) => line.startsWith('fetch:'));
    assert.deepEqual(log.slice(first - 2, first), ['auth:id_token', 'app_check:token']);
  });

  it('reuses the composition across operations: no extra initialization or forced token', async () => {
    const { log } = await assertParity({ toggles: 3 });
    assert.equal(count(log, 'app_check:create_port'), 1);
    assert.equal(count(log, 'app_check:initialize'), 1);
    assert.equal(count(log, 'app_check:force'), 1);
  });

  it('composition failure: same bounded attempts, then a new composition on retry', async () => {
    const { log, views, outcomes } = await assertParity({
      forcedFailures: 2,
      toggles: 3,
    });
    // Two attempts on the failed toggle, one on the retry, none on the third.
    assert.equal(count(log, 'app_check:create_port'), 2);
    assert.equal(count(log, 'app_check:force'), 3);
    assert.equal(outcomes.length, 2);
    const failed = views.find((view) => view.view === 'error');
    assert.equal(failed?.reason, 'contacts-invalid-response');
    assert.equal(failed?.enabled, false);
    assert.equal(failed?.retryable, true);
    assert.equal(failed?.retryKind, 'enable');
  });

  it('consent: denied never reaches enable or the address book', async () => {
    const { log, views } = await assertParity({ permission: 'denied' });
    assert.equal(count(log, 'permission:request'), 0);
    assert.equal(count(log, 'contacts:read'), 0);
    assert.ok(!fetches(log).includes('enableContactsSync'));
    assert.equal(views[views.length - 1].reason, 'contacts-os-denied');
  });

  it('consent: undetermined asks once; refusal stops there', async () => {
    const { log, views } = await assertParity({
      permission: 'undetermined',
      afterRequest: 'denied',
    });
    assert.equal(count(log, 'permission:request'), 1);
    assert.ok(!fetches(log).includes('enableContactsSync'));
    assert.equal(views[views.length - 1].reason, 'contacts-os-denied');
  });

  it('consent: limited access still syncs', async () => {
    const { log } = await assertParity({ permission: 'limited' });
    assert.equal(count(log, 'permission:request'), 0);
    assert.ok(fetches(log).includes('syncContactHashes'));
  });

  it('cancellation: stops before any request', async () => {
    const { log } = await assertParity({ cancelAfterPermission: true });
    assert.deepEqual(fetches(log), []);
  });

  it('HTTP and transport failures keep reason, toggle and retry, with no extra requests', async () => {
    for (const respond of [
      () => new Response('<html>Forbidden</html>', { status: 403 }),
      () => new Response('', { status: 503 }),
      () => new TypeError('Network request failed'),
    ]) {
      const { log, views } = await assertParity({ respond });
      assert.deepEqual(fetches(log), ['refreshVerifiedActorKeys']);
      const last = views[views.length - 1];
      assert.equal(last.reason, 'contacts-invalid-response');
      assert.equal(last.enabled, false);
      assert.equal(last.retryKind, 'enable');
    }
  });

  it('a stored epoch skips refresh, as before', async () => {
    const { log } = await assertParity({ seedEpoch: 2 });
    assert.equal(fetches(log)[0], 'enableContactsSync');
    assert.ok(!fetches(log).includes('refreshVerifiedActorKeys'));
  });

  it('disable keeps its calls and result', async () => {
    const { log } = await assertParity({ kind: 'disable', enabled: true, seedEpoch: 2 });
    assert.ok(fetches(log).includes('disableContactsSync'));
    assert.ok(!fetches(log).includes('enableContactsSync'));
  });
});

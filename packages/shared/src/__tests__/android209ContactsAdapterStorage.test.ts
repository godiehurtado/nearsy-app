/**
 * Loads the real Android adapter (contactsHmac.android.ts + contactsBook.android.ts)
 * and replaces only native modules, so UID separation is proven on the code that
 * ships, not on the non-Android stub.
 * Run: node --experimental-strip-types --test packages/shared/src/__tests__/android209ContactsAdapterStorage.test.ts
 */
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { before, beforeEach, describe, it } from 'node:test';

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

function wire(extra: Record<string, unknown>) {
  return {
    contactsSyncEnabled: true,
    contactsEpoch: 0,
    notifyNearbyContactsEffective: true,
    syncCommitted: true,
    reevaluateRequired: false,
    ...extra,
  };
}

function respondAsIdentity(name: string, data: any): unknown {
  if (name === 'enableContactsSync') return wire({ result: 'enabled' });
  if (name === 'syncContactHashes') {
    return wire({
      result: 'synced',
      sourceId: data.sourceId,
      snapshotVersion: data.snapshotVersion,
      contactsEpoch: data.contactsEpoch,
    });
  }
  throw new Error(`unexpected ${name}`);
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
    env.calls.length = 0;
    env.respond = respondAsIdentity;
    env.permission = 'granted';
    env.contacts = [{ emails: [{ email: 'ada@b.co' }] }];
    env.appCheck = 'ready';
    env.reevaluations = 0;
    env.randomFill = 0;
  });

  it('does not credit the device-wide source to the first account', async () => {
    env.storage.set(LEGACY_KEY, LEGACY_SOURCE);
    env.uid = 'uid-a';
    env.authListener?.({ uid: 'uid-a' });
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
    env.uid = 'uid-a';
    await adapter.enableThenSyncContacts();
    await flush();
    const sourceA = saved('uid-a').sourceId;

    env.uid = 'uid-b';
    env.authListener?.({ uid: 'uid-b' });
    assert.equal(adapter.getContactsSyncStatus().snapshot, 'none');
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
    env.uid = 'uid-a';
    env.respond = (name, data) =>
      name === 'enableContactsSync'
        ? wire({ result: 'enabled', contactsEpoch: 2 })
        : respondAsIdentity(name, data);
    await adapter.enableThenSyncContacts();
    const sent = env.calls.find((c) => c.name === 'syncContactHashes');
    assert.equal(sent?.data.sourceId, 'ownedSource1');
    assert.equal(sent?.data.snapshotVersion, 10, 'above the fence');
    assert.equal(env.storage.get(SOURCE_KEY('uid-a')), 'ownedSource1');
  });

  it('a late result of account A does not write to account B', async () => {
    env.uid = 'uid-a';
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
    release(wire({ result: 'enabled', contactsEpoch: 41 }));
    assert.equal((await first).status, 'stale');
    await flush();
    assert.equal(env.storage.has(STATE_KEY('uid-b')), false);
    assert.equal(saved('uid-a').contactsEpoch, 0, 'no late write for A either');
    assert.equal(env.calls.filter((c) => c.name === 'syncContactHashes').length, 0);
  });

  it('App Check failure is its own cause and sends nothing', async () => {
    env.uid = 'uid-a';
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
    env.uid = 'uid-a';
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
    env.uid = 'uid-a';
    await adapter.enableThenSyncContacts();
    await flush();
    assert.doesNotMatch(JSON.stringify([...env.storage.entries()]), /ada@b\.co/);
  });
});

describe('Adapter and stub stay aligned', () => {
  it('export the same runtime API', async () => {
    const android = await import('../contactsHmac/contactsHmac.android.ts');
    const stub = await import('../contactsHmac/contactsHmac.ts');
    const onlyAndroid = new Set([
      'CONTACTS_CALLABLE_TIMEOUT_MS',
      'CONTACTS_LATE_RESULT_GRACE_MS',
    ]);
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

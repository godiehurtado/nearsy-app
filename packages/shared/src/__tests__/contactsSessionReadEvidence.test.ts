/**
 * Evidence for "Ref: session_read/other" (build 2.0.10 (75)). Synthetic UID and
 * values only. Uses the real SecureStore session store, key construction,
 * controller, coordinator and trace, with an expo-secure-store 15.0.8 double
 * (same key rule /^[\w.-]+$/, string values, coded native errors).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  createContactsOperationTrace,
  traceContactsAddressBook,
  traceContactsSession,
} from '../contacts/contactsDiagnostics';
import {
  createContactsOperationRunner,
  driveContactsOperation,
} from '../contacts/contactsOperationCoordinator';
import { presentContactsSyncError } from '../contacts/contactsErrorPresentation';
import { enableAndSyncContacts } from '../contacts/controller';
import { createFakeContactsHmacClient } from '../contacts/fakeClient';
import {
  contactsSessionKeysForUid,
  createSecureStoreContactsSessionStore,
} from '../contacts/iosContactsSession.ios';

const UID = 'SyntheticUid0123456789abcdef';
const KEY_RULE = /^[\w.-]+$/; // expo-secure-store 15.0.8 isValidKey

function secureStoreDouble(seed: Record<string, string>, failGet?: unknown) {
  const data = new Map(Object.entries(seed));
  const keysRead: string[] = [];
  return {
    keysRead,
    async getItemAsync(key: string) {
      if (!KEY_RULE.test(key)) throw new Error('Invalid key provided to SecureStore.');
      keysRead.push(key);
      if (failGet) throw failGet;
      return data.get(key) ?? null;
    },
    async setItemAsync(key: string, value: string) {
      if (!KEY_RULE.test(key)) throw new Error('Invalid key provided to SecureStore.');
      if (typeof value !== 'string') throw new Error('Invalid value provided to SecureStore.');
      data.set(key, value);
    },
    async deleteItemAsync(key: string) {
      data.delete(key);
    },
  };
}

const wire = (epoch: number) => ({
  result: 'enabled',
  contactsSyncEnabled: true,
  contactsEpoch: epoch,
  notifyNearbyContactsEffective: true,
  syncCommitted: false,
  reevaluateRequired: false,
});

async function enableOnce(seed: Record<string, string>, failGet?: unknown) {
  const store = secureStoreDouble(seed, failGet);
  const trace = createContactsOperationTrace();
  const fake = createFakeContactsHmacClient({
    refreshVerifiedActorKeys: async () => wire(1),
    enableContactsSync: async () => wire(1),
    syncContactHashes: async () => ({ ...wire(1), result: 'synced', syncCommitted: true, snapshotVersion: 1 }),
  });
  const client = Object.fromEntries(
    Object.entries(fake).map(([name, fn]) => [
      name,
      (req: any) => {
        trace.enter('auth_token');
        return (fn as any)(req);
      },
    ]),
  ) as typeof fake;
  let alert: string | null = null;
  await driveContactsOperation({
    runner: createContactsOperationRunner(),
    uid: UID,
    kind: 'enable',
    previousEnabled: false,
    waitMs: 5000,
    task: async ({ isCurrent }) => {
      try {
        return await enableAndSyncContacts({
          client,
          session: traceContactsSession(createSecureStoreContactsSessionStore(UID, async () => store), trace),
          book: traceContactsAddressBook(
            {
              getPermission: async () => 'granted' as const,
              requestPermission: async () => 'granted' as const,
              readRows: async () => [{ phoneNumbers: [{ number: '+14155552671' }] }],
            },
            trace,
          ),
          isCancelled: () => !isCurrent(),
          createRandomHex: () => 'abcdef0123456789',
        });
      } catch (err) {
        trace.fail(err);
        throw err;
      }
    },
    isActive: () => true,
    readServerState: async () => null,
    onView: (view) => {
      if (view.view === 'error') alert = presentContactsSyncError(view.reason ?? '', ((k: string) => k) as any);
    },
  });
  return { ref: trace.reference(), alert, keysRead: store.keysRead };
}

const k = contactsSessionKeysForUid(UID);

describe('SecureStore keys', () => {
  it('every per-UID key satisfies the installed expo-secure-store rule, for any UID shape', () => {
    for (const uid of [UID, 'a', 'uid:with/odd chars@x.y', 'ñandú-ü', '0'.repeat(128)]) {
      for (const key of Object.values(contactsSessionKeysForUid(uid))) {
        assert.match(key, KEY_RULE, key.slice(0, 24));
      }
    }
  });

  it('reads only per-UID keys with default options; legacy global keys are never read', async () => {
    const { keysRead } = await enableOnce({ 'nearsy.contacts.v1.sourceId': 'ios_legacy000001' });
    assert.ok(keysRead.length > 0);
    for (const key of keysRead) assert.ok(key.startsWith('nearsy.contacts.v1.uid.'), key.slice(0, 24));
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../contacts/iosContactsSession.ios.ts'),
      'utf8',
    );
    assert.match(source, /store\.getItemAsync\(key\)/, 'no SecureStore options passed');
  });
});

describe('what session_read covers and what it can report', () => {
  it('sessions left by earlier builds and corrupt values never fail the read', async () => {
    for (const seed of [
      {},
      { [k.sourceId]: 'ios_abcdef0123456789', [k.contactsEpoch]: '1', [k.snapshotVersion]: '1' },
      { 'nearsy.contacts.v1.sourceId': 'ios_legacy000001', 'nearsy.contacts.v1.contactsEpoch': '3' },
      { [k.sourceId]: 'ios_abcdef0123456789', [k.contactsEpoch]: 'NaN' },
      { [k.sourceId]: 'ios_abcdef0123456789', [k.contactsEpoch]: '1', [k.sent]: '{bad' },
      { [k.contactsEpoch]: '-4', [k.snapshotVersion]: '0' },
    ]) {
      const { ref, alert } = await enableOnce(seed);
      assert.equal(alert, null, JSON.stringify(Object.keys(seed)));
      assert.equal(ref?.startsWith('session_read'), false);
    }
  });

  it('a native SecureStore failure names its code or session-unavailable, never other', async () => {
    for (const [failGet, expected] of [
      [Object.assign(new Error('x'), { code: 'ERR_KEY_CHAIN' }), 'session_read/err-key-chain/k-coded'],
      [Object.assign(new Error('x'), { code: 'ERR_INVALID_KEY' }), 'session_read/err-invalid-key/k-coded'],
      [Object.assign(new Error('x'), { code: 'ERR_MISSING_PLIST_KEY' }), 'session_read/err-missing-plist-key/k-coded'],
      [Object.assign(new Error('x'), { code: 'ERR_SEC_ACCESS_CONTROL' }), 'session_read/err-sec-access-control/k-coded'],
      [Object.assign(new Error('x'), { code: 'ERR_SOMETHING_NEW' }), 'session_read/session-unavailable/k-coded'],
      [new Error('x'), 'session_read/session-unavailable/k-error'],
      ['not an error object', 'session_read/session-unavailable/k-non-object'],
    ] as const) {
      const { ref, alert } = await enableOnce({}, failGet);
      assert.equal(ref, expected);
      assert.equal(alert, 'settings.contacts.errors.generic');
    }
  });
});

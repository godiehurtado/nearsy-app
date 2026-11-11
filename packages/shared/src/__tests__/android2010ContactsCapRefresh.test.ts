/**
 * 2.0.10 (48) physical test: an account already on, with no limit learned (or a
 * 500 stored), retries after Identity moved to identifierCap=5000 and gets the
 * 500 error without anything reaching Identity. Real session, flow, storage and
 * collector; Identity is the in-memory fake. Synthetic emails only.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { collectContactIdentifiers } from '../contactsHmac/contactsHmacCore.ts';
import {
  REFRESH_VERIFIED_ACTOR_KEYS,
  SYNC_CONTACT_HASHES,
} from '../contactsHmac/contactsHmacContract.ts';
import { contactsStateStorageKey } from '../contactsHmac/contactsSource.ts';
import { createContactsSyncSession } from '../contactsHmac/contactsSyncSession.ts';
import { FakeIdentity } from './helpers/contactsIdentityFake.ts';

const UID = 'uid-a';

function book(size: number) {
  const rows = Array.from({ length: size }, (_, i) => ({ emails: [{ email: `c${i}@example.com` }] }));
  const reads: number[] = [];
  return {
    reads,
    port: () => ({
      getPermission: async () => 'granted' as const,
      requestPermission: async () => 'granted' as const,
      readRecords: async (options?: { identifierCap?: number }) => {
        reads.push(options?.identifierCap ?? -1);
        const collected = collectContactIdentifiers(rows, { identifierCap: options?.identifierCap });
        if (!collected.ok && collected.reason === 'contacts-identifier-cap') {
          return { capExceeded: true as const };
        }
        if (!collected.ok) throw new Error(collected.reason);
        return collected.identifiers;
      },
    }),
  };
}

function memoryStore() {
  const kv = new Map<string, string>();
  return {
    kv,
    getItem: async (k: string) => kv.get(k) ?? null,
    setItem: async (k: string, v: string) => void kv.set(k, v),
    removeItem: async (k: string) => void kv.delete(k),
  };
}

/** An account turned on and synced (10 contacts) while Identity sent `announced`. */
async function accountOnBeforeDeploy(announced: unknown) {
  const identity = new FakeIdentity();
  identity.uid = UID;
  identity.announcedCap = announced;
  identity.serverCap = 500;
  const store = memoryStore();
  let current = book(10);
  const session = createContactsSyncSession({
    currentUid: () => UID,
    store,
    randomBytes: async () => new Uint8Array(16).fill(7),
    region: 'us-central1',
    callIdentity: (name, data) => identity.call(name, data),
    createBook: () => current.port(),
    ensureAppCheck: async () => {},
    scheduleReevaluate: () => {},
    timeoutMs: 1000,
  });
  await session.bindUserDoc(UID, identity.userDoc());
  assert.equal((await session.enableThenSync({ disclosureAccepted: true })).status, 'ok');
  assert.equal(session.getStatus().snapshot, 'synced');
  return {
    identity,
    store,
    session,
    setBook: (next: ReturnType<typeof book>) => {
      current = next;
    },
    /** Identity deploys identifierCap=5000. */
    deploy: () => {
      identity.announcedCap = 5000;
      identity.serverCap = 5000;
    },
  };
}

const storedCap = (store: ReturnType<typeof memoryStore>) =>
  JSON.parse(store.kv.get(contactsStateStorageKey(UID))!).identifierCap;

describe('retry after Identity moved to identifierCap=5000', () => {
  for (const [label, announced] of [
    ['limit never learned (older server)', undefined],
    ['500 stored for the account', 500],
  ] as const) {
    it(`${label}: one refresh, then the whole book reaches sync`, async () => {
      const env = await accountOnBeforeDeploy(announced);
      assert.equal(storedCap(env.store), announced ?? null);
      env.deploy();
      const bigger = book(852);
      env.setBook(bigger);
      const refreshesBefore = env.identity.count(REFRESH_VERIFIED_ACTOR_KEYS);
      const syncsBefore = env.identity.count(SYNC_CONTACT_HASHES);

      const op = await env.session.retry();

      assert.equal(op.status, 'ok');
      assert.equal(env.identity.count(REFRESH_VERIFIED_ACTOR_KEYS) - refreshesBefore, 1);
      assert.equal(env.identity.count(SYNC_CONTACT_HASHES) - syncsBefore, 1);
      assert.equal(env.identity.last(SYNC_CONTACT_HASHES).identifiers.length, 852);
      assert.deepEqual(bigger.reads, [500, 5000]);
      assert.equal(env.session.getStatus().snapshot, 'synced');
      assert.equal(env.session.getStatus().errorKey, null);
      assert.equal(env.session.getStatus().identifierLimit, 5000);
      assert.equal(storedCap(env.store), 5000);
    });
  }

  it('once the limit is known, a big book needs no extra call', async () => {
    const env = await accountOnBeforeDeploy(undefined);
    env.deploy();
    env.setBook(book(852));
    await env.session.retry();
    const refreshes = env.identity.count(REFRESH_VERIFIED_ACTOR_KEYS);
    const again = book(900);
    env.setBook(again);
    assert.equal((await env.session.retry()).status, 'ok');
    assert.equal(env.identity.count(REFRESH_VERIFIED_ACTOR_KEYS), refreshes);
    assert.deepEqual(again.reads, [5000]);
  });

  it('a book within the known limit never asks Identity first', async () => {
    const env = await accountOnBeforeDeploy(undefined);
    env.deploy();
    const small = book(400);
    env.setBook(small);
    const refreshes = env.identity.count(REFRESH_VERIFIED_ACTOR_KEYS);
    assert.equal((await env.session.retry()).status, 'ok');
    assert.equal(env.identity.count(REFRESH_VERIFIED_ACTOR_KEYS), refreshes);
    assert.deepEqual(small.reads, [500]);
  });

  it('server still without the field: one refresh, 500 stays, nothing sent, previous sync kept', async () => {
    const env = await accountOnBeforeDeploy(undefined);
    const bigger = book(852);
    env.setBook(bigger);
    const refreshes = env.identity.count(REFRESH_VERIFIED_ACTOR_KEYS);
    const syncs = env.identity.count(SYNC_CONTACT_HASHES);
    const op = await env.session.retry();
    assert.equal(op.status, 'failed');
    assert.equal(op.status === 'failed' && op.error.reason, 'contacts-identifier-cap');
    assert.equal(env.identity.count(REFRESH_VERIFIED_ACTOR_KEYS) - refreshes, 1);
    assert.equal(env.identity.count(SYNC_CONTACT_HASHES), syncs);
    assert.deepEqual(bigger.reads, [500]);
    assert.equal(env.session.getStatus().errorKey, 'identifierCap');
    assert.equal(env.session.getStatus().identifierLimit, 500);
  });

  it('above 5000 still sends nothing, with no refresh once the limit is already the maximum', async () => {
    const env = await accountOnBeforeDeploy(undefined);
    env.deploy();
    env.setBook(book(852));
    await env.session.retry();
    const huge = book(5001);
    env.setBook(huge);
    const refreshes = env.identity.count(REFRESH_VERIFIED_ACTOR_KEYS);
    const syncs = env.identity.count(SYNC_CONTACT_HASHES);
    const op = await env.session.retry();
    assert.equal(op.status === 'failed' && op.error.reason, 'contacts-identifier-cap');
    assert.equal(env.identity.count(REFRESH_VERIFIED_ACTOR_KEYS), refreshes);
    assert.equal(env.identity.count(SYNC_CONTACT_HASHES), syncs);
    assert.deepEqual(huge.reads, [5000]);
  });

  it('the one-time reconciliation takes the same path', async () => {
    const { runResyncGrantedBook } = await import('../contactsHmac/contactsSyncFlow.ts');
    const env = await accountOnBeforeDeploy(undefined);
    env.deploy();
    const bigger = book(852);
    const state = JSON.parse(env.store.kv.get(contactsStateStorageKey(UID))!);
    const out = await runResyncGrantedBook({
      functions: { region: 'r', call: (n: string, d?: unknown) => env.identity.call(n, d) },
      book: bigger.port(),
      state,
    });
    assert.equal(out.result?.syncCommitted, true);
    assert.equal(env.identity.last(SYNC_CONTACT_HASHES).identifiers.length, 852);
    assert.deepEqual(bigger.reads, [500, 5000]);
  });

  it('Identity reports sync off on that refresh: it stays off, nothing sent', async () => {
    const env = await accountOnBeforeDeploy(undefined);
    env.deploy();
    env.identity.enabled = false;
    env.setBook(book(852));
    const syncs = env.identity.count(SYNC_CONTACT_HASHES);
    const op = await env.session.retry();
    assert.notEqual(op.status, 'ok');
    assert.equal(env.identity.count(SYNC_CONTACT_HASHES), syncs);
    assert.equal(env.session.getStatus().enablement, 'off');
  });
});

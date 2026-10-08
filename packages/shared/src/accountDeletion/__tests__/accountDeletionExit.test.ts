/**
 * Account deletion exit barrier: phase transitions and release rules.
 * Run: node --experimental-strip-types --test packages/shared/src/accountDeletion/__tests__/accountDeletionExit.test.ts
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createAccountDeletionExitStore,
  createPendingDeletionMarker,
  PENDING_DELETION_STORAGE_KEY,
  type AccountDeletionPhase,
} from '../accountDeletionExit.ts';

const SESSION_A = 'session-a';
const SESSION_B = 'session-b';

function tracked() {
  const store = createAccountDeletionExitStore();
  const seen: AccountDeletionPhase[] = [];
  store.subscribe(() => seen.push(store.getPhase()));
  return { store, seen };
}

describe('Account deletion exit barrier', () => {
  it('starts idle and only a request moves it to deleting', () => {
    const { store, seen } = tracked();
    assert.equal(store.getPhase(), 'idle');
    store.beginRequest();
    assert.equal(store.getPhase(), 'deleting');
    assert.deepEqual(seen, ['deleting']);
  });

  it('abandoned request returns to idle', () => {
    const { store, seen } = tracked();
    store.noteAuthState(SESSION_A);
    store.beginRequest();
    store.abandonRequest();
    assert.deepEqual(seen, ['deleting', 'idle']);
  });

  it('confirmed deletion → exiting; cleanup after Auth emitted null → idle', () => {
    const { store, seen } = tracked();
    store.noteAuthState(SESSION_A);
    store.beginRequest();
    store.confirmDeletion();
    store.noteAuthState(null);
    assert.equal(store.getPhase(), 'exiting', 'Auth null alone does not release during cleanup');
    store.finishCleanup();
    assert.deepEqual(seen, ['deleting', 'exiting', 'idle']);
  });

  it('cleanup settled while Auth still holds the deleted session → signed_out until Auth catches up', () => {
    const { store, seen } = tracked();
    store.noteAuthState(SESSION_A);
    store.beginRequest();
    store.confirmDeletion();
    store.finishCleanup();
    assert.equal(store.getPhase(), 'signed_out');

    store.noteAuthState(SESSION_A);
    assert.equal(store.getPhase(), 'signed_out', 'the deleted session never releases the barrier');

    store.noteAuthState(null);
    assert.deepEqual(seen, ['deleting', 'exiting', 'signed_out', 'idle']);
  });

  it('a different session signing in releases signed_out', () => {
    const { store } = tracked();
    store.noteAuthState(SESSION_A);
    store.beginRequest();
    store.confirmDeletion();
    store.finishCleanup();
    store.noteAuthState(SESSION_B);
    assert.equal(store.getPhase(), 'idle');
  });

  it('abandon after confirmation never reopens the profile gate', () => {
    const { store } = tracked();
    store.noteAuthState(SESSION_A);
    store.beginRequest();
    store.confirmDeletion();
    store.abandonRequest();
    assert.equal(store.getPhase(), 'exiting');
  });

  it('a second deletion after release starts from a clean state', () => {
    const { store } = tracked();
    store.noteAuthState(SESSION_A);
    store.beginRequest();
    store.confirmDeletion();
    store.noteAuthState(null);
    store.finishCleanup();
    store.noteAuthState(SESSION_B);
    store.beginRequest();
    store.confirmDeletion();
    store.finishCleanup();
    assert.equal(store.getPhase(), 'signed_out');
    store.noteAuthState(null);
    assert.equal(store.getPhase(), 'idle');
  });

  it('unresolved: kept by retries, left by Auth null or by an exit', () => {
    const { store, seen } = tracked();
    store.noteAuthState(SESSION_A);
    store.beginRequest();
    store.markUnresolved();
    store.beginRequest();
    store.abandonRequest();
    assert.equal(store.getPhase(), 'unresolved', 'retries and releases never reopen the gate');
    store.noteAuthState(null);
    assert.deepEqual(seen, ['deleting', 'unresolved', 'idle']);

    const other = tracked();
    other.store.noteAuthState(SESSION_A);
    other.store.beginRequest();
    other.store.markUnresolved();
    other.store.confirmDeletion();
    other.store.finishCleanup();
    assert.deepEqual(other.seen, ['deleting', 'unresolved', 'exiting', 'signed_out']);
  });

  it('markUnresolved only applies to an in-flight request', () => {
    const { store } = tracked();
    store.markUnresolved();
    assert.equal(store.getPhase(), 'idle');
  });

  it('finishCleanup outside exiting is ignored; unsubscribe stops notifications', () => {
    const { store, seen } = tracked();
    store.finishCleanup();
    assert.equal(store.getPhase(), 'idle');
    const extra: AccountDeletionPhase[] = [];
    const off = store.subscribe(() => extra.push(store.getPhase()));
    off();
    store.beginRequest();
    assert.deepEqual(extra, []);
    assert.deepEqual(seen, ['deleting']);
  });
});

describe('Persisted pending-deletion marker', () => {
  function withStorage(initial?: string) {
    const storage = new Map<string, string>();
    if (initial) storage.set(PENDING_DELETION_STORAGE_KEY, initial);
    const { store, seen } = tracked();
    store.attachMarker(
      createPendingDeletionMarker({
        getItem: async (key) => storage.get(key) ?? null,
        setItem: async (key, value) => void storage.set(key, value),
        removeItem: async (key) => void storage.delete(key),
      }),
    );
    return { store, seen, storage };
  }

  it('is written before the callable runs and holds no identifier', async () => {
    const { store, storage } = withStorage();
    store.noteAuthState(SESSION_A);
    await store.beginRequest();
    assert.deepEqual([...storage.entries()], [[PENDING_DELETION_STORAGE_KEY, '1']]);
  });

  it('is cleared when the request is released, the exit settles or Auth has no user', async () => {
    const released = withStorage();
    released.store.noteAuthState(SESSION_A);
    await released.store.beginRequest();
    released.store.abandonRequest();
    await Promise.resolve();
    assert.equal(released.storage.size, 0);

    const exited = withStorage();
    exited.store.noteAuthState(SESSION_A);
    await exited.store.beginRequest();
    exited.store.confirmDeletion();
    exited.store.noteAuthState(null);
    exited.store.finishCleanup();
    await Promise.resolve();
    assert.equal(exited.storage.size, 0);

    const pending = withStorage();
    pending.store.noteAuthState(SESSION_A);
    await pending.store.beginRequest();
    pending.store.markUnresolved();
    assert.equal(pending.storage.size, 1, 'kept while unresolved');
    pending.store.noteAuthState(null);
    await Promise.resolve();
    assert.equal(pending.storage.size, 0);
  });

  it('is kept while Auth still holds the deleted session after the exit', async () => {
    const { store, storage } = withStorage();
    store.noteAuthState(SESSION_A);
    await store.beginRequest();
    store.confirmDeletion();
    store.finishCleanup();
    assert.equal(store.getPhase(), 'signed_out');
    assert.equal(storage.size, 1);
  });

  it('hydrate with a signed-in user reopens unresolved, whatever the emission order', async () => {
    const before = withStorage('1');
    before.store.noteAuthState(SESSION_A);
    await before.store.hydrate();
    assert.equal(before.store.getPhase(), 'unresolved');

    const after = withStorage('1');
    await after.store.hydrate();
    assert.equal(after.store.getPhase(), 'unresolved');
    after.store.noteAuthState(SESSION_A);
    assert.equal(after.store.getPhase(), 'unresolved');
  });

  it('hydrate without a user clears the marker; no marker changes nothing', async () => {
    const signedOut = withStorage('1');
    signedOut.store.noteAuthState(null);
    await signedOut.store.hydrate();
    assert.equal(signedOut.store.getPhase(), 'idle');
    assert.equal(signedOut.storage.size, 0);

    const lateNull = withStorage('1');
    await lateNull.store.hydrate();
    lateNull.store.noteAuthState(null);
    await Promise.resolve();
    assert.equal(lateNull.store.getPhase(), 'idle');
    assert.equal(lateNull.storage.size, 0);

    const clean = withStorage();
    clean.store.noteAuthState(SESSION_A);
    await clean.store.hydrate();
    assert.deepEqual(clean.seen, []);
  });

  it('storage failures never break the flow', async () => {
    const { store, seen } = tracked();
    store.attachMarker({
      load: async () => {
        throw new Error('disk');
      },
      save: async () => {
        throw new Error('disk');
      },
      clear: async () => {
        throw new Error('disk');
      },
    });
    await store.hydrate();
    store.noteAuthState(SESSION_A);
    await store.beginRequest();
    store.abandonRequest();
    assert.deepEqual(seen, ['deleting', 'idle']);
  });
});

/**
 * Account deletion exit barrier: phase transitions and release rules.
 * Run: node --experimental-strip-types --test packages/shared/src/accountDeletion/__tests__/accountDeletionExit.test.ts
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createAccountDeletionExitStore,
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

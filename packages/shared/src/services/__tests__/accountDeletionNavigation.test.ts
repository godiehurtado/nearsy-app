import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

import {
  __resetAccountDeletionSessionForTests,
  beginAccountDeletionSession,
  endAccountDeletionSession,
  finalizePostAccountDeletionSession,
  isAccountDeletionSessionActive,
} from '../accountDeletionSession';
import { deleteAccountWithBackend, type AccountDeletionRuntime } from '../accountDeletion';
import { DeleteMyAccountError } from '../deleteMyAccount/contract';

const sharedSrc = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(sharedSrc, rel), 'utf8');

function runtimeWith(deleteMyAccount: AccountDeletionRuntime['deleteMyAccount']): AccountDeletionRuntime {
  return {
    getCurrentUid: () => 'uid-del',
    getAuthTimeMs: async () => Date.now(),
    reauthenticate: async () => undefined,
    deleteMyAccount,
  };
}

describe('accountDeletionSession + post-delete navigation', () => {
  beforeEach(() => {
    __resetAccountDeletionSessionForTests();
  });

  it('backend success → stop location/Visibility, clear local state, sign out, guest Login', async () => {
    const order: string[] = [];
    let resetState: { index: number; routes: { name: string }[] } | null = null;

    const result = await deleteAccountWithBackend(
      {},
      runtimeWith(async () => ({ ok: true, status: 'DELETED' })),
    );
    assert.equal(result.status, 'deleted');
    assert.equal(isAccountDeletionSessionActive(), true);

    const finalized = await finalizePostAccountDeletionSession({
      closeVisibilityAndLocation: async () => {
        order.push('visibility+location');
      },
      clearLocalState: async () => {
        order.push('local-state');
      },
      clearSocialPrefill: () => {
        order.push('prefill');
      },
      clearGoogleProviderSession: async () => {
        order.push('google');
      },
      clearFacebookProviderSession: async () => {
        order.push('facebook');
      },
      ensureSignedOut: async () => {
        order.push('sign-out');
      },
      navigation: {
        isReady: () => true,
        reset: (state) => {
          resetState = state;
        },
      },
    });

    assert.deepEqual(order, [
      'visibility+location',
      'local-state',
      'prefill',
      'google',
      'facebook',
      'sign-out',
    ]);
    assert.equal(finalized.navigationReset, true);
    assert.deepEqual(resetState, { index: 0, routes: [{ name: 'Login' }] });
    assert.equal(isAccountDeletionSessionActive(), false);
  });

  it('a failing local cleanup step never blocks sign-out or the guest transition', async () => {
    const order: string[] = [];
    await finalizePostAccountDeletionSession({
      closeVisibilityAndLocation: async () => {
        throw new Error('runtime stop failed');
      },
      clearLocalState: async () => {
        throw new Error('storage failed');
      },
      ensureSignedOut: async () => {
        order.push('sign-out');
      },
    });
    assert.deepEqual(order, ['sign-out']);
    assert.equal(isAccountDeletionSessionActive(), false);
  });

  it('definitive backend rejection ends the session (nothing was deleted)', async () => {
    const result = await deleteAccountWithBackend(
      {},
      runtimeWith(async () => {
        throw new DeleteMyAccountError('APP_CHECK', false);
      }),
    );
    assert.equal(result.status, 'failed');
    assert.equal(isAccountDeletionSessionActive(), false);
  });

  it('AppNavigator suppresses CompleteProfile remount during deletion session', () => {
    const src = read('navigation/AppNavigator.tsx');
    assert.match(src, /isAccountDeletionSessionActive/);
    assert.match(src, /!snap\.exists\(\) && isAccountDeletionSessionActive/);
  });

  it('DeleteAccountScreen uses root navigation finalize, not More-stack Login reset', () => {
    const src = read('screens/DeleteAccountScreen.tsx');
    assert.match(src, /finalizePostAccountDeletionSession/);
    assert.match(src, /navigationRef/);
    assert.doesNotMatch(src, /navigateToLogin/);
    assert.doesNotMatch(src, /nav\.goBack\(\);\s*\n\s*return;/);
  });

  it('local cleanup runs only after a confirmed backend deletion', () => {
    const src = read('screens/DeleteAccountScreen.tsx');
    const runDeletion = src.slice(src.indexOf('const runDeletion'), src.indexOf('const handleDelete'));
    assert.match(
      runDeletion,
      /const result = await deleteAccountWithBackend\(request\);\s*if \(result\.status === 'deleted'\) \{\s*await runSuccessfulDeletionExit\(result\.uid\);\s*return;\s*\}/,
    );
    assert.equal(runDeletion.match(/runSuccessfulDeletionExit/g)?.length, 1);
    assert.doesNotMatch(runDeletion, /signOut|clearLastKnownVisibility|stopBackgroundLocationRuntime/);

    const exit = src.slice(src.indexOf('const runSuccessfulDeletionExit'), src.indexOf('const runDeletion'));
    assert.match(exit, /closeVisibilitySessionForLogout\(\{ stopRuntime: stopBackgroundLocationRuntime \}\)/);
    assert.match(exit, /clearLastKnownVisibility\(AsyncStorage, deletedUid\)/);
    assert.match(exit, /clearFacebookProviderSession,/);
    assert.match(exit, /registry\?\.get\('google'\)\.clearProviderSession\(\)/);
  });

  it('signed-out while pending: no alert on an unmounted screen, session released', () => {
    const src = read('screens/DeleteAccountScreen.tsx');
    assert.match(src, /if \(!mountedRef\.current\) \{\s*endAccountDeletionSession\(\);\s*return;\s*\}/);
    assert.match(src, /if \(!busyRef\.current\) endAccountDeletionSession\(\);/);
  });

  it('double tap is blocked synchronously in the screen', () => {
    const src = read('screens/DeleteAccountScreen.tsx');
    assert.match(src, /if \(busyRef\.current\) return;\s*busyRef\.current = true;/);
  });
});

describe('deletion session flag helpers', () => {
  beforeEach(() => {
    __resetAccountDeletionSessionForTests();
  });

  it('begin/end toggles active flag', () => {
    assert.equal(isAccountDeletionSessionActive(), false);
    beginAccountDeletionSession();
    assert.equal(isAccountDeletionSessionActive(), true);
    endAccountDeletionSession();
    assert.equal(isAccountDeletionSessionActive(), false);
  });
});

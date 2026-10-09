import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

import { deleteAccountWithBackend, type AccountDeletionRuntime } from '../accountDeletion';
import {
  __resetAccountDeletionSessionForTests,
  finalizePostAccountDeletionSession,
  getAccountDeletionClosure,
} from '../accountDeletionSession';
import {
  PENDING_ACCOUNT_DELETION_STORAGE_KEY,
  __resetPendingAccountDeletionForTests,
  getPendingAccountDeletionState,
  hydratePendingAccountDeletion,
  reconcilePendingAccountDeletion,
  type AuthIdentity,
} from '../accountDeletionReconciliation';
import { DeleteMyAccountError, type DeleteMyAccountStatus } from '../deleteMyAccount/contract';
import {
  COMPLETE_PROFILE,
  RootNavigatorModel,
  assertNoOnboarding,
  memoryStorage,
  signedInModel,
} from './helpers/rootNavigatorModel';

const sharedSrc = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(sharedSrc, rel), 'utf8');

const UID = 'uid-unresolved';
const CREATED_AT = 'Mon, 05 Oct 2026 10:00:00 GMT';
const NOW = Date.parse('2026-10-08T12:00:00Z');

const userNotFound = Object.assign(new Error('user-not-found'), { code: 'auth/user-not-found' });
const networkFailed = Object.assign(new Error('network'), {
  code: 'auth/network-request-failed',
});

type Kind = 'NETWORK_UNCERTAIN' | 'UNKNOWN' | 'DELETION_RETRYABLE' | 'DELETION_FAILED';

/** The backend removes users/{uid} (maybe Auth too), then the response is lost. */
function ambiguousRuntime(model: RootNavigatorModel, kind: Kind = 'NETWORK_UNCERTAIN'): AccountDeletionRuntime {
  return {
    getCurrentUid: () => UID,
    getCurrentCreatedAt: () => CREATED_AT,
    getAuthTimeMs: async () => NOW - 10_000,
    nowMs: () => NOW,
    reauthenticate: async () => undefined,
    deleteMyAccount: async () => {
      model.profileEvent(null);
      throw new DeleteMyAccountError(kind, true);
    },
  };
}

function retryRuntime(status: DeleteMyAccountStatus): AccountDeletionRuntime {
  return {
    getCurrentUid: () => UID,
    getCurrentCreatedAt: () => CREATED_AT,
    getAuthTimeMs: async () => NOW - 10_000,
    nowMs: () => NOW,
    reauthenticate: async () => undefined,
    deleteMyAccount: async () => ({ ok: true, status }),
  };
}

const signedIn = (): AuthIdentity => ({ uid: UID, createdAt: CREATED_AT });

/** Mirrors DeleteAccountScreen.runReconciliation (Auth reload only). */
function reconcileWith(reload: () => Promise<void>, identity: () => AuthIdentity | null = signedIn) {
  return reconcilePendingAccountDeletion({ getCurrentIdentity: identity, reloadCurrentUser: reload });
}

/** Mirrors DeleteAccountScreen.runLocalSessionExit. */
async function localExit(model: RootNavigatorModel, signOut: 'emits-null' | 'throws' = 'emits-null') {
  const resets: string[] = [];
  await finalizePostAccountDeletionSession({
    closedUid: UID,
    ensureSignedOut: async () => {
      model.profileEvent(null);
      model.queuedProfileCallback(UID, null);
      if (signOut === 'throws') throw new Error('persistence removal failed');
      model.authEmit(null);
    },
    navigation: { isReady: () => true, reset: (state) => resets.push(state.routes[0].name) },
  });
  return resets;
}

async function ambiguousFailure(model: RootNavigatorModel, kind: Kind = 'NETWORK_UNCERTAIN') {
  const result = await deleteAccountWithBackend({}, ambiguousRuntime(model, kind));
  assert.equal(result.status, 'failed');
  assert.equal(result.status === 'failed' && result.serverMayHaveDeleted, true);
  return result;
}

describe('unresolved deletion — Profile Gate stays suspended while reconciling', () => {
  beforeEach(() => {
    __resetAccountDeletionSessionForTests();
    __resetPendingAccountDeletionForTests();
  });

  for (const kind of ['NETWORK_UNCERTAIN', 'UNKNOWN', 'DELETION_RETRYABLE', 'DELETION_FAILED'] as const) {
    it(`${kind}: Delete Account only, never DOB / Home, even with the profile gone`, async () => {
      const model = signedInModel(UID, CREATED_AT);
      const start = model.routes.length;
      await ambiguousFailure(model, kind);

      assert.deepEqual(getPendingAccountDeletionState().pending, {
        uid: UID,
        createdAt: CREATED_AT,
        phase: 'reconciling',
      });
      assert.equal(getAccountDeletionClosure(), null, 'nothing is claimed');
      model.profileEvent(null);
      model.queuedProfileCallback(UID, null);
      assert.equal(model.current, 'DeleteAccount');
      assertNoOnboarding(model.routesSince(start), model.flows.slice(start));
      const afterFailure = model.routesSince(model.routes.indexOf('DeleteAccount'));
      assert.equal(afterFailure.includes('MainTabs'), false);
      model.dispose();
    });
  }

  it('1. response lost, Auth reload says user-not-found → local cleanup → Login', async () => {
    const model = signedInModel(UID, CREATED_AT);
    const start = model.routes.length;
    await ambiguousFailure(model);

    const outcome = await reconcileWith(async () => {
      throw userNotFound;
    });
    assert.equal(outcome, 'deleted');
    assert.equal(getPendingAccountDeletionState().pending, null);
    assert.equal(getAccountDeletionClosure()?.uid, UID, 'closure engaged before the marker cleared');
    assert.equal(model.current, 'Loader');

    const resets = await localExit(model);
    assert.deepEqual(resets, ['Login']);
    assert.equal(model.current, 'Login');
    assertNoOnboarding(model.routesSince(start), model.flows.slice(start));
    model.dispose();
  });

  it('2. callable failed, Auth confirms the same user → stays on Delete Account, retryable', async () => {
    const model = signedInModel(UID, CREATED_AT);
    const start = model.routes.length;
    await ambiguousFailure(model);

    const outcome = await reconcileWith(async () => undefined);
    assert.equal(outcome, 'exists');
    assert.equal(getPendingAccountDeletionState().pending?.phase, 'exists');
    model.profileEvent(null);
    model.profileEvent(COMPLETE_PROFILE);
    assert.equal(model.current, 'DeleteAccount');
    assert.equal(getAccountDeletionClosure(), null);

    const retry = await deleteAccountWithBackend({}, retryRuntime('DELETED'));
    assert.equal(retry.status, 'deleted');
    await localExit(model);
    assert.equal(model.current, 'Login');
    assertNoOnboarding(model.routesSince(start), model.flows.slice(start));
    model.dispose();
  });

  it('3. callable and Auth reload both fail offline → neutral retryable state, never DOB', async () => {
    const model = signedInModel(UID, CREATED_AT);
    const start = model.routes.length;
    await ambiguousFailure(model);

    const outcome = await reconcileWith(async () => {
      throw networkFailed;
    });
    assert.equal(outcome, 'unverified');
    assert.equal(getPendingAccountDeletionState().pending?.phase, 'unverified');
    assert.equal(getAccountDeletionClosure(), null, 'no success is shown');
    model.profileEvent(null);
    model.queuedProfileCallback(UID, null);
    assert.equal(model.current, 'DeleteAccount');
    assertNoOnboarding(model.routesSince(start), model.flows.slice(start));
    model.dispose();
  });

  it('4a. reconnect and retry the check → user-not-found → Login', async () => {
    const model = signedInModel(UID, CREATED_AT);
    const start = model.routes.length;
    await ambiguousFailure(model);
    await reconcileWith(async () => {
      throw networkFailed;
    });

    assert.equal(
      await reconcileWith(async () => {
        throw userNotFound;
      }),
      'deleted',
    );
    await localExit(model);
    assert.equal(model.current, 'Login');
    assertNoOnboarding(model.routesSince(start), model.flows.slice(start));
    model.dispose();
  });

  for (const status of ['DELETED', 'ALREADY_DELETED'] as const) {
    it(`4b. reconnect and repeat the callable → ${status} → Login`, async () => {
      const model = signedInModel(UID, CREATED_AT);
      const start = model.routes.length;
      await ambiguousFailure(model);
      await reconcileWith(async () => {
        throw networkFailed;
      });

      const retry = await deleteAccountWithBackend({}, retryRuntime(status));
      assert.equal(retry.status === 'deleted' && retry.backendStatus, status);
      assert.equal(getPendingAccountDeletionState().pending, null);
      assert.equal(model.current, 'Loader');
      await localExit(model);
      assert.equal(model.current, 'Login');
      assertNoOnboarding(model.routesSince(start), model.flows.slice(start));
      model.dispose();
    });
  }

  it('a retry that fails ambiguously again keeps the gate (no success, no DOB)', async () => {
    const model = signedInModel(UID, CREATED_AT);
    await ambiguousFailure(model);
    await reconcileWith(async () => undefined);
    await ambiguousFailure(model);
    assert.equal(getPendingAccountDeletionState().pending?.phase, 'reconciling');
    model.profileEvent(null);
    assert.equal(model.current, 'DeleteAccount');
    model.dispose();
  });

  for (const signOut of ['emits-null', 'throws'] as const) {
    it(`5. safe exit from the uncertain state (signOut ${signOut}) → Login, claims nothing`, async () => {
      const storage = memoryStorage();
      await hydratePendingAccountDeletion(storage);
      const model = signedInModel(UID, CREATED_AT);
      const start = model.routes.length;
      await ambiguousFailure(model);
      await reconcileWith(async () => {
        throw networkFailed;
      });

      const resets = await localExit(model, signOut);
      assert.deepEqual(resets, ['Login']);
      assert.equal(model.current, 'Login');
      assert.equal(getPendingAccountDeletionState().pending?.uid, UID, 'still unresolved');
      assert.ok(storage.data.has(PENDING_ACCOUNT_DELETION_STORAGE_KEY));
      assertNoOnboarding(model.routesSince(start), model.flows.slice(start));

      if (signOut === 'emits-null') {
        // Signing back into the same account resumes Delete Account, not DOB.
        model.authEmit(UID, CREATED_AT);
        assert.equal(getAccountDeletionClosure(), null);
        model.profileEvent(null);
        assert.equal(model.current, 'DeleteAccount');
      }
      model.dispose();
    });
  }

  it('signed out elsewhere while reconciling → Login without claiming deletion', async () => {
    const model = signedInModel(UID, CREATED_AT);
    await ambiguousFailure(model);
    const outcome = await reconcileWith(
      async () => {
        throw Object.assign(new Error('expired'), { code: 'auth/user-token-expired' });
      },
      () => null,
    );
    assert.equal(outcome, 'signed_out');
    assert.equal(getPendingAccountDeletionState().pending?.uid, UID);
    model.dispose();
  });
});

describe('unresolved deletion — relaunch', () => {
  beforeEach(() => {
    __resetAccountDeletionSessionForTests();
    __resetPendingAccountDeletionForTests();
  });

  async function crashDuringReconciliation() {
    const storage = memoryStorage();
    await hydratePendingAccountDeletion(storage);
    const model = signedInModel(UID, CREATED_AT);
    await ambiguousFailure(model);
    model.dispose();
    assert.ok(storage.data.has(PENDING_ACCOUNT_DELETION_STORAGE_KEY));
    // Process killed: in-memory state is gone, AsyncStorage survives.
    __resetAccountDeletionSessionForTests();
    __resetPendingAccountDeletionForTests();
    return storage;
  }

  it('6. offline relaunch restores the deleted user → Delete Account, never DOB', async () => {
    const storage = await crashDuringReconciliation();
    const model = new RootNavigatorModel();
    await model.launch(storage, UID, CREATED_AT);
    assert.equal(getPendingAccountDeletionState().pending?.phase, 'reconciling');
    model.profileEvent(null);
    model.queuedProfileCallback(UID, null);
    assert.equal(model.current, 'DeleteAccount');
    assertNoOnboarding(model.routes, model.flows);
    assert.equal(model.routes.includes('MainTabs'), false);

    assert.equal(
      await reconcileWith(async () => {
        throw userNotFound;
      }),
      'deleted',
    );
    await localExit(model);
    assert.equal(model.current, 'Login');
    assert.equal(storage.data.has(PENDING_ACCOUNT_DELETION_STORAGE_KEY), false);
    model.dispose();
  });

  it('online relaunch: Firebase already cleared the deleted user → Login', async () => {
    const storage = await crashDuringReconciliation();
    const model = new RootNavigatorModel();
    await model.launch(storage, null);
    assert.equal(model.current, 'Login');
    model.dispose();
  });

  it('a recreated account with the same uid is not the pending one → normal DOB', async () => {
    const storage = await crashDuringReconciliation();
    const model = new RootNavigatorModel();
    await model.launch(storage, UID, 'Thu, 08 Oct 2026 20:00:00 GMT');
    assert.equal(getPendingAccountDeletionState().pending, null);
    model.profileEvent(null);
    assert.equal(model.current, 'OnboardingBirthDate');
    model.dispose();
  });

  it('unreadable storage means nothing pending (normal users unaffected)', async () => {
    const model = new RootNavigatorModel();
    await model.launch(
      {
        getItem: async () => {
          throw new Error('storage');
        },
        setItem: async () => undefined,
        removeItem: async () => undefined,
      },
      UID,
      CREATED_AT,
    );
    model.profileEvent(COMPLETE_PROFILE);
    assert.equal(model.current, 'MainTabs');
    model.dispose();
  });
});

describe('unresolved deletion — normal flows unchanged', () => {
  beforeEach(() => {
    __resetAccountDeletionSessionForTests();
    __resetPendingAccountDeletionForTests();
  });

  it('definitive failures (nothing deleted) never engage the gate', async () => {
    for (const kind of ['RECENT_LOGIN_REQUIRED', 'APP_CHECK', 'UNAUTHENTICATED'] as const) {
      const result = await deleteAccountWithBackend({}, {
        ...retryRuntime('DELETED'),
        deleteMyAccount: async () => {
          throw new DeleteMyAccountError(kind, false);
        },
      });
      assert.equal(result.status, 'failed');
      assert.equal(getPendingAccountDeletionState().pending, null, kind);
    }
  });

  it('new registration still starts at DOB', async () => {
    const model = new RootNavigatorModel();
    await model.launch(memoryStorage(), 'uid-new', CREATED_AT);
    model.profileEvent(null);
    assert.equal(model.current, 'OnboardingBirthDate');
    model.dispose();
  });
});

describe('unresolved deletion — wiring guards', () => {
  const navigator = read('navigation/AppNavigator.tsx');
  const screen = read('screens/DeleteAccountScreen.tsx');
  const reconciliation = read('services/accountDeletionReconciliation.ts');
  const service = read('services/accountDeletion.ts');

  it('only an outcome where the backend may have deleted engages the gate', () => {
    assert.match(
      service,
      /if \(failure\.serverMayHaveDeleted\) \{[\s\S]*?markAccountDeletionUncertain\(\{[\s\S]*?\} else \{\s*endAccountDeletionSession\(\);\s*\}/,
    );
  });

  it('AppNavigator hydrates the marker before routing and keeps Visibility closed', () => {
    assert.match(
      navigator,
      /await hydratePendingAccountDeletion\(AsyncStorage\);\s*acknowledgeAuthIdentityForPendingDeletion\(/,
    );
    assert.ok(
      navigator.indexOf('await hydratePendingAccountDeletion') < navigator.indexOf('if (!user) {'),
    );
    assert.match(navigator, /!pendingDeletion\.hydrated/);
    assert.match(navigator, /pending: pendingDeletion\.pending,/);
  });

  it('the unresolved root stack offers Delete Account only, without gestures back', () => {
    const block = navigator.slice(
      navigator.indexOf("if (rootFlow === 'deletion-pending')"),
      navigator.indexOf('if (needsCompleteProfile) {'),
    );
    assert.match(block, /initialRouteName="DeleteAccount"/);
    assert.match(block, /gestureEnabled: false/);
    assert.deepEqual(
      [...block.matchAll(/<Stack\.Screen name="(\w+)"/g)].map((m) => m[1]),
      ['DeleteAccount', 'Login'],
    );
  });

  it('reconciliation only reloads Firebase Auth; it never reads or writes the profile', () => {
    for (const src of [reconciliation, screen]) {
      assert.doesNotMatch(
        src,
        /firebase\/firestore|getDoc\(|onSnapshot\(|setDoc\(|updateDoc\(|doc\([^)]*'users'/,
      );
    }
    assert.match(screen, /reloadCurrentUser: async \(\) => \{\s*await firebaseAuth\.currentUser\?\.reload\(\);/);
  });

  it('the screen hides Back while unresolved and offers retry plus sign-out', () => {
    assert.equal(screen.match(/\{pending \? null : \(/g)?.length, 2);
    assert.match(screen, /onPress=\{\(\) => void runReconciliation\(\)\}/);
    assert.match(screen, /onPress=\{\(\) => void runUnresolvedSignOut\(\)\}/);
    assert.match(
      screen,
      /const runUnresolvedSignOut[\s\S]*?runLocalSessionExit\(pending\.uid, \{\s*deleted: false,/,
    );
  });

  it('only a proven deletion (user-not-found) clears per-UID local state', () => {
    const recon = screen.slice(
      screen.indexOf('const runReconciliation'),
      screen.indexOf('const runUnresolvedSignOut'),
    );
    assert.match(
      recon,
      /if \(outcome === 'deleted'\) \{\s*await runLocalSessionExit\(pendingUid, \{\s*deleted: true,/,
    );
    assert.match(
      recon,
      /else if \(outcome === 'signed_out'\) \{\s*await runLocalSessionExit\(pendingUid, \{\s*deleted: false,/,
    );
    assert.match(reconciliation, /code === USER_NOT_FOUND\) \{\s*markAccountDeletionClosing\(expectedUid\);\s*clearPendingAccountDeletion\(\);/);
  });
});

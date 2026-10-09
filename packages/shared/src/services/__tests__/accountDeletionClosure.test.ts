import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

import {
  deleteAccountWithBackend,
  type AccountDeletionRequest,
  type AccountDeletionRuntime,
} from '../accountDeletion';
import {
  __resetAccountDeletionSessionForTests,
  acknowledgeAuthUserForAccountDeletion,
  finalizePostAccountDeletionSession,
  getAccountDeletionClosure,
  isAccountClosedByDeletion,
  isAccountDeletionSessionActive,
  markAccountDeletionClosing,
} from '../accountDeletionSession';
import { __resetPendingAccountDeletionForTests } from '../accountDeletionReconciliation';
import { AccountDeletionReauthError } from '../deletionReauth';
import { DeleteMyAccountError, type DeleteMyAccountStatus } from '../deleteMyAccount/contract';
import {
  resolveProfileSubscriptionUid,
  resolveRootFlowKind,
} from '../../navigation/rootFlowDecision';
import { resolveAuthenticatedStackInitialRoute } from '../../phoneOtp/onboardingResolver';
import {
  COMPLETE_PROFILE,
  ONBOARDING_ROUTES,
  RootNavigatorModel,
  signedInModel as signedInModelFor,
} from './helpers/rootNavigatorModel';

const sharedSrc = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(sharedSrc, rel), 'utf8');

const UID = 'uid-closing';
const NOW = Date.parse('2026-10-08T12:00:00Z');
const COMPLETE_PROFILE = { profileSetupCompleted: true };
function signedInModel(deletionBarriers = true): RootNavigatorModel {
  if (deletionBarriers) return signedInModelFor(UID);
  const model = new RootNavigatorModel(false);
  model.authEmit(UID);
  model.profileEvent(COMPLETE_PROFILE);
  assert.equal(model.current, 'MainTabs');
  return model;
}

function runtimeFor(
  model: RootNavigatorModel,
  input: {
    status?: DeleteMyAccountStatus;
    reauth?: () => Promise<void>;
    reauthKinds?: string[];
  } = {},
): AccountDeletionRuntime {
  return {
    getCurrentUid: () => UID,
    getAuthTimeMs: async () => NOW - 3_600_000,
    nowMs: () => NOW,
    reauthenticate: async (request) => {
      input.reauthKinds?.push(request.method.kind);
      await input.reauth?.();
    },
    deleteMyAccount: async () => {
      // The backend removes users/{uid} before deleting Auth.
      model.profileEvent(null);
      return { ok: true, status: input.status ?? 'DELETED' };
    },
  };
}

type SignOutMode = 'emits-null' | 'throws' | 'delayed';

async function finalizeAfterSuccess(model: RootNavigatorModel, mode: SignOutMode) {
  const resets: { name: string }[][] = [];
  const result = await finalizePostAccountDeletionSession({
    closedUid: UID,
    ensureSignedOut: async () => {
      // Firestore re-emits active listeners on the credential change.
      model.profileEvent(null);
      model.queuedProfileCallback(UID, null);
      if (mode === 'throws') throw new Error('persistence removal failed');
      if (mode === 'emits-null') model.authEmit(null);
    },
    navigation: { isReady: () => true, reset: (state) => resets.push(state.routes) },
  });
  return { result, resets };
}

/** No onboarding at all; no authenticated Home once the closure engaged. */
function assertNeverOnboardingAfter(model: RootNavigatorModel, from: number) {
  const routes = model.routesSince(from);
  for (const route of routes) {
    assert.equal(ONBOARDING_ROUTES.has(route), false, `reached ${route}`);
  }
  assert.equal(model.flows.slice(from).includes('auth-complete'), false);
  const closedAt = routes.indexOf('Loader');
  assert.ok(closedAt >= 0, 'closure barrier engaged');
  assert.equal(routes.slice(closedAt).includes('MainTabs'), false, 'reached MainTabs');
}

describe('account closure barrier — successful deletion always ends on Login', () => {
  beforeEach(() => {
    __resetAccountDeletionSessionForTests();
    __resetPendingAccountDeletionForTests();
  });

  const methods: { label: string; request: AccountDeletionRequest; kind: string }[] = [
    {
      label: 'Password',
      request: { reauth: { method: { kind: 'password' }, password: 'secret' } },
      kind: 'password',
    },
    {
      label: 'Google',
      request: { reauth: { method: { kind: 'google' } }, reauthOnlyIfStale: true },
      kind: 'google',
    },
    {
      label: 'Apple',
      request: { reauth: { method: { kind: 'apple' } }, reauthOnlyIfStale: true },
      kind: 'apple',
    },
    {
      label: 'Facebook',
      request: { reauth: { method: { kind: 'facebook' } }, reauthOnlyIfStale: true },
      kind: 'facebook',
    },
  ];

  for (const { label, request, kind } of methods) {
    it(`${label} success → Login, never DOB / OTP / Complete Profile / Home`, async () => {
      const model = signedInModel();
      const start = model.routes.length;
      const reauthKinds: string[] = [];

      const result = await deleteAccountWithBackend(
        request,
        runtimeFor(model, { reauthKinds }),
      );
      assert.equal(result.status, 'deleted');
      assert.deepEqual(reauthKinds, [kind]);
      assert.equal(model.current, 'Loader', 'neutral loader while closing');

      const { resets } = await finalizeAfterSuccess(model, 'emits-null');
      assert.deepEqual(resets, [[{ name: 'Login' }]]);
      assert.equal(model.uid, null);
      assert.equal(model.current, 'Login');
      assertNeverOnboardingAfter(model, start);
      model.dispose();
    });
  }

  it('profile deleted before Auth null → the Profile Gate is never evaluated', async () => {
    const model = signedInModel();
    const start = model.routes.length;
    const result = await deleteAccountWithBackend({}, {
      ...runtimeFor(model),
      getAuthTimeMs: async () => NOW - 10_000,
    });
    assert.equal(result.status, 'deleted');
    assert.equal(model.uid, UID, 'Auth still exposes the deleted user');

    model.profileEvent(null);
    model.queuedProfileCallback(UID, null);
    assert.equal(resolveProfileSubscriptionUid(UID, getAccountDeletionClosure()), null);
    assert.equal(model.current, 'Loader');
    assertNeverOnboardingAfter(model, start);
    model.dispose();
  });

  it('Auth null arrives late → neutral loader, then Login; never DOB', async () => {
    const model = signedInModel();
    const start = model.routes.length;
    await deleteAccountWithBackend({}, {
      ...runtimeFor(model),
      getAuthTimeMs: async () => NOW - 10_000,
    });
    assert.equal(model.current, 'Loader');

    await finalizeAfterSuccess(model, 'delayed');
    assert.equal(isAccountDeletionSessionActive(), false, 'in-flight flag released');
    assert.equal(model.uid, UID, 'Auth has not emitted null yet');
    assert.equal(model.current, 'Login');

    // The exact b646c7d window: barrier released, uid still set, profile missing.
    model.profileEvent(null);
    model.queuedProfileCallback(UID, null);
    assert.equal(model.current, 'Login');

    model.authEmit(null);
    assert.equal(model.current, 'Login');
    assert.equal(getAccountDeletionClosure()?.phase, 'signed_out');
    assertNeverOnboardingAfter(model, start);
    model.dispose();
  });

  it('signOut throws after the backend deleted Auth → Login, no onboarding', async () => {
    const model = signedInModel();
    const start = model.routes.length;
    await deleteAccountWithBackend({}, {
      ...runtimeFor(model),
      getAuthTimeMs: async () => NOW - 10_000,
    });

    const { result } = await finalizeAfterSuccess(model, 'throws');
    assert.equal(result.authCleared, true);
    assert.equal(model.uid, UID, 'no Auth null was ever delivered');
    model.profileEvent(null);
    model.queuedProfileCallback(UID, null);
    model.authEmit(UID);
    assert.equal(model.current, 'Login');
    assertNeverOnboardingAfter(model, start);
    model.dispose();
  });

  it('ALREADY_DELETED → Login', async () => {
    const model = signedInModel();
    const start = model.routes.length;
    const result = await deleteAccountWithBackend({}, {
      ...runtimeFor(model, { status: 'ALREADY_DELETED' }),
      getAuthTimeMs: async () => NOW - 10_000,
    });
    assert.equal(result.status === 'deleted' && result.backendStatus, 'ALREADY_DELETED');
    await finalizeAfterSuccess(model, 'emits-null');
    assert.equal(model.current, 'Login');
    assertNeverOnboardingAfter(model, start);
    model.dispose();
  });

  it('b646c7d without the closure barrier: the same race reached OnboardingBirthDate', async () => {
    const model = signedInModel(false);
    await deleteAccountWithBackend({}, {
      ...runtimeFor(model),
      getAuthTimeMs: async () => NOW - 10_000,
    });
    await finalizeAfterSuccess(model, 'throws');
    model.profileEvent(null);
    assert.equal(model.current, 'OnboardingBirthDate');
    model.dispose();
  });
});

describe('account closure barrier — no false positives', () => {
  beforeEach(() => {
    __resetAccountDeletionSessionForTests();
    __resetPendingAccountDeletionForTests();
  });

  for (const code of ['CANCELLED', 'WRONG_PASSWORD', 'REAUTH_FAILED'] as const) {
    it(`reauth ${code} → stays on Delete Account (authenticated Main), no closure`, async () => {
      const model = signedInModel();
      const start = model.routes.length;
      const result = await deleteAccountWithBackend(
        { reauth: { method: { kind: 'password' }, password: 'bad' } },
        runtimeFor(model, {
          reauth: async () => {
            throw new AccountDeletionReauthError(code, 'settings.deleteAccount.reauthError');
          },
        }),
      );
      assert.notEqual(result.status, 'deleted');
      assert.equal(getAccountDeletionClosure(), null);
      assert.equal(isAccountDeletionSessionActive(), false);
      model.profileEvent(COMPLETE_PROFILE);
      assert.deepEqual(model.routesSince(start), ['MainTabs']);
      model.dispose();
    });
  }

  it('ambiguous callable failure does not engage the closure barrier', async () => {
    const model = signedInModel();
    const result = await deleteAccountWithBackend({}, {
      ...runtimeFor(model),
      getAuthTimeMs: async () => NOW - 10_000,
      deleteMyAccount: async () => {
        throw new DeleteMyAccountError('NETWORK_UNCERTAIN', true);
      },
    });
    assert.equal(result.status, 'failed');
    assert.equal(getAccountDeletionClosure(), null);
    model.dispose();
  });

  it('normal new registration keeps DOB first (then OTP → CRJ, unchanged)', () => {
    const model = new RootNavigatorModel();
    model.authEmit('uid-new');
    model.profileEvent(null);
    assert.equal(model.current, 'OnboardingBirthDate');
    assert.equal(resolveAuthenticatedStackInitialRoute(null), 'OnboardingBirthDate');
    model.dispose();
  });

  it('after a deletion, a new account (other uid) still registers through DOB', async () => {
    const model = signedInModel();
    await deleteAccountWithBackend({}, {
      ...runtimeFor(model),
      getAuthTimeMs: async () => NOW - 10_000,
    });
    await finalizeAfterSuccess(model, 'emits-null');
    assert.equal(model.current, 'Login');

    model.authEmit('uid-new');
    assert.equal(getAccountDeletionClosure(), null);
    model.profileEvent(null);
    assert.equal(model.current, 'OnboardingBirthDate');
    model.dispose();
  });

  it('same deterministic uid signing up again after sign-out registers through DOB', async () => {
    const model = signedInModel();
    await deleteAccountWithBackend({}, {
      ...runtimeFor(model),
      getAuthTimeMs: async () => NOW - 10_000,
    });
    await finalizeAfterSuccess(model, 'emits-null');

    model.authEmit(UID);
    assert.equal(getAccountDeletionClosure(), null);
    model.profileEvent(null);
    assert.equal(model.current, 'OnboardingBirthDate');
    model.dispose();
  });
});

describe('account closure state machine', () => {
  beforeEach(() => {
    __resetAccountDeletionSessionForTests();
    __resetPendingAccountDeletionForTests();
  });

  it('closing → closed (finalize) → signed_out (Auth null) → cleared (next sign-in)', async () => {
    markAccountDeletionClosing(UID);
    assert.deepEqual(getAccountDeletionClosure(), { uid: UID, phase: 'closing' });
    await finalizePostAccountDeletionSession({ closedUid: UID });
    assert.deepEqual(getAccountDeletionClosure(), { uid: UID, phase: 'closed' });
    acknowledgeAuthUserForAccountDeletion(UID);
    assert.equal(getAccountDeletionClosure()?.phase, 'closed', 'same uid keeps the barrier');
    acknowledgeAuthUserForAccountDeletion(null);
    assert.deepEqual(getAccountDeletionClosure(), { uid: UID, phase: 'signed_out' });
    assert.equal(isAccountClosedByDeletion(UID), true, 'until React commits uid=null');
    assert.equal(
      resolveRootFlowKind({
        loading: false,
        uid: UID,
        needsCompleteProfile: false,
        closure: getAccountDeletionClosure(),
      }),
      'guest',
    );
    acknowledgeAuthUserForAccountDeletion('uid-other');
    assert.equal(getAccountDeletionClosure(), null);
  });

  it('Auth null is acknowledged before React applies uid=null → Login, never Home', async () => {
    const model = signedInModel();
    markAccountDeletionClosing(UID);
    acknowledgeAuthUserForAccountDeletion(null);
    assert.equal(model.uid, UID);
    assert.equal(model.current, 'Login');
    model.dispose();
  });

  it('Auth null during finalize is not overwritten back to closed', async () => {
    markAccountDeletionClosing(UID);
    await finalizePostAccountDeletionSession({
      closedUid: UID,
      ensureSignedOut: async () => acknowledgeAuthUserForAccountDeletion(null),
    });
    assert.equal(getAccountDeletionClosure()?.phase, 'signed_out');
  });

  it('closing renders the neutral loader; closed renders guest', () => {
    const base = { loading: false, uid: UID, needsCompleteProfile: true };
    assert.equal(resolveRootFlowKind({ ...base, closure: { uid: UID, phase: 'closing' } }), 'loading');
    assert.equal(resolveRootFlowKind({ ...base, closure: { uid: UID, phase: 'closed' } }), 'guest');
    assert.equal(resolveRootFlowKind({ ...base, closure: null }), 'auth-complete');
    assert.equal(
      resolveRootFlowKind({ ...base, uid: 'uid-other', closure: { uid: UID, phase: 'closed' } }),
      'auth-complete',
    );
  });
});

describe('AppNavigator wiring of the closure barrier', () => {
  const src = read('navigation/AppNavigator.tsx');

  it('acknowledges every Auth emission before any routing state', () => {
    assert.match(
      src,
      /onAuthStateChanged\(async \(user\) => \{\s*acknowledgeAuthUserForAccountDeletion\(user\?\.uid \?\? null\);/,
    );
    assert.match(
      src,
      /if \(isAccountClosedByDeletion\(refreshedUser\.uid\)\) return;\s*\n\s*if \(isAccountDeletionPendingFor\(refreshedUser\.uid\)\) \{[\s\S]*?closeVisibilitySessionGate\(\);[\s\S]*?return;\s*\}\s*\n\s*openVisibilitySessionGate/,
    );
  });

  it('profile listener is keyed on the barrier-aware uid and guards queued callbacks', () => {
    assert.match(
      src,
      /resolveProfileSubscriptionUid\(uid, accountClosure, pendingDeletion\.pending\)/,
    );
    assert.match(src, /\}, \[profileUid\]\);/);
    assert.equal(src.match(/if \(isProfileGateSuspendedFor\(profileUid\)\) return;/g)?.length, 3);
    assert.match(
      src,
      /function isProfileGateSuspendedFor\(uid: string\): boolean \{\s*return isAccountClosedByDeletion\(uid\) \|\| isAccountDeletionPendingFor\(uid\);/,
    );
  });

  it('root render goes through resolveRootFlowKind with the reactive closure', () => {
    assert.match(src, /useSyncExternalStore\(\s*subscribeAccountDeletionClosure,\s*getAccountDeletionClosure,?\s*\)/);
    assert.match(src, /resolveRootFlowKind\(\{[\s\S]*closure: accountClosure,/);
    assert.match(src, /if \(rootFlow === 'loading'\) \{\s*return <FullScreenLoader \/>;/);
    assert.match(src, /if \(rootFlow === 'guest' \|\| !uid\) \{/);
    assert.ok(
      src.indexOf("if (rootFlow === 'guest' || !uid)") < src.indexOf('if (needsCompleteProfile) {'),
      'the closure decision runs before the Profile Gate',
    );
  });

  it('guest stack opens on Login after a deletion', () => {
    assert.match(
      src,
      /initialRouteName=\{\s*accountClosure \? 'Login' : guestInitialRoute\(hasChosenTheme, hasSeenWelcome\)\s*\}/,
    );
  });

  it('deleteAccountWithBackend engages the barrier only on confirmed success', () => {
    const service = read('services/accountDeletion.ts');
    assert.match(
      service,
      /markAccountDeletionClosing\(uid\);\s*clearPendingAccountDeletion\(\);\s*return \{ status: 'deleted', uid, backendStatus: response\.status \};/,
    );
    assert.equal(service.match(/markAccountDeletionClosing\(/g)?.length, 1);
  });

  it('DeleteAccountScreen passes the closed uid to finalize', () => {
    const screen = read('screens/DeleteAccountScreen.tsx');
    assert.match(screen, /finalizePostAccountDeletionSession\(\{\s*closedUid,/);
  });
});

/**
 * Account deletion → Login, end to end without React Navigation.
 *
 * Composes the real Delete Account flow, the exit barrier, the real profile
 * gate and the deletion-aware wrapper with a model of AppNavigator (Auth
 * listener → setUid/noteAuthState, profile-gate effect keyed on uid and
 * suspension, root view resolution), then records every root view rendered.
 *
 * Run:
 *   node --experimental-strip-types --test packages/shared/src/navigation/__tests__/accountDeletionRootGate.test.ts
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createAccountDeletionExitStore,
  type AccountDeletionPhase,
} from '../../accountDeletion/accountDeletionExit.ts';
import {
  createDeleteAccountFlow,
  runAccountDeletionCleanup,
  type DeleteAccountMethod,
  type DeleteAccountOutcome,
} from '../../accountDeletion/deleteAccountCore.ts';
import {
  createAuthenticatedProfileGate,
  type AuthenticatedProfileFlow,
} from '../profileGate.ts';
import {
  createDeletionAwareProfileGate,
  isProfileGateSuspended,
  resolveRootView,
  resolveSessionUid,
  type RootView,
} from '../accountDeletionRootGate.ts';

const DELETED_UID = 'Zq7xWv3tRs9pNm5kLj1hGf8dCb2a';
const OTHER_UID = 'Yp6wVu2sQr8oMl4kJi0hGe7dBa1z';
const ABSENT_MS = 5;
const CALLABLE_MS = 25;
const COMPLETE_PROFILE = { profileSetupCompleted: true };
const ONBOARDING_KINDS = new Set(['OnboardingBirthDate', 'PhoneVerification', 'ProfileCompletion']);

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type SignOutMode = 'emits' | 'emits_late' | 'throws';

type RootOptions = {
  signOut?: SignOutMode;
  callable?: (backend: Backend) => Promise<unknown>;
  withoutBarrier?: boolean;
};

type Backend = {
  deleteProfile: (uid: string) => void;
  deleteAuthUser: () => void;
};

function createRoot(options: RootOptions = {}) {
  const exit = createAccountDeletionExitStore();
  const docs = new Map<string, unknown>();
  const docListeners = new Map<string, Set<(data: unknown) => void>>();
  const notifyDoc = (uid: string) => {
    for (const listener of [...(docListeners.get(uid) ?? [])]) listener(docs.get(uid) ?? null);
  };

  const gate = createDeletionAwareProfileGate({
    gate: createAuthenticatedProfileGate({
      listen: (uid, onData) => {
        const set = docListeners.get(uid) ?? new Set();
        docListeners.set(uid, set);
        set.add(onData);
        queueMicrotask(() => {
          if (set.has(onData)) onData(docs.get(uid) ?? null);
        });
        return () => set.delete(onData);
      },
      get: async (uid) => docs.get(uid) ?? null,
      absentConfirmMs: ABSENT_MS,
    }),
    exit,
  });

  // AppNavigator model.
  let uid: string | null = null;
  let phase: AccountDeletionPhase = exit.getPhase();
  let profileFlow: AuthenticatedProfileFlow = { kind: 'loading' };
  let effectKey = '';
  const views: RootView[] = [];
  const delivered: AuthenticatedProfileFlow['kind'][] = [];
  const phases: AccountDeletionPhase[] = [phase];
  let viewsAtConfirm = -1;

  const render = () => {
    const view = resolveRootView({
      deletionPhase: phase,
      uid,
      startupLoading: false,
      profileFlowKind: profileFlow.kind,
    });
    if (views.at(-1) !== view) views.push(view);
  };
  const setProfileFlow = (flow: AuthenticatedProfileFlow) => {
    profileFlow = flow;
    delivered.push(flow.kind);
    render();
  };
  const runGateEffect = () => {
    const suspended = isProfileGateSuspended(phase);
    const key = `${uid}|${suspended}`;
    if (key === effectKey) return;
    effectKey = key;
    gate.stop();
    if (!uid || suspended) {
      profileFlow = { kind: 'loading' };
      return;
    }
    gate.start(uid, setProfileFlow);
  };
  const commit = () => {
    render();
    runGateEffect();
    render();
  };

  gate.connect();
  exit.subscribe(() => {
    phase = exit.getPhase();
    phases.push(phase);
    if (phase === 'exiting') viewsAtConfirm = views.length;
    commit();
  });

  // Firebase Auth model.
  let authUser: string | null = null;
  let providerIds: string[] = [];
  let signOutCalls = 0;
  const emitAuth = (next: string | null) => {
    uid = next;
    if (!next) profileFlow = { kind: 'loading' };
    exit.noteAuthState(next);
    commit();
  };
  const signInAs = (next: string, providers: string[]) => {
    authUser = next;
    providerIds = providers;
    emitAuth(next);
  };

  const backend: Backend = {
    deleteProfile: (target) => {
      docs.delete(target);
      notifyDoc(target);
    },
    deleteAuthUser: () => undefined,
  };
  const calls: string[] = [];
  const cleanupSteps: string[] = [];

  const defaultCallable = async () => {
    // Backend order: data (users/{uid}) first, Auth user last, then reply.
    backend.deleteProfile(DELETED_UID);
    await sleep(CALLABLE_MS);
    backend.deleteAuthUser();
    return { ok: true, status: 'DELETED' };
  };

  const deleteAccount = createDeleteAccountFlow({
    getCurrentUser: () => (authUser ? { uid: authUser, providerIds } : null),
    reauthenticate: {
      password: async ({ password }) => {
        if (password !== 'right-password') {
          throw Object.assign(new Error('x'), { code: 'auth/wrong-password' });
        }
      },
      google: async () => undefined,
      facebook: async () => undefined,
    },
    invokeCallable: async () => {
      calls.push('deleteMyAccount');
      return (options.callable ?? defaultCallable)(backend);
    },
    cleanupAfterDeletion: (target) =>
      runAccountDeletionCleanup(target, {
        clearSocialPrefill: () => void cleanupSteps.push('prefill'),
        closePublicationGate: () => void cleanupSteps.push('publication'),
        stopBackground: async () => {
          cleanupSteps.push('background');
          await sleep(10);
        },
        drainInFlightPublications: async () => {
          cleanupSteps.push('drain');
          await sleep(10);
        },
        signOutProviderSessions: () => void cleanupSteps.push('providers'),
        signOut: async () => {
          signOutCalls += 1;
          cleanupSteps.push('signOut');
          const mode = options.signOut ?? 'emits';
          if (mode === 'throws') throw Object.assign(new Error('x'), { code: 'auth/internal-error' });
          authUser = null;
          if (mode === 'emits') {
            queueMicrotask(() => emitAuth(null));
          } else {
            setTimeout(() => emitAuth(null), 30);
          }
        },
        clearLocalAccountState: async () => void cleanupSteps.push('local'),
      }),
    exitBarrier: options.withoutBarrier ? undefined : exit,
  });

  return {
    exit,
    docs,
    views,
    delivered,
    phases,
    calls,
    cleanupSteps,
    get viewsAtConfirm() {
      return viewsAtConfirm;
    },
    get signOutCalls() {
      return signOutCalls;
    },
    get view() {
      return views.at(-1);
    },
    get phase() {
      return phase;
    },
    setDoc(target: string, data: unknown) {
      docs.set(target, data);
      notifyDoc(target);
    },
    signInAs,
    emitAuth,
    deleteAccount,
  };
}

type Root = ReturnType<typeof createRoot>;

async function signedInAtHome(root: Root, providers: string[]) {
  root.docs.set(DELETED_UID, COMPLETE_PROFILE);
  root.signInAs(DELETED_UID, providers);
  await sleep(ABSENT_MS * 2);
  assert.equal(root.view, 'main');
}

/** After success nothing but the neutral loader and the guest stack (Login). */
function assertExitedToLogin(root: Root) {
  assert.equal(root.view, 'guest');
  assert.ok(root.viewsAtConfirm >= 0, 'barrier was activated');
  const afterConfirm = root.views.slice(root.viewsAtConfirm);
  assert.ok(
    afterConfirm.every((v) => v === 'loader' || v === 'guest'),
    `views after confirmation: ${afterConfirm.join(' → ')}`,
  );
  assert.ok(!root.views.includes('onboarding'), `views: ${root.views.join(' → ')}`);
  assert.ok(!root.views.includes('profile_error'));
  assert.ok(!root.delivered.some((k) => ONBOARDING_KINDS.has(k)), 'no onboarding flow delivered');
}

const PROVIDER_CASES: Array<{
  method: DeleteAccountMethod;
  providerId: string;
  password?: string;
}> = [
  { method: 'password', providerId: 'password', password: 'right-password' },
  { method: 'google', providerId: 'google.com' },
  { method: 'facebook', providerId: 'facebook.com' },
];

describe('Confirmed deletion closes to Login, never DOB (every provider)', () => {
  for (const { method, providerId, password } of PROVIDER_CASES) {
    it(`${method}: success → loader → Login; profile gate never resolves onboarding`, async () => {
      const root = createRoot();
      await signedInAtHome(root, [providerId]);

      const outcome = await root.deleteAccount({ method, password });
      await sleep(5);

      assert.deepEqual(outcome, { status: 'deleted', alreadyDeleted: false });
      assert.deepEqual(root.calls, ['deleteMyAccount']);
      assert.equal(root.signOutCalls, 1);
      assertExitedToLogin(root);
      assert.equal(root.phase, 'idle');
      assert.deepEqual(root.phases, ['idle', 'deleting', 'exiting', 'idle']);
    });
  }

  it('multi-provider account: the chosen method deletes and closes the same way', async () => {
    const root = createRoot();
    await signedInAtHome(root, ['password', 'google.com', 'facebook.com']);
    const outcome = await root.deleteAccount({ method: 'facebook' });
    await sleep(5);
    assert.equal(outcome.status, 'deleted');
    assertExitedToLogin(root);
  });
});

describe('Race windows between the backend and local Auth', () => {
  it('control: without the barrier the same timeline opens DOB (QA bug)', async () => {
    const root = createRoot({ withoutBarrier: true });
    await signedInAtHome(root, ['password']);
    await root.deleteAccount({ method: 'password', password: 'right-password' });
    await sleep(5);
    assert.ok(root.delivered.includes('OnboardingBirthDate'));
    assert.ok(root.views.includes('onboarding'));
  });

  it('profile disappears (and the absent-doc confirm fires) before Auth is null → no profile gate', async () => {
    const root = createRoot();
    await signedInAtHome(root, ['password']);
    const viewsBefore = root.views.length;
    const pending = root.deleteAccount({ method: 'password', password: 'right-password' });

    // Mid-request: document gone, confirm window elapsed, Auth still signed in.
    await sleep(CALLABLE_MS - 5);
    assert.equal(root.phase, 'deleting');
    assert.equal(root.view, 'main', 'Delete Account stays mounted while the call runs');
    assert.equal(root.views.length, viewsBefore, 'no loader or onboarding during the call');

    await pending;
    await sleep(5);
    assertExitedToLogin(root);
  });

  it('Auth slow to emit null → exit state (loader / signed-out root), never DOB', async () => {
    const root = createRoot({ signOut: 'emits_late' });
    await signedInAtHome(root, ['google.com']);
    const outcome = await root.deleteAccount({ method: 'google' });
    assert.equal(outcome.status, 'deleted');

    assert.equal(root.phase, 'signed_out');
    assert.equal(root.view, 'guest');
    await sleep(40);
    assert.equal(root.phase, 'idle');
    assertExitedToLogin(root);
  });

  it('signOut throws after confirmed success → deleted session treated as signed out', async () => {
    const root = createRoot({ signOut: 'throws' });
    await signedInAtHome(root, ['facebook.com']);
    const outcome = await root.deleteAccount({ method: 'facebook' });
    await sleep(ABSENT_MS * 4);

    assert.equal(outcome.status, 'deleted');
    assert.deepEqual(root.cleanupSteps.slice(-2), ['signOut', 'local']);
    assert.equal(root.phase, 'signed_out');
    assertExitedToLogin(root);
    assert.ok(!root.views.slice(root.viewsAtConfirm).includes('main'), 'no Home');

    // The deleted session re-emitted by Auth never reopens the profile gate.
    root.emitAuth(DELETED_UID);
    await sleep(ABSENT_MS * 4);
    assert.equal(root.phase, 'signed_out');
    assertExitedToLogin(root);

    // A later sign-in with another account goes through the normal gate.
    root.docs.set(OTHER_UID, COMPLETE_PROFILE);
    root.signInAs(OTHER_UID, ['password']);
    await sleep(ABSENT_MS * 2);
    assert.equal(root.phase, 'idle');
    assert.equal(root.view, 'main');
  });

  it('ALREADY_DELETED (account no longer exists) closes to Login the same way', async () => {
    const root = createRoot({
      callable: async (backend) => {
        backend.deleteProfile(DELETED_UID);
        await sleep(5);
        return { ok: true, status: 'ALREADY_DELETED' };
      },
    });
    await signedInAtHome(root, ['password']);
    const outcome = await root.deleteAccount({ method: 'password', password: 'right-password' });
    await sleep(5);
    assert.deepEqual(outcome, { status: 'deleted', alreadyDeleted: true });
    assertExitedToLogin(root);
  });

  it('account already gone (auth/user-not-found, Auth drops the user) → Login, no onboarding', async () => {
    let rootRef: Root | null = null;
    const root = createRoot({
      callable: async (backend) => {
        backend.deleteProfile(DELETED_UID);
        await sleep(ABSENT_MS * 3);
        rootRef?.emitAuth(null);
        throw Object.assign(new Error('x'), { code: 'auth/user-not-found' });
      },
    });
    rootRef = root;
    await signedInAtHome(root, ['google.com']);
    const outcome = await root.deleteAccount({ method: 'google' });
    await sleep(5);
    assert.equal(outcome.status, 'failed');
    assert.equal(root.view, 'guest');
    assert.ok(!root.views.includes('onboarding'));
    assert.deepEqual(root.cleanupSteps, []);
  });
});

describe('No confirmed success → barrier untouched or released, nothing cleaned', () => {
  it('wrong password: barrier never activated, account stays on the screen', async () => {
    const root = createRoot();
    await signedInAtHome(root, ['password']);
    const outcome = await root.deleteAccount({ method: 'password', password: 'wrong' });
    assert.equal(outcome.status, 'failed');
    assert.deepEqual(root.phases, ['idle']);
    assert.deepEqual(root.calls, []);
    assert.deepEqual(root.cleanupSteps, []);
    assert.deepEqual(root.views, ['loader', 'main']);
  });

  it('cancelled provider reauth: barrier never activated', async () => {
    const root = createRoot();
    await signedInAtHome(root, ['google.com']);
    const flow = createDeleteAccountFlow({
      getCurrentUser: () => ({ uid: DELETED_UID, providerIds: ['google.com'] }),
      reauthenticate: {
        google: async () => {
          throw Object.assign(new Error('x'), { code: 'CANCELLED' });
        },
      },
      invokeCallable: async () => {
        throw new Error('must not run');
      },
      cleanupAfterDeletion: async () => {
        throw new Error('must not run');
      },
      exitBarrier: root.exit,
    });
    const outcome = await flow({ method: 'google' });
    assert.equal(outcome.status, 'failed');
    assert.deepEqual(root.phases, ['idle']);
    assert.equal(root.view, 'main');
  });

  for (const [label, callable] of [
    [
      'network error',
      async () => {
        await sleep(5);
        throw Object.assign(new Error('x'), { code: 'functions/unavailable' });
      },
    ],
    [
      'backend error',
      async () => {
        await sleep(5);
        throw Object.assign(new Error('x'), {
          code: 'functions/internal',
          details: { reason: 'DELETION_RETRYABLE' },
        });
      },
    ],
    ['unconfirmed response', async () => ({ ok: true })],
  ] as const) {
    it(`${label}: no navigation, no cleanup, barrier released`, async () => {
      const root = createRoot({ callable });
      await signedInAtHome(root, ['password']);
      const outcome: DeleteAccountOutcome = await root.deleteAccount({
        method: 'password',
        password: 'right-password',
      });
      assert.equal(outcome.status, 'failed');
      assert.deepEqual(root.phases, ['idle', 'deleting', 'idle']);
      assert.deepEqual(root.cleanupSteps, []);
      assert.equal(root.signOutCalls, 0);
      assert.deepEqual(root.views, ['loader', 'main']);
    });
  }

  it('double tap → a single deleteMyAccount call and a single exit', async () => {
    const root = createRoot();
    await signedInAtHome(root, ['facebook.com']);
    const [first, second] = await Promise.all([
      root.deleteAccount({ method: 'facebook' }),
      root.deleteAccount({ method: 'facebook' }),
    ]);
    await sleep(5);
    assert.equal(first.status, 'deleted');
    assert.deepEqual(second, { status: 'in_progress' });
    assert.deepEqual(root.calls, ['deleteMyAccount']);
    assert.equal(root.signOutCalls, 1);
    assertExitedToLogin(root);
  });
});

describe('Regressions: normal registration, logout and profile gate', () => {
  it('new registration still goes DOB → OTP → CRJ → Home', async () => {
    const root = createRoot();
    root.signInAs(OTHER_UID, ['password']);
    await sleep(ABSENT_MS * 3);
    assert.equal(root.delivered.at(-1), 'OnboardingBirthDate');
    assert.equal(root.view, 'onboarding');

    root.setDoc(OTHER_UID, { profileSetupCompleted: false, birthDate: '1990-06-15', phoneVerified: false });
    assert.equal(root.delivered.at(-1), 'PhoneVerification');
    root.setDoc(OTHER_UID, { profileSetupCompleted: false, birthDate: '1990-06-15', phoneVerified: true });
    assert.equal(root.delivered.at(-1), 'ProfileCompletion');
    assert.equal(root.view, 'onboarding');
    root.setDoc(OTHER_UID, COMPLETE_PROFILE);
    assert.equal(root.view, 'main');
    assert.deepEqual(root.phases, ['idle']);
  });

  it('normal logout → guest; signing back in runs the profile gate as before', async () => {
    const root = createRoot();
    await signedInAtHome(root, ['password']);
    root.emitAuth(null);
    assert.equal(root.view, 'guest');
    root.signInAs(DELETED_UID, ['password']);
    await sleep(ABSENT_MS * 2);
    assert.equal(root.view, 'main');
    assert.deepEqual(root.phases, ['idle']);
  });

  it('profile read errors still reach the profile-gate error view when idle', () => {
    assert.equal(
      resolveRootView({
        deletionPhase: 'idle',
        uid: OTHER_UID,
        startupLoading: false,
        profileFlowKind: 'profile_read_error',
      }),
      'profile_error',
    );
  });
});

describe('resolveRootView / resolveSessionUid', () => {
  const base = { uid: OTHER_UID, startupLoading: false } as const;

  it('exiting is always the neutral loader, whatever the profile flow says', () => {
    for (const kind of ['OnboardingBirthDate', 'PhoneVerification', 'ProfileCompletion', 'MainTabs', 'profile_read_error', 'loading'] as const) {
      assert.equal(resolveRootView({ ...base, deletionPhase: 'exiting', profileFlowKind: kind }), 'loader');
    }
  });

  it('signed_out renders the guest root even while Auth still holds the user', () => {
    assert.equal(resolveSessionUid('signed_out', OTHER_UID), null);
    for (const kind of ['OnboardingBirthDate', 'MainTabs', 'loading'] as const) {
      assert.equal(resolveRootView({ ...base, deletionPhase: 'signed_out', profileFlowKind: kind }), 'guest');
    }
  });

  it('deleting keeps the current tree; Auth dropping mid-request shows the loader', () => {
    assert.equal(resolveRootView({ ...base, deletionPhase: 'deleting', profileFlowKind: 'MainTabs' }), 'main');
    assert.equal(
      resolveRootView({ ...base, uid: null, deletionPhase: 'deleting', profileFlowKind: 'loading' }),
      'loader',
    );
  });

  it('idle keeps the previous mapping', () => {
    assert.equal(resolveRootView({ ...base, uid: null, deletionPhase: 'idle', profileFlowKind: 'loading' }), 'guest');
    assert.equal(resolveRootView({ ...base, deletionPhase: 'idle', profileFlowKind: 'loading' }), 'loader');
    assert.equal(resolveRootView({ ...base, deletionPhase: 'idle', profileFlowKind: 'OnboardingBirthDate' }), 'onboarding');
    assert.equal(resolveRootView({ ...base, deletionPhase: 'idle', profileFlowKind: 'MainTabs' }), 'main');
    assert.equal(resolveRootView({ ...base, deletionPhase: 'idle', startupLoading: true, profileFlowKind: 'MainTabs' }), 'loader');
  });
});

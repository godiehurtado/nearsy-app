/**
 * Account deletion → Login, end to end without React Navigation.
 *
 * Composes the real Delete Account flow, the exit barrier (with its persisted
 * marker), the real profile gate and the deletion-aware wrapper with a model
 * of AppNavigator (startup hydration, Auth listener → setUid/noteAuthState,
 * profile-gate effect keyed on uid and suspension, root view resolution, the
 * pending screen's mount check), then records every root view rendered.
 * The environment (device storage, persisted Auth session, server-side Auth,
 * profile documents, network) outlives a root so app relaunches can be
 * simulated.
 *
 * Run:
 *   node --experimental-strip-types --test packages/shared/src/navigation/__tests__/accountDeletionRootGate.test.ts
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createAccountDeletionExitStore,
  createPendingDeletionMarker,
  PENDING_DELETION_STORAGE_KEY,
  type AccountDeletionPhase,
} from '../../accountDeletion/accountDeletionExit.ts';
import {
  createDeleteAccountFlow,
  runAccountDeletionCleanup,
  type AuthReconciliation,
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
const backendError = (code: string, reason?: string) =>
  Object.assign(new Error('x'), { code, ...(reason ? { details: { reason } } : {}) });

type Env = {
  storage: Map<string, string>;
  docs: Map<string, unknown>;
  authServer: Set<string>;
  online: boolean;
  persistedUser: { uid: string; providers: string[] } | null;
  /** auth_time no longer recent for the backend. */
  staleSession: boolean;
};

function createEnv(): Env {
  return {
    storage: new Map(),
    docs: new Map(),
    authServer: new Set(),
    online: true,
    persistedUser: null,
    staleSession: false,
  };
}

type Backend = {
  env: Env;
  /** Data stages: users/{uid} and the rest. */
  deleteData: () => void;
  /** Last stage: the Auth user. */
  deleteAuth: () => void;
};

type SignOutMode = 'emits' | 'emits_late' | 'throws';

type RootOptions = {
  signOut?: SignOutMode;
  callable?: (backend: Backend) => Promise<unknown>;
  withoutBarrier?: boolean;
};

function createRoot(env: Env = createEnv(), options: RootOptions = {}) {
  const exit = createAccountDeletionExitStore();
  exit.attachMarker(
    createPendingDeletionMarker({
      getItem: async (key) => env.storage.get(key) ?? null,
      setItem: async (key, value) => void env.storage.set(key, value),
      removeItem: async (key) => void env.storage.delete(key),
    }),
  );
  const docListeners = new Map<string, Set<(data: unknown) => void>>();
  const notifyDoc = (uid: string) => {
    for (const listener of [...(docListeners.get(uid) ?? [])]) listener(env.docs.get(uid) ?? null);
  };

  const gate = createDeletionAwareProfileGate({
    gate: createAuthenticatedProfileGate({
      listen: (uid, onData) => {
        const set = docListeners.get(uid) ?? new Set();
        docListeners.set(uid, set);
        set.add(onData);
        queueMicrotask(() => {
          if (set.has(onData)) onData(env.docs.get(uid) ?? null);
        });
        return () => set.delete(onData);
      },
      get: async (uid) => env.docs.get(uid) ?? null,
      absentConfirmMs: ABSENT_MS,
    }),
    exit,
  });

  // AppNavigator model.
  let uid: string | null = null;
  let hydrating = true;
  let phase: AccountDeletionPhase = exit.getPhase();
  let profileFlow: AuthenticatedProfileFlow = { kind: 'loading' };
  let effectKey = '';
  const views: RootView[] = [];
  const delivered: AuthenticatedProfileFlow['kind'][] = [];
  const phases: AccountDeletionPhase[] = [phase];
  let viewsAtConfirm = -1;
  let pendingCheck: Promise<DeleteAccountOutcome> | null = null;

  const render = () => {
    const view = resolveRootView({
      deletionPhase: phase,
      uid,
      startupLoading: hydrating,
      profileFlowKind: profileFlow.kind,
    });
    if (views.at(-1) !== view) {
      views.push(view);
      // AccountDeletionPendingScreen mount effect.
      if (view === 'deletion_pending') pendingCheck = flow.resolvePending({ retry: false });
    }
  };
  const setProfileFlow = (next: AuthenticatedProfileFlow) => {
    profileFlow = next;
    delivered.push(next.kind);
    render();
  };
  const runGateEffect = () => {
    const suspended = isProfileGateSuspended(phase);
    const key = `${uid}|${suspended}|${hydrating}`;
    if (key === effectKey) return;
    effectKey = key;
    gate.stop();
    if (!uid || suspended || hydrating) {
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

  // Firebase Auth model (device side).
  let authUser: string | null = env.persistedUser?.uid ?? null;
  let providerIds: string[] = env.persistedUser?.providers ?? [];
  let signOutCalls = 0;
  const emitAuth = (next: string | null) => {
    uid = next;
    if (!next) profileFlow = { kind: 'loading' };
    exit.noteAuthState(next);
    commit();
  };
  const signInAs = (next: string, providers: string[]) => {
    env.authServer.add(next);
    env.persistedUser = { uid: next, providers };
    authUser = next;
    providerIds = providers;
    emitAuth(next);
  };
  const localSignOut = () => {
    authUser = null;
    env.persistedUser = null;
  };

  const backend: Backend = {
    env,
    deleteData: () => {
      env.docs.delete(DELETED_UID);
      notifyDoc(DELETED_UID);
    },
    deleteAuth: () => {
      env.authServer.delete(DELETED_UID);
    },
  };
  const calls: string[] = [];
  const cleanupSteps: string[] = [];

  /** Idempotent backend: data first, Auth last, then the reply. */
  const defaultCallable = async (b: Backend) => {
    if (!b.env.online) throw backendError('functions/unavailable');
    if (!b.env.authServer.has(DELETED_UID)) throw backendError('auth/user-not-found');
    if (b.env.staleSession) throw backendError('functions/failed-precondition', 'RECENT_LOGIN_REQUIRED');
    const already = !b.env.docs.has(DELETED_UID);
    b.deleteData();
    await sleep(CALLABLE_MS);
    b.deleteAuth();
    return { ok: true, status: already ? 'ALREADY_DELETED' : 'DELETED' };
  };

  const reconcileAuth = async (target: string): Promise<AuthReconciliation> => {
    if (!authUser) return 'gone';
    if (authUser !== target) return 'unknown';
    if (!env.online) return 'unknown';
    return env.authServer.has(target) ? 'exists' : 'gone';
  };

  const flow = createDeleteAccountFlow({
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
          localSignOut();
          if (mode === 'emits') {
            queueMicrotask(() => emitAuth(null));
          } else {
            setTimeout(() => emitAuth(null), 30);
          }
        },
        clearLocalAccountState: async () => void cleanupSteps.push('local'),
      }),
    reconcileAuth,
    exitBarrier: options.withoutBarrier ? undefined : exit,
  });

  return {
    env,
    exit,
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
    get pendingCheck() {
      return pendingCheck;
    },
    get markerPersisted() {
      return env.storage.get(PENDING_DELETION_STORAGE_KEY) === '1';
    },
    activeProfileListeners() {
      return [...docListeners.values()].reduce((n, set) => n + set.size, 0);
    },
    /** AppNavigator startup: Auth restores the persisted session while the marker hydrates. */
    async boot() {
      render();
      const hydration = exit.hydrate();
      emitAuth(authUser);
      await hydration;
      hydrating = false;
      commit();
      await sleep(ABSENT_MS * 3);
    },
    setDoc(target: string, data: unknown) {
      env.docs.set(target, data);
      notifyDoc(target);
    },
    signInAs,
    emitAuth,
    deleteAccount: flow,
    retryPending: () => flow.resolvePending({ retry: true }),
    leavePending: () => flow.leavePending(),
  };
}

type Root = ReturnType<typeof createRoot>;

async function signedInAtHome(root: Root, providers: string[]) {
  await root.boot();
  root.env.docs.set(DELETED_UID, COMPLETE_PROFILE);
  root.signInAs(DELETED_UID, providers);
  await sleep(ABSENT_MS * 2);
  assert.equal(root.view, 'main');
}

function assertNeverOnboarding(root: Root) {
  assert.ok(!root.views.includes('onboarding'), `views: ${root.views.join(' → ')}`);
  assert.ok(!root.views.includes('profile_error'));
  assert.ok(!root.delivered.some((k) => ONBOARDING_KINDS.has(k)), 'no onboarding flow delivered');
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
  assertNeverOnboarding(root);
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
      assert.equal(root.markerPersisted, false);
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
    const root = createRoot(createEnv(), { withoutBarrier: true });
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
    assert.equal(root.markerPersisted, true);

    await pending;
    await sleep(5);
    assertExitedToLogin(root);
  });

  it('Auth slow to emit null → exit state (loader / signed-out root), never DOB', async () => {
    const root = createRoot(createEnv(), { signOut: 'emits_late' });
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
    const root = createRoot(createEnv(), { signOut: 'throws' });
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
    root.env.docs.set(OTHER_UID, COMPLETE_PROFILE);
    root.signInAs(OTHER_UID, ['password']);
    await sleep(ABSENT_MS * 2);
    assert.equal(root.phase, 'idle');
    assert.equal(root.view, 'main');
  });

  it('ALREADY_DELETED (account no longer exists) closes to Login the same way', async () => {
    const root = createRoot(createEnv(), {
      callable: async (backend) => {
        backend.deleteData();
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
});

describe('Ambiguous results are reconciled with Auth, never with the profile', () => {
  it('backend deletes but the response is lost; reload says user-not-found → Login', async () => {
    const root = createRoot(createEnv(), {
      callable: async (backend) => {
        backend.deleteData();
        await sleep(CALLABLE_MS);
        backend.deleteAuth();
        throw backendError('functions/deadline-exceeded');
      },
    });
    await signedInAtHome(root, ['password']);
    const outcome = await root.deleteAccount({ method: 'password', password: 'right-password' });
    await sleep(5);

    assert.deepEqual(outcome, { status: 'deleted', alreadyDeleted: true });
    assert.deepEqual(root.calls, ['deleteMyAccount']);
    assert.equal(root.signOutCalls, 1);
    assertExitedToLogin(root);
    assert.equal(root.markerPersisted, false);
  });

  it('callable fails and the reload confirms the same user → stays on Delete Account, retryable', async () => {
    const root = createRoot(createEnv(), {
      callable: async () => {
        await sleep(5);
        throw backendError('functions/unavailable');
      },
    });
    await signedInAtHome(root, ['password']);
    const outcome = await root.deleteAccount({ method: 'password', password: 'right-password' });

    assert.equal(outcome.status === 'failed' && outcome.kind, 'network');
    assert.equal(outcome.status === 'failed' && outcome.messageKey, 'settings.deleteAccount.errorNetwork');
    assert.deepEqual(root.phases, ['idle', 'deleting', 'idle']);
    assert.deepEqual(root.views, ['loader', 'guest', 'loader', 'main']);
    assert.deepEqual(root.cleanupSteps, []);
    assert.equal(root.markerPersisted, false);
  });

  it('data deleted, Auth kept (backend failed mid-way) → Delete Account stays, never DOB, retry deletes', async () => {
    let attempts = 0;
    const root = createRoot(createEnv(), {
      callable: async (backend) => {
        attempts += 1;
        backend.deleteData();
        await sleep(CALLABLE_MS);
        if (attempts === 1) throw backendError('functions/internal', 'DELETION_RETRYABLE');
        backend.deleteAuth();
        return { ok: true, status: 'ALREADY_DELETED' };
      },
    });
    await signedInAtHome(root, ['google.com']);
    const first = await root.deleteAccount({ method: 'google' });
    await sleep(ABSENT_MS * 4);
    assert.equal(first.status === 'failed' && first.kind, 'retryable');
    assert.equal(root.view, 'main');
    assertNeverOnboarding(root);

    const second = await root.deleteAccount({ method: 'google' });
    await sleep(5);
    assert.deepEqual(second, { status: 'deleted', alreadyDeleted: true });
    assertExitedToLogin(root);
  });

  it('fast failure after the profile was deleted: a late absent-doc confirmation never opens DOB', async () => {
    const root = createRoot(createEnv(), {
      callable: async (backend) => {
        backend.deleteData();
        throw backendError('functions/internal', 'DELETION_FAILED');
      },
    });
    await signedInAtHome(root, ['password']);
    const outcome = await root.deleteAccount({ method: 'password', password: 'right-password' });
    assert.equal(root.phase, 'idle', 'released before the absent-doc confirm fires');
    await sleep(ABSENT_MS * 6);

    assert.equal(outcome.status === 'failed' && outcome.kind, 'partial');
    assert.equal(root.view, 'main');
    assertNeverOnboarding(root);
  });

  it('callable and reload both fail offline → neutral pending state, never DOB, never success', async () => {
    const env = createEnv();
    const root = createRoot(env, {
      callable: async (backend) => {
        backend.deleteData();
        await sleep(CALLABLE_MS);
        backend.deleteAuth();
        env.online = false;
        throw backendError('functions/deadline-exceeded');
      },
    });
    await signedInAtHome(root, ['password']);
    const outcome = await root.deleteAccount({ method: 'password', password: 'right-password' });
    await root.pendingCheck;
    await sleep(ABSENT_MS * 4);

    assert.deepEqual(outcome, { status: 'unresolved' });
    assert.equal(root.phase, 'unresolved');
    assert.equal(root.view, 'deletion_pending');
    assert.equal(root.signOutCalls, 0);
    assert.deepEqual(root.cleanupSteps, []);
    assert.equal(root.activeProfileListeners(), 0, 'profile gate is off');
    assert.equal(root.markerPersisted, true);
    assertNeverOnboarding(root);
  });

  it('reconnect and retry after an ambiguous result → Login (Auth already gone)', async () => {
    const env = createEnv();
    const root = createRoot(env, {
      callable: async (backend) => {
        backend.deleteData();
        backend.deleteAuth();
        env.online = false;
        throw backendError('functions/deadline-exceeded');
      },
    });
    await signedInAtHome(root, ['facebook.com']);
    await root.deleteAccount({ method: 'facebook' });
    await root.pendingCheck;
    assert.equal(root.view, 'deletion_pending');

    env.online = true;
    const retried = await root.retryPending();
    await sleep(5);
    assert.deepEqual(retried, { status: 'deleted', alreadyDeleted: true });
    assert.deepEqual(root.calls, ['deleteMyAccount'], 'reconciliation alone settled it');
    assertExitedToLogin(root);
    assert.equal(root.markerPersisted, false);
  });

  it('reconnect and retry when the request never reached the backend → idempotent call → Login', async () => {
    const env = createEnv();
    let attempts = 0;
    const root = createRoot(env, {
      callable: async (backend) => {
        attempts += 1;
        if (attempts === 1) {
          env.online = false;
          throw backendError('functions/unavailable');
        }
        backend.deleteData();
        await sleep(5);
        backend.deleteAuth();
        return { ok: true, status: 'DELETED' };
      },
    });
    await signedInAtHome(root, ['password']);
    await root.deleteAccount({ method: 'password', password: 'right-password' });
    await root.pendingCheck;
    assert.equal(root.view, 'deletion_pending');

    env.online = true;
    const retried = await root.retryPending();
    await sleep(5);
    assert.deepEqual(retried, { status: 'deleted', alreadyDeleted: false });
    assert.deepEqual(root.calls, ['deleteMyAccount', 'deleteMyAccount']);
    assertExitedToLogin(root);
  });

  it('retry while still offline stays pending', async () => {
    const env = createEnv();
    const root = createRoot(env, {
      callable: async () => {
        env.online = false;
        throw backendError('functions/unavailable');
      },
    });
    await signedInAtHome(root, ['google.com']);
    await root.deleteAccount({ method: 'google' });
    await root.pendingCheck;
    const retried = await root.retryPending();
    assert.deepEqual(retried, { status: 'unresolved' });
    assert.equal(root.view, 'deletion_pending');
    assert.deepEqual(root.calls, ['deleteMyAccount']);
    assertNeverOnboarding(root);
  });

  it('pending retry rejected for a stale session stays pending (sign out offered), never DOB', async () => {
    const env = createEnv();
    let attempts = 0;
    const root = createRoot(env, {
      callable: async (backend) => {
        attempts += 1;
        if (attempts === 1) {
          backend.deleteData();
          env.online = false;
          throw backendError('functions/deadline-exceeded');
        }
        throw backendError('functions/failed-precondition', 'RECENT_LOGIN_REQUIRED');
      },
    });
    await signedInAtHome(root, ['password']);
    await root.deleteAccount({ method: 'password', password: 'right-password' });
    await root.pendingCheck;

    env.online = true;
    const retried = await root.retryPending();
    await sleep(ABSENT_MS * 4);
    assert.equal(retried.status === 'failed' && retried.kind, 'stale_session');
    assert.equal(root.phase, 'unresolved');
    assert.equal(root.view, 'deletion_pending');
    assertNeverOnboarding(root);
  });

  it('leaving the pending state → contractual signOut → Login, never DOB', async () => {
    const env = createEnv();
    const root = createRoot(env, {
      callable: async (backend) => {
        backend.deleteData();
        env.online = false;
        throw backendError('functions/deadline-exceeded');
      },
    });
    await signedInAtHome(root, ['password']);
    await root.deleteAccount({ method: 'password', password: 'right-password' });
    await root.pendingCheck;

    await root.leavePending();
    await sleep(5);
    assert.equal(root.signOutCalls, 1);
    assert.deepEqual(root.cleanupSteps, ['prefill', 'publication', 'background', 'drain', 'providers', 'signOut', 'local']);
    assertExitedToLogin(root);
    assert.equal(root.markerPersisted, false);
    assert.equal(env.persistedUser, null);
  });

  it('app relaunched during a pending reconciliation → pending state, never DOB; reconnect → Login', async () => {
    const env = createEnv();
    const first = createRoot(env, {
      callable: async (backend) => {
        backend.deleteData();
        await sleep(5);
        backend.deleteAuth();
        env.online = false;
        throw backendError('functions/deadline-exceeded');
      },
    });
    await signedInAtHome(first, ['password']);
    await first.deleteAccount({ method: 'password', password: 'right-password' });
    await first.pendingCheck;
    assert.equal(first.markerPersisted, true);

    // Process killed; Firebase restores the persisted session on relaunch.
    const relaunched = createRoot(env);
    await relaunched.boot();
    await relaunched.pendingCheck;
    assert.equal(relaunched.view, 'deletion_pending');
    assert.equal(relaunched.activeProfileListeners(), 0);
    assert.deepEqual(relaunched.views, ['loader', 'deletion_pending']);
    assertNeverOnboarding(relaunched);

    env.online = true;
    const retried = await relaunched.retryPending();
    await sleep(5);
    assert.equal(retried.status, 'deleted');
    assertExitedToLogin(relaunched);
    assert.equal(relaunched.markerPersisted, false);
  });

  it('app relaunched online with Auth already gone → the mount check alone closes to Login', async () => {
    const env = createEnv();
    const first = createRoot(env, {
      callable: async (backend) => {
        backend.deleteData();
        backend.deleteAuth();
        env.online = false;
        throw backendError('functions/deadline-exceeded');
      },
    });
    await signedInAtHome(first, ['google.com']);
    await first.deleteAccount({ method: 'google' });
    await first.pendingCheck;

    env.online = true;
    const relaunched = createRoot(env);
    await relaunched.boot();
    const check = await relaunched.pendingCheck;
    await sleep(5);
    assert.equal(check?.status, 'deleted');
    assertExitedToLogin(relaunched);
  });

  it('app relaunched killed mid-call (marker set, data gone, Auth kept) → pending, never DOB', async () => {
    const env = createEnv();
    env.docs.set(DELETED_UID, COMPLETE_PROFILE);
    env.authServer.add(DELETED_UID);
    env.persistedUser = { uid: DELETED_UID, providers: ['password'] };
    env.storage.set(PENDING_DELETION_STORAGE_KEY, '1');
    env.docs.delete(DELETED_UID);

    const relaunched = createRoot(env);
    await relaunched.boot();
    await relaunched.pendingCheck;
    await sleep(ABSENT_MS * 4);
    assert.equal(relaunched.view, 'deletion_pending');
    assertNeverOnboarding(relaunched);

    const retried = await relaunched.retryPending();
    await sleep(5);
    assert.deepEqual(retried, { status: 'deleted', alreadyDeleted: true });
    assertExitedToLogin(relaunched);
  });

  it('a stale marker with nobody signed in is cleared and Login shows', async () => {
    const env = createEnv();
    env.storage.set(PENDING_DELETION_STORAGE_KEY, '1');
    const root = createRoot(env);
    await root.boot();
    assert.equal(root.view, 'guest');
    assert.equal(root.markerPersisted, false);
    assert.deepEqual(root.phases, ['idle']);
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
    assert.deepEqual(root.views, ['loader', 'guest', 'loader', 'main']);
    assert.equal(root.markerPersisted, false);
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
        throw backendError('functions/unavailable');
      },
    ],
    [
      'backend error',
      async () => {
        await sleep(5);
        throw backendError('functions/internal', 'DELETION_RETRYABLE');
      },
    ],
    ['unconfirmed response', async () => ({ ok: true })],
    [
      'stale session (rejected before any data)',
      async () => {
        throw backendError('functions/failed-precondition', 'RECENT_LOGIN_REQUIRED');
      },
    ],
  ] as const) {
    it(`${label}: no navigation, no cleanup, barrier released`, async () => {
      const root = createRoot(createEnv(), { callable });
      await signedInAtHome(root, ['password']);
      const outcome: DeleteAccountOutcome = await root.deleteAccount({
        method: 'password',
        password: 'right-password',
      });
      assert.equal(outcome.status, 'failed');
      assert.deepEqual(root.phases, ['idle', 'deleting', 'idle']);
      assert.deepEqual(root.cleanupSteps, []);
      assert.equal(root.signOutCalls, 0);
      assert.deepEqual(root.views, ['loader', 'guest', 'loader', 'main']);
      assert.equal(root.markerPersisted, false);
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
    await root.boot();
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

  it('cold start with a signed-in user and no marker runs the profile gate normally', async () => {
    const env = createEnv();
    env.docs.set(OTHER_UID, COMPLETE_PROFILE);
    env.authServer.add(OTHER_UID);
    env.persistedUser = { uid: OTHER_UID, providers: ['password'] };
    const root = createRoot(env);
    await root.boot();
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
  const ALL_KINDS = ['OnboardingBirthDate', 'PhoneVerification', 'ProfileCompletion', 'MainTabs', 'profile_read_error', 'loading'] as const;

  it('exiting is always the neutral loader, whatever the profile flow says', () => {
    for (const kind of ALL_KINDS) {
      assert.equal(resolveRootView({ ...base, deletionPhase: 'exiting', profileFlowKind: kind }), 'loader');
    }
  });

  it('unresolved is always the pending state (loader without a user)', () => {
    for (const kind of ALL_KINDS) {
      assert.equal(resolveRootView({ ...base, deletionPhase: 'unresolved', profileFlowKind: kind }), 'deletion_pending');
    }
    assert.equal(
      resolveRootView({ ...base, uid: null, deletionPhase: 'unresolved', profileFlowKind: 'loading' }),
      'loader',
    );
    assert.equal(isProfileGateSuspended('unresolved'), true);
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

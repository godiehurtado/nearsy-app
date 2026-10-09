import assert from 'node:assert/strict';

import {
  acknowledgeAuthUserForAccountDeletion,
  getAccountDeletionClosure,
  isAccountClosedByDeletion,
  isAccountDeletionSessionActive,
  subscribeAccountDeletionClosure,
} from '../../accountDeletionSession';
import {
  acknowledgeAuthIdentityForPendingDeletion,
  getPendingAccountDeletionState,
  hydratePendingAccountDeletion,
  isAccountDeletionPendingFor,
  subscribePendingAccountDeletion,
  type PendingAccountDeletionStorage,
} from '../../accountDeletionReconciliation';
import {
  resolveProfileSubscriptionUid,
  resolveRootFlowKind,
  type RootFlowKind,
} from '../../../navigation/rootFlowDecision';
import { resolveAuthenticatedStackInitialRoute } from '../../../phoneOtp/onboardingResolver';
import { isProfileDocumentComplete } from '../../../utils/profileDocumentComplete';

export const ONBOARDING_ROUTES = new Set([
  'OnboardingBirthDate',
  'PhoneVerification',
  'ProfileCompletion',
  'CompleteProfile',
]);

export const COMPLETE_PROFILE = { profileSetupCompleted: true };

export type ProfileData = Record<string, unknown> | null;

/**
 * Mirrors AppNavigator's auth listener, profile listener and render decision
 * using the same pure helpers. `deletionBarriers: false` replays b646c7d.
 */
export class RootNavigatorModel {
  uid: string | null = null;
  needsCompleteProfile = false;
  onboardingRoute: string = 'ProfileCompletion';
  readonly flows: RootFlowKind[] = [];
  readonly routes: string[] = [];
  private readonly unsubscribers: (() => void)[];

  constructor(private readonly deletionBarriers = true) {
    this.unsubscribers = [
      subscribeAccountDeletionClosure(() => this.render()),
      subscribePendingAccountDeletion(() => this.render()),
    ];
  }

  private closure() {
    return this.deletionBarriers ? getAccountDeletionClosure() : null;
  }

  private pending() {
    return this.deletionBarriers ? getPendingAccountDeletionState().pending : null;
  }

  private suspended(uid: string) {
    return (
      this.deletionBarriers && (isAccountClosedByDeletion(uid) || isAccountDeletionPendingFor(uid))
    );
  }

  authEmit(uid: string | null, createdAt: string | null = null) {
    if (this.deletionBarriers) {
      acknowledgeAuthUserForAccountDeletion(uid);
      acknowledgeAuthIdentityForPendingDeletion(uid ? { uid, createdAt } : null);
    }
    if (!uid) {
      this.uid = null;
      this.needsCompleteProfile = false;
    } else if (!(this.deletionBarriers && isAccountClosedByDeletion(uid))) {
      this.uid = uid;
    }
    this.render();
  }

  /** Cold start: AppNavigator hydrates the persisted marker before routing. */
  async launch(
    storage: PendingAccountDeletionStorage,
    uid: string | null,
    createdAt: string | null = null,
  ) {
    await hydratePendingAccountDeletion(storage);
    this.authEmit(uid, createdAt);
  }

  /** Live onSnapshot emission (nothing if the listener is unsubscribed). */
  profileEvent(data: ProfileData) {
    const profileUid = resolveProfileSubscriptionUid(this.uid, this.closure(), this.pending());
    if (!profileUid) return;
    this.handleProfile(profileUid, data);
  }

  /** Callback already queued for `uid` before React unsubscribed it. */
  queuedProfileCallback(uid: string, data: ProfileData) {
    this.handleProfile(uid, data);
  }

  private handleProfile(profileUid: string, data: ProfileData) {
    if (this.suspended(profileUid)) return;
    if (!data && isAccountDeletionSessionActive()) {
      this.needsCompleteProfile = false;
      this.render();
      return;
    }
    this.needsCompleteProfile = !isProfileDocumentComplete(data);
    this.onboardingRoute = resolveAuthenticatedStackInitialRoute(data);
    this.render();
  }

  render() {
    const flow = resolveRootFlowKind({
      loading: false,
      uid: this.uid,
      needsCompleteProfile: this.needsCompleteProfile,
      closure: this.closure(),
      pending: this.pending(),
    });
    this.flows.push(flow);
    this.routes.push(
      flow === 'loading'
        ? 'Loader'
        : flow === 'guest'
          ? 'Login'
          : flow === 'deletion-pending'
            ? 'DeleteAccount'
            : flow === 'auth-complete'
              ? this.onboardingRoute
              : 'MainTabs',
    );
  }

  get current() {
    return this.routes[this.routes.length - 1];
  }

  routesSince(index: number) {
    return this.routes.slice(index);
  }

  dispose() {
    for (const unsubscribe of this.unsubscribers) unsubscribe();
  }
}

export function signedInModel(uid: string, createdAt: string | null = null): RootNavigatorModel {
  const model = new RootNavigatorModel();
  model.authEmit(uid, createdAt);
  model.profileEvent(COMPLETE_PROFILE);
  assert.equal(model.current, 'MainTabs');
  return model;
}

export function assertNoOnboarding(routes: string[], flows: RootFlowKind[]) {
  for (const route of routes) {
    assert.equal(ONBOARDING_ROUTES.has(route), false, `reached ${route}`);
  }
  assert.equal(flows.includes('auth-complete'), false);
}

/** In-memory AsyncStorage stand-in that survives a simulated relaunch. */
export function memoryStorage(): PendingAccountDeletionStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key, value) => {
      data.set(key, value);
    },
    removeItem: async (key) => {
      data.delete(key);
    },
  };
}

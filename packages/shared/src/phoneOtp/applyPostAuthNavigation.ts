import { getUserProfile } from '../services/firestoreService';
import { resolvePostAuthNavigationTarget } from './onboardingResolver';
import { mergeOnboardingProfileSnapshots } from './onboardingProfileSnapshot';
import { buildPostAuthResetRoutes } from './postAuthNavigation';

export type NavigationReset = {
  reset: (state: {
    index: number;
    routes: Array<{ name: string; params?: Record<string, unknown> }>;
  }) => void;
};

export type ApplyPostAuthNavigationInput = {
  uid: string;
  email?: string | null;
  /** Fresh fields just persisted — merged over the Firestore read for resolver accuracy. */
  profileSnapshot?: Record<string, unknown> | null;
};

/**
 * Central post-auth navigation for all providers.
 */
export async function applyPostAuthNavigation(
  navigation: NavigationReset,
  input: ApplyPostAuthNavigationInput,
): Promise<void> {
  const remote = await getUserProfile(input.uid);
  const profile = input.profileSnapshot
    ? mergeOnboardingProfileSnapshots(remote, input.profileSnapshot)
    : remote;
  const target = resolvePostAuthNavigationTarget(profile);
  navigation.reset(
    buildPostAuthResetRoutes(target, {
      uid: input.uid,
      email: input.email,
      inputNonce: Date.now(),
    }),
  );
}

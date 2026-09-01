import { getUserProfile } from '../services/firestoreService';
import { resolvePostAuthNavigationTarget } from './onboardingResolver';
import { buildPostAuthResetRoutes } from './postAuthNavigation';

export type NavigationReset = {
  reset: (state: {
    index: number;
    routes: Array<{ name: string; params?: Record<string, unknown> }>;
  }) => void;
};

/**
 * Central post-auth navigation for all providers.
 * DOB social blocker: `needsDateOfBirth` routes to ProfileCompletion until the DOB front ships.
 */
export async function applyPostAuthNavigation(
  navigation: NavigationReset,
  input: { uid: string; email?: string | null },
): Promise<void> {
  const profile = await getUserProfile(input.uid);
  const target = resolvePostAuthNavigationTarget(profile);
  navigation.reset(
    buildPostAuthResetRoutes(target, {
      uid: input.uid,
      email: input.email,
      inputNonce: Date.now(),
    }),
  );
}

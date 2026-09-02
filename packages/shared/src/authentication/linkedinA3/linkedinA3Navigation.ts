/**
 * Shared MainTabs / ProfileCompletion reset used by the live LinkedIn flow
 * and by kill/relaunch resume. Does not write Firestore identity.
 */

import { resolvePostAuthNavigationTarget } from '../../phoneOtp/onboardingResolver';
import { buildPostAuthResetRoutes } from '../../phoneOtp/postAuthNavigation';
import { resolveAppleAuthNavigationTarget } from '../social/application/appleSignInUiPolicy';

export type LinkedInA3PostAuthSuccess = {
  profileRoute: 'MainTabs' | 'CompleteProfile';
  session: { uid: string; email: string | null };
  email: string | null;
  /** Optional Firestore snapshot for central onboarding routing (OTP gate). */
  profileSnapshot?: unknown;
};

export type LinkedInA3NavigationReset = {
  reset: (state: {
    index: number;
    routes: Array<{ name: string; params?: Record<string, unknown> }>;
  }) => void;
};

export function resetNavigationAfterLinkedInA3SignIn(
  navigation: LinkedInA3NavigationReset,
  success: LinkedInA3PostAuthSuccess,
): void {
  const target = success.profileSnapshot
    ? resolvePostAuthNavigationTarget(success.profileSnapshot)
    : resolveAppleAuthNavigationTarget(success.profileRoute) === 'MainTabs'
      ? 'MainTabs'
      : 'ProfileCompletion';

  navigation.reset(
    buildPostAuthResetRoutes(target, {
      uid: success.session.uid,
      email: success.email ?? success.session.email ?? '',
      inputNonce: Date.now(),
    }),
  );
}

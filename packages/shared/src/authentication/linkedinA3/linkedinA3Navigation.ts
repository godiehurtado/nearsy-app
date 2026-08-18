/**
 * Shared MainTabs / ProfileCompletion reset used by the live LinkedIn flow
 * and by kill/relaunch resume. Does not write Firestore identity.
 */

import { resolveAppleAuthNavigationTarget } from '../social/application/appleSignInUiPolicy';

export type LinkedInA3PostAuthSuccess = {
  profileRoute: 'MainTabs' | 'CompleteProfile';
  session: { uid: string; email: string | null };
  email: string | null;
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
  const screen = resolveAppleAuthNavigationTarget(success.profileRoute);
  if (screen === 'MainTabs') {
    navigation.reset({
      index: 0,
      routes: [{ name: 'MainTabs' }],
    });
    return;
  }

  navigation.reset({
    index: 0,
    routes: [
      {
        name: 'ProfileCompletion',
        params: {
          uid: success.session.uid,
          email: success.email ?? success.session.email ?? '',
          inputNonce: Date.now(),
        },
      },
    ],
  });
}

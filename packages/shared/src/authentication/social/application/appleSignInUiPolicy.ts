/** Pure helpers for Apple sign-in UI policy (safe for Node unit tests). */

export function resolveAppleAuthNavigationTarget(
  profileRoute: 'MainTabs' | 'CompleteProfile',
): 'MainTabs' | 'ProfileCompletion' {
  return profileRoute === 'MainTabs' ? 'MainTabs' : 'ProfileCompletion';
}

export function shouldSuppressAppleSignInAlert(code: string): boolean {
  return code === 'CANCELLED' || code === 'IN_PROGRESS';
}

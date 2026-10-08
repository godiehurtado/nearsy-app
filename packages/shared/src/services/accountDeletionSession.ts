/**
 * Account-deletion session helpers.
 * Prevents AppNavigator from remounting into CompleteProfile while the
 * backend removes `users/{uid}` before Auth, and finalizes guest UI.
 */

let accountDeletionSessionActive = false;

export function beginAccountDeletionSession(): void {
  accountDeletionSessionActive = true;
}

export function endAccountDeletionSession(): void {
  accountDeletionSessionActive = false;
}

export function isAccountDeletionSessionActive(): boolean {
  return accountDeletionSessionActive;
}

export type PostAccountDeletionNavigationTarget = {
  isReady: () => boolean;
  reset: (state: { index: number; routes: { name: string }[] }) => void;
};

/**
 * Only after the backend confirmed the deletion: stop location publishing,
 * clear local-only state and provider sessions, then force the root navigator
 * onto the canonical guest Login route when possible. Never deletes remote
 * data. AppNavigator also remounts the guest stack via onAuthStateChanged(null).
 */
export async function finalizePostAccountDeletionSession(input: {
  closeVisibilityAndLocation?: () => Promise<unknown>;
  clearLocalState?: () => Promise<void>;
  clearSocialPrefill?: () => void | Promise<void>;
  clearGoogleProviderSession?: () => Promise<void>;
  clearFacebookProviderSession?: () => Promise<void>;
  ensureSignedOut?: () => Promise<void>;
  navigation?: PostAccountDeletionNavigationTarget | null;
}): Promise<{ authCleared: boolean; navigationReset: boolean }> {
  if (input.closeVisibilityAndLocation) {
    try {
      await input.closeVisibilityAndLocation();
    } catch {
      // Best-effort; never block guest transition.
    }
  }

  if (input.clearLocalState) {
    try {
      await input.clearLocalState();
    } catch {
      // Best-effort; never block guest transition.
    }
  }

  if (input.clearSocialPrefill) {
    try {
      await input.clearSocialPrefill();
    } catch {
      // Best-effort; never block guest transition.
    }
  }

  if (input.clearGoogleProviderSession) {
    try {
      await input.clearGoogleProviderSession();
    } catch {
      // Best-effort; never block guest transition.
    }
  }

  if (input.clearFacebookProviderSession) {
    try {
      await input.clearFacebookProviderSession();
    } catch {
      // Best-effort; never block guest transition.
    }
  }

  if (input.ensureSignedOut) {
    try {
      await input.ensureSignedOut();
    } catch {
      // Already deleted Auth users may throw; ignore.
    }
  }

  let navigationReset = false;
  const nav = input.navigation;
  if (nav?.isReady?.()) {
    try {
      nav.reset({ index: 0, routes: [{ name: 'Login' }] });
      navigationReset = true;
    } catch {
      navigationReset = false;
    }
  }

  endAccountDeletionSession();
  return { authCleared: true, navigationReset };
}

/** Test helper */
export function __resetAccountDeletionSessionForTests(): void {
  accountDeletionSessionActive = false;
}

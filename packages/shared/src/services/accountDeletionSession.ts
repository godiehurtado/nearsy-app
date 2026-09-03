/**
 * Account-deletion session helpers.
 * Prevents AppNavigator from remounting into CompleteProfile while
 * `users/{uid}` is removed before Auth delete, and finalizes guest UI.
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
 * After Auth identity is gone, clear local social residue and force the
 * root navigator onto the canonical guest Login route when possible.
 * AppNavigator also remounts the guest stack via onAuthStateChanged(null).
 */
export async function finalizePostAccountDeletionSession(input: {
  clearSocialPrefill?: () => void | Promise<void>;
  clearGoogleProviderSession?: () => Promise<void>;
  ensureSignedOut?: () => Promise<void>;
  navigation?: PostAccountDeletionNavigationTarget | null;
}): Promise<{ authCleared: boolean; navigationReset: boolean }> {
  if (input.clearSocialPrefill) {
    await input.clearSocialPrefill();
  }

  if (input.clearGoogleProviderSession) {
    try {
      await input.clearGoogleProviderSession();
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

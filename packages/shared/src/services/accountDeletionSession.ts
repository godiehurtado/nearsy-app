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

/**
 * Account-closure barrier. Set as soon as the backend confirms the deletion
 * and kept until Firebase Auth reports the signed-out state (or another
 * sign-in). While it holds the deleted uid, AppNavigator never evaluates the
 * Profile Gate for that uid: a missing `users/{uid}` is a closed account, not
 * a new registration.
 *
 * - `closing`: local cleanup and sign-out still running → neutral loader.
 * - `closed`: cleanup finished but Auth has not emitted null yet → guest Login.
 * - `signed_out`: Auth emitted null → guest Login. The uid stays blocked until
 *   the next sign-in so a not-yet-committed React uid never renders Home.
 */
export type AccountDeletionClosurePhase = 'closing' | 'closed' | 'signed_out';

export type AccountDeletionClosure = {
  readonly uid: string;
  readonly phase: AccountDeletionClosurePhase;
};

let accountDeletionClosure: AccountDeletionClosure | null = null;
const closureListeners = new Set<() => void>();

function setAccountDeletionClosure(next: AccountDeletionClosure | null): void {
  if (
    next === accountDeletionClosure ||
    (next && accountDeletionClosure &&
      next.uid === accountDeletionClosure.uid &&
      next.phase === accountDeletionClosure.phase)
  ) {
    return;
  }
  accountDeletionClosure = next;
  for (const listener of [...closureListeners]) {
    try {
      listener();
    } catch {
      // A failing subscriber must not block the barrier.
    }
  }
}

export function getAccountDeletionClosure(): AccountDeletionClosure | null {
  return accountDeletionClosure;
}

export function subscribeAccountDeletionClosure(listener: () => void): () => void {
  closureListeners.add(listener);
  return () => {
    closureListeners.delete(listener);
  };
}

/** Only after `deleteMyAccount` confirmed DELETED / ALREADY_DELETED. */
export function markAccountDeletionClosing(uid: string): void {
  if (!uid) return;
  if (accountDeletionClosure?.uid === uid && accountDeletionClosure.phase !== 'signed_out') return;
  setAccountDeletionClosure({ uid, phase: 'closing' });
}

export function isAccountClosedByDeletion(uid: string | null | undefined): boolean {
  return !!uid && accountDeletionClosure?.uid === uid;
}

/** Feed every Firebase Auth state emission (null or the signed-in uid). */
export function acknowledgeAuthUserForAccountDeletion(authUid: string | null): void {
  const closure = accountDeletionClosure;
  if (!closure) return;
  if (authUid === null) {
    setAccountDeletionClosure({ uid: closure.uid, phase: 'signed_out' });
    return;
  }
  if (closure.phase === 'signed_out' || closure.uid !== authUid) {
    setAccountDeletionClosure(null);
  }
}

export type PostAccountDeletionNavigationTarget = {
  isReady: () => boolean;
  reset: (state: { index: number; routes: { name: string }[] }) => void;
};

/**
 * Only after the backend confirmed the deletion: stop location publishing,
 * clear local-only state and provider sessions, then force the root navigator
 * onto the canonical guest Login route when possible. Never deletes remote
 * data. The closure barrier keeps AppNavigator off the Profile Gate even if
 * sign-out throws or Auth emits null late.
 */
export async function finalizePostAccountDeletionSession(input: {
  deletedUid: string;
  closeVisibilityAndLocation?: () => Promise<unknown>;
  clearLocalState?: () => Promise<void>;
  clearSocialPrefill?: () => void | Promise<void>;
  clearGoogleProviderSession?: () => Promise<void>;
  clearFacebookProviderSession?: () => Promise<void>;
  ensureSignedOut?: () => Promise<void>;
  navigation?: PostAccountDeletionNavigationTarget | null;
}): Promise<{ authCleared: boolean; navigationReset: boolean }> {
  markAccountDeletionClosing(input.deletedUid);

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
  const closure = accountDeletionClosure;
  if (closure?.uid === input.deletedUid && closure.phase === 'closing') {
    setAccountDeletionClosure({ uid: input.deletedUid, phase: 'closed' });
  }
  return { authCleared: true, navigationReset };
}

/** Test helper */
export function __resetAccountDeletionSessionForTests(): void {
  accountDeletionSessionActive = false;
  accountDeletionClosure = null;
  closureListeners.clear();
}

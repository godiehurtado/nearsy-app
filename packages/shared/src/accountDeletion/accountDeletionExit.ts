/**
 * Barrier between a confirmed account deletion and the root navigator.
 *
 * The backend deletes `users/{uid}` before the Auth user and before it
 * answers, while the device still holds a signed-in Firebase user. Without
 * this barrier the profile gate reads the missing profile as a new account and
 * opens DOB. Phases:
 * - idle       normal app behaviour.
 * - deleting   identity confirmed, `deleteMyAccount` in flight: profile gate
 *              results are held so the current tree stays mounted.
 * - exiting    backend confirmed: the profile gate is stopped and the root
 *              shows a neutral loader while the contractual cleanup and
 *              signOut run.
 * - signed_out cleanup settled but Auth still reports the deleted session
 *              (e.g. signOut threw): the root treats the session as signed out.
 * The barrier is released only once Auth reports no user, or a session other
 * than the deleted one. Session keys stay in memory and are never logged.
 */

export type AccountDeletionPhase = 'idle' | 'deleting' | 'exiting' | 'signed_out';

export type AccountDeletionExitBarrier = {
  /** Identity confirmed; the callable is about to run. */
  beginRequest: () => void;
  /** No confirmed success: session and screen stay as they were. */
  abandonRequest: () => void;
  /** Backend confirmed the deletion. Must run before any cleanup. */
  confirmDeletion: () => void;
  /** Contractual cleanup (including signOut) settled, with or without errors. */
  finishCleanup: () => void;
};

export type AccountDeletionExitStore = AccountDeletionExitBarrier & {
  getPhase: () => AccountDeletionPhase;
  subscribe: (listener: () => void) => () => void;
  /**
   * Every Firebase Auth emission applied by the root navigator: the signed-in
   * session key, or null when Auth has no user.
   */
  noteAuthState: (sessionKey: string | null) => void;
};

export function createAccountDeletionExitStore(): AccountDeletionExitStore {
  let phase: AccountDeletionPhase = 'idle';
  let currentSession: string | null = null;
  let deletedSession: string | null = null;
  const listeners = new Set<() => void>();

  const setPhase = (next: AccountDeletionPhase) => {
    if (next === phase) return;
    phase = next;
    if (next === 'idle') deletedSession = null;
    for (const listener of [...listeners]) listener();
  };

  const deletedSessionGone = () =>
    currentSession === null || currentSession !== deletedSession;

  return {
    getPhase: () => phase,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    beginRequest() {
      if (phase === 'idle') setPhase('deleting');
    },
    abandonRequest() {
      if (phase === 'deleting') setPhase('idle');
    },
    confirmDeletion() {
      if (phase === 'exiting' || phase === 'signed_out') return;
      deletedSession = currentSession;
      setPhase('exiting');
    },
    finishCleanup() {
      if (phase !== 'exiting') return;
      setPhase(deletedSessionGone() ? 'idle' : 'signed_out');
    },
    noteAuthState(sessionKey) {
      currentSession = sessionKey;
      if (phase === 'signed_out' && deletedSessionGone()) setPhase('idle');
    },
  };
}

export const accountDeletionExit = createAccountDeletionExitStore();

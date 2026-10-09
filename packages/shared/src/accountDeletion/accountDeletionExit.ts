/**
 * Barrier between an account deletion and the root navigator.
 *
 * The backend deletes `users/{uid}` before the Auth user and before it
 * answers, while the device still holds a signed-in Firebase user. Without
 * this barrier the profile gate reads the missing profile as a new account and
 * opens DOB. Phases:
 * - idle       normal app behaviour.
 * - deleting   identity confirmed, `deleteMyAccount` in flight: profile gate
 *              results are held so the current tree stays mounted.
 * - unresolved the outcome is unknown and Auth could not be reached: the
 *              profile gate stays off and the root shows the pending state
 *              (retry or sign out). Survives app restarts.
 * - exiting    deletion confirmed (or the person left the pending state): the
 *              profile gate is stopped and the root shows a neutral loader
 *              while the contractual cleanup and signOut run.
 * - signed_out cleanup settled but Auth still reports the deleted session
 *              (e.g. signOut threw): the root treats the session as signed out.
 * The barrier is released only once Auth reports no user, or a session other
 * than the deleted one. Session keys stay in memory and are never logged; the
 * persisted marker carries no identifier.
 */

export type AccountDeletionPhase =
  | 'idle'
  | 'deleting'
  | 'unresolved'
  | 'exiting'
  | 'signed_out';

export type AccountDeletionExitBarrier = {
  /** Identity confirmed; the callable is about to run. */
  beginRequest: () => void | Promise<void>;
  /** The backend rejected the request or Auth confirmed the account exists. */
  abandonRequest: () => void;
  /** Outcome unknown and Auth unreachable. */
  markUnresolved: () => void;
  /** Deletion confirmed, or the person leaves the pending state. Before any cleanup. */
  confirmDeletion: () => void;
  /** Contractual cleanup (including signOut) settled, with or without errors. */
  finishCleanup: () => void;
};

/** Persisted "a deletion may be in progress" flag. No UID, email or token. */
export type PendingDeletionMarker = {
  load: () => Promise<boolean>;
  save: () => Promise<void>;
  clear: () => Promise<void>;
};

export type AccountDeletionExitStore = AccountDeletionExitBarrier & {
  getPhase: () => AccountDeletionPhase;
  subscribe: (listener: () => void) => () => void;
  /**
   * Every Firebase Auth emission applied by the root navigator: the signed-in
   * session key, or null when Auth has no user.
   */
  noteAuthState: (sessionKey: string | null) => void;
  attachMarker: (marker: PendingDeletionMarker) => void;
  /** Startup: a persisted marker with a signed-in user reopens `unresolved`. */
  hydrate: () => Promise<void>;
};

export const PENDING_DELETION_STORAGE_KEY = 'nearsy.accountDeletion.pending';

export function createPendingDeletionMarker(storage: {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
}): PendingDeletionMarker {
  return {
    load: async () => (await storage.getItem(PENDING_DELETION_STORAGE_KEY)) === '1',
    save: () => storage.setItem(PENDING_DELETION_STORAGE_KEY, '1'),
    clear: () => storage.removeItem(PENDING_DELETION_STORAGE_KEY),
  };
}

export function createAccountDeletionExitStore(): AccountDeletionExitStore {
  let phase: AccountDeletionPhase = 'idle';
  let authKnown = false;
  let currentSession: string | null = null;
  let deletedSession: string | null = null;
  let marker: PendingDeletionMarker | null = null;
  let markerSet = false;
  const listeners = new Set<() => void>();

  const setPhase = (next: AccountDeletionPhase) => {
    if (next === phase) return;
    phase = next;
    if (next === 'idle') deletedSession = null;
    for (const listener of [...listeners]) listener();
  };

  const persist = async (on: boolean) => {
    markerSet = on;
    try {
      await (on ? marker?.save() : marker?.clear());
    } catch {
      // Storage failures never block the flow; the in-memory phase rules.
    }
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
    async beginRequest() {
      if (phase !== 'idle') return;
      setPhase('deleting');
      await persist(true);
    },
    abandonRequest() {
      if (phase !== 'deleting') return;
      void persist(false);
      setPhase('idle');
    },
    markUnresolved() {
      if (phase === 'deleting') setPhase('unresolved');
    },
    confirmDeletion() {
      if (phase === 'exiting' || phase === 'signed_out') return;
      deletedSession = currentSession;
      setPhase('exiting');
    },
    finishCleanup() {
      if (phase !== 'exiting') return;
      if (deletedSessionGone()) {
        void persist(false);
        setPhase('idle');
      } else {
        setPhase('signed_out');
      }
    },
    noteAuthState(sessionKey) {
      authKnown = true;
      currentSession = sessionKey;
      if (sessionKey === null && markerSet && phase !== 'deleting' && phase !== 'exiting') {
        void persist(false);
      }
      if (phase === 'unresolved' && sessionKey === null) setPhase('idle');
      if (phase === 'signed_out' && deletedSessionGone()) {
        void persist(false);
        setPhase('idle');
      }
    },
    attachMarker(next) {
      marker = next;
    },
    async hydrate() {
      let present = false;
      try {
        present = (await marker?.load()) ?? false;
      } catch {
        present = false;
      }
      if (!present) return;
      if (authKnown && currentSession === null) {
        await persist(false);
        return;
      }
      markerSet = true;
      if (phase === 'idle') setPhase('unresolved');
    },
  };
}

export const accountDeletionExit = createAccountDeletionExitStore();

/**
 * Unresolved account deletion (ambiguous `deleteMyAccount` outcome).
 *
 * The backend may have deleted `users/{uid}` (and even Auth) while the client
 * only saw a timeout or a partial-deletion error. Firebase JS keeps exposing
 * `currentUser` after `auth/user-not-found` (it only signs out on
 * `user-disabled` / `user-token-expired`), and an offline relaunch restores it
 * from persistence. While this marker matches the signed-in identity,
 * AppNavigator suspends the Profile Gate and shows Delete Account only.
 *
 * The marker is persisted so a relaunch during reconciliation never reaches
 * the Profile Gate. It never reads or writes the profile.
 */
import { markAccountDeletionClosing } from './accountDeletionSession';

export const PENDING_ACCOUNT_DELETION_STORAGE_KEY = 'nearsy.accountDeletion.pending.v1';

/**
 * - `reconciling`: checking Firebase Auth.
 * - `exists`: Auth confirmed the same user still exists; deletion unconfirmed.
 * - `unverified`: Auth could not be checked (network); nothing confirmed.
 */
export type PendingAccountDeletionPhase = 'reconciling' | 'exists' | 'unverified';

export type PendingAccountDeletion = {
  readonly uid: string;
  /** Auth `metadata.creationTime`: tells a recreated account (same uid) apart. */
  readonly createdAt: string | null;
  readonly phase: PendingAccountDeletionPhase;
};

export type PendingAccountDeletionState = {
  readonly hydrated: boolean;
  readonly pending: PendingAccountDeletion | null;
};

export type AuthIdentity = { uid: string; createdAt: string | null };

export type PendingAccountDeletionStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

let state: PendingAccountDeletionState = { hydrated: false, pending: null };
let storage: PendingAccountDeletionStorage | null = null;
let hydration: Promise<void> | null = null;
let lastAuthIdentity: AuthIdentity | null = null;
const listeners = new Set<() => void>();

function setState(next: PendingAccountDeletionState): void {
  if (
    next.hydrated === state.hydrated &&
    next.pending?.uid === state.pending?.uid &&
    next.pending?.createdAt === state.pending?.createdAt &&
    next.pending?.phase === state.pending?.phase
  ) {
    return;
  }
  state = next;
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      // A failing subscriber must not block the gate.
    }
  }
}

function setPending(pending: PendingAccountDeletion | null): void {
  setState({ hydrated: state.hydrated, pending });
}

function persist(pending: PendingAccountDeletion | null): void {
  const target = storage;
  if (!target) return;
  const write = pending
    ? target.setItem(
        PENDING_ACCOUNT_DELETION_STORAGE_KEY,
        JSON.stringify({ uid: pending.uid, createdAt: pending.createdAt }),
      )
    : target.removeItem(PENDING_ACCOUNT_DELETION_STORAGE_KEY);
  void Promise.resolve(write).catch(() => undefined);
}

function isRecreatedIdentity(
  pending: PendingAccountDeletion,
  identity: AuthIdentity | null,
): boolean {
  return (
    !!identity &&
    identity.uid === pending.uid &&
    !!pending.createdAt &&
    !!identity.createdAt &&
    identity.createdAt !== pending.createdAt
  );
}

function parseStored(raw: string | null): { uid: string; createdAt: string | null } | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as { uid?: unknown; createdAt?: unknown };
    if (typeof value?.uid !== 'string' || !value.uid) return null;
    return {
      uid: value.uid,
      createdAt: typeof value.createdAt === 'string' ? value.createdAt : null,
    };
  } catch {
    return null;
  }
}

/** Idempotent. Always resolves; a storage failure means "nothing pending". */
export function hydratePendingAccountDeletion(
  input: PendingAccountDeletionStorage,
): Promise<void> {
  storage = storage ?? input;
  if (hydration) return hydration;
  hydration = (async () => {
    let stored: { uid: string; createdAt: string | null } | null = null;
    try {
      stored = parseStored(await input.getItem(PENDING_ACCOUNT_DELETION_STORAGE_KEY));
    } catch {
      stored = null;
    }
    // An in-session marker set before hydration finished wins.
    let pending: PendingAccountDeletion | null =
      state.pending ?? (stored ? { ...stored, phase: 'reconciling' } : null);
    if (state.pending) persist(state.pending);
    if (pending && isRecreatedIdentity(pending, lastAuthIdentity)) {
      pending = null;
      persist(null);
    }
    setState({ hydrated: true, pending });
  })();
  return hydration;
}

export function getPendingAccountDeletionState(): PendingAccountDeletionState {
  return state;
}

export function subscribePendingAccountDeletion(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isAccountDeletionPendingFor(uid: string | null | undefined): boolean {
  return !!uid && state.pending?.uid === uid;
}

/** Only for an outcome where the backend may already have deleted data. */
export function markAccountDeletionUncertain(identity: AuthIdentity): void {
  if (!identity.uid) return;
  const pending: PendingAccountDeletion = {
    uid: identity.uid,
    createdAt: identity.createdAt,
    phase: 'reconciling',
  };
  setPending(pending);
  persist(pending);
}

export function clearPendingAccountDeletion(): void {
  if (!state.pending) return;
  setPending(null);
  persist(null);
}

/** Feed every Firebase Auth emission. A recreated account is not the pending one. */
export function acknowledgeAuthIdentityForPendingDeletion(identity: AuthIdentity | null): void {
  lastAuthIdentity = identity;
  const pending = state.pending;
  if (pending && isRecreatedIdentity(pending, identity)) clearPendingAccountDeletion();
}

/**
 * - `deleted`: Auth reported `user-not-found` for the pending uid. The closure
 *   barrier is engaged before the marker is cleared.
 * - `signed_out`: Auth no longer exposes that user (null or another user).
 * - `exists`: the same user still exists; deletion stays unconfirmed.
 * - `unverified`: Auth could not be checked.
 */
export type AccountDeletionReconciliationOutcome = 'deleted' | 'signed_out' | 'exists' | 'unverified';

export type AccountDeletionReconciliationDeps = {
  getCurrentIdentity: () => AuthIdentity | null;
  reloadCurrentUser: () => Promise<void>;
};

const USER_NOT_FOUND = 'auth/user-not-found';

export async function reconcilePendingAccountDeletion(
  deps: AccountDeletionReconciliationDeps,
): Promise<AccountDeletionReconciliationOutcome> {
  const pending = state.pending;
  if (!pending) return 'signed_out';
  const expectedUid = pending.uid;
  setPending({ ...pending, phase: 'reconciling' });

  const sameUser = () => deps.getCurrentIdentity()?.uid === expectedUid;
  if (!sameUser()) return 'signed_out';

  try {
    await deps.reloadCurrentUser();
  } catch (err) {
    if ((err as { code?: unknown } | null)?.code === USER_NOT_FOUND) {
      markAccountDeletionClosing(expectedUid);
      clearPendingAccountDeletion();
      return 'deleted';
    }
    if (!sameUser()) return 'signed_out';
    if (state.pending?.uid === expectedUid) setPending({ ...state.pending, phase: 'unverified' });
    return 'unverified';
  }

  if (!sameUser()) return 'signed_out';
  if (state.pending?.uid === expectedUid) setPending({ ...state.pending, phase: 'exists' });
  return 'exists';
}

/** Test helper */
export function __resetPendingAccountDeletionForTests(): void {
  state = { hydrated: false, pending: null };
  storage = null;
  hydration = null;
  lastAuthIdentity = null;
  listeners.clear();
}

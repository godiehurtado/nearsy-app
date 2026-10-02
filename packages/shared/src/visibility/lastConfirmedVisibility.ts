/**
 * Last confirmed Visibility per account — presentation only.
 *
 * Lets Home keep Active provisional across logout/login or remount while the
 * authoritative snapshot is still pending. Never authorizes runtime, Nearby
 * search or background publication: those still require a confirmed snapshot
 * plus validated permissions.
 *
 * Written only from server-confirmed snapshots and explicit user toggles.
 * Keys are namespaced by uid so one account can never inherit another's state.
 * Values are '1' / '0' — no PII.
 */

export type LastConfirmedVisibilityStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

const KEY_PREFIX = 'NEARSY_VISIBILITY_LAST_CONFIRMED_V1:';

const memory = new Map<string, boolean>();

export function lastConfirmedVisibilityKey(uid: string): string {
  return `${KEY_PREFIX}${uid}`;
}

/** Synchronous read of the in-memory value (undefined = unknown). */
export function peekLastConfirmedVisibility(
  uid: string | null | undefined,
): boolean | undefined {
  if (!uid) return undefined;
  return memory.get(uid);
}

export async function loadLastConfirmedVisibility(
  uid: string | null | undefined,
  storage: LastConfirmedVisibilityStorage,
): Promise<boolean | undefined> {
  if (!uid) return undefined;
  if (memory.has(uid)) return memory.get(uid);
  try {
    const raw = await storage.getItem(lastConfirmedVisibilityKey(uid));
    if (raw !== '1' && raw !== '0') return undefined;
    // A confirmed write may have landed while storage was being read.
    if (memory.has(uid)) return memory.get(uid);
    const value = raw === '1';
    memory.set(uid, value);
    return value;
  } catch {
    return undefined;
  }
}

export async function recordConfirmedVisibility(
  uid: string | null | undefined,
  visibility: boolean,
  storage: LastConfirmedVisibilityStorage,
): Promise<void> {
  if (!uid) return;
  memory.set(uid, visibility);
  try {
    await storage.setItem(
      lastConfirmedVisibilityKey(uid),
      visibility ? '1' : '0',
    );
  } catch {
    // Presentation hint only; the remote preference stays authoritative.
  }
}

/** Account deletion / profile gone — never on plain logout. */
export async function forgetLastConfirmedVisibility(
  uid: string | null | undefined,
  storage: LastConfirmedVisibilityStorage,
): Promise<void> {
  if (!uid) return;
  memory.delete(uid);
  try {
    await storage.removeItem(lastConfirmedVisibilityKey(uid));
  } catch {
    // best effort
  }
}

/**
 * Snapshot served from the local cache (not yet confirmed by the server) that
 * says not-Active must not override a confirmed Active: hold provisional until
 * the server answers.
 */
export function shouldHoldCachedVisibilitySnapshot(input: {
  fromCache: boolean | undefined;
  nextVisibility: boolean | undefined;
  lastConfirmedVisibility: boolean | undefined;
}): boolean {
  return (
    input.fromCache === true &&
    input.nextVisibility !== true &&
    input.lastConfirmedVisibility === true
  );
}

/** Only server-confirmed boolean values may update the stored hint. */
export function shouldRecordSnapshotVisibility(input: {
  fromCache: boolean | undefined;
  nextVisibility: boolean | undefined;
}): boolean {
  return input.fromCache !== true && typeof input.nextVisibility === 'boolean';
}

/** Test helper */
export function resetLastConfirmedVisibilityForTests(): void {
  memory.clear();
}

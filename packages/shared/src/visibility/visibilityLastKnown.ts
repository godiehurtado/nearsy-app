/**
 * Last confirmed Visibility per UID — presentation hint across logout/login
 * and Home remounts.
 *
 * - Namespaced by UID; stores only a boolean (no PII).
 * - Written only from a server-confirmed snapshot or an explicit
 *   activate/deactivate result.
 * - Never enables runtime/search: it only decides between Active provisional,
 *   neutral and Inactive while the server snapshot is not confirmed yet.
 * - Logout keeps it (same account returns to the same presentation); account
 *   deletion clears it.
 */

export const VISIBILITY_LAST_KNOWN_KEY_PREFIX =
  'NEARSY_VISIBILITY_LAST_KNOWN_V1:' as const;

export type VisibilityLastKnownStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

export type VisibilityLastKnownSource = 'server_snapshot' | 'explicit_action';

const memory = new Map<string, boolean>();

function normalizeUid(uid: string | null | undefined): string | null {
  const trimmed = String(uid ?? '').trim();
  return trimmed.length > 0 ? trimmed : null;
}

function keyFor(uid: string): string {
  return `${VISIBILITY_LAST_KNOWN_KEY_PREFIX}${uid}`;
}

function parseStored(raw: string | null | undefined): boolean | null {
  if (raw === '1') return true;
  if (raw === '0') return false;
  return null;
}

/** Synchronous in-process read (same session logout → login). */
export function peekLastKnownVisibility(
  uid: string | null | undefined,
): boolean | null {
  const id = normalizeUid(uid);
  if (!id) return null;
  return memory.has(id) ? (memory.get(id) as boolean) : null;
}

/** In-process value first, then persisted value (cold start). */
export async function readLastKnownVisibility(
  storage: VisibilityLastKnownStorage,
  uid: string | null | undefined,
): Promise<boolean | null> {
  const id = normalizeUid(uid);
  if (!id) return null;
  if (memory.has(id)) return memory.get(id) as boolean;
  try {
    const stored = parseStored(await storage.getItem(keyFor(id)));
    if (stored !== null && !memory.has(id)) memory.set(id, stored);
    return memory.has(id) ? (memory.get(id) as boolean) : null;
  } catch {
    return null;
  }
}

export async function recordConfirmedVisibility(
  storage: VisibilityLastKnownStorage,
  uid: string | null | undefined,
  visibility: boolean,
  _source: VisibilityLastKnownSource,
): Promise<void> {
  const id = normalizeUid(uid);
  if (!id) return;
  memory.set(id, visibility === true);
  try {
    await storage.setItem(keyFor(id), visibility === true ? '1' : '0');
  } catch {
    // In-process value still covers this session.
  }
}

export async function clearLastKnownVisibility(
  storage: VisibilityLastKnownStorage,
  uid: string | null | undefined,
): Promise<void> {
  const id = normalizeUid(uid);
  if (!id) return;
  memory.delete(id);
  try {
    await storage.removeItem(keyFor(id));
  } catch {
    // Best-effort.
  }
}

export function resetLastKnownVisibilityForTests(): void {
  memory.clear();
}

/**
 * How Home hydrates Visibility from one users/{uid} snapshot.
 *
 * - `active_pending`: persisted ON → Active provisional until validated.
 * - `last_known_provisional`: cached OFF but last confirmed ON for this UID →
 *   Active provisional until the server confirms.
 * - `await_confirmation`: unknown (cache miss / cached OFF without history) →
 *   neutral, never Inactive.
 * - `inactive`: explicit OFF (server-confirmed, or cache consistent with the
 *   last confirmed OFF).
 */
export type VisibilitySnapshotHydration =
  | 'active_pending'
  | 'last_known_provisional'
  | 'await_confirmation'
  | 'inactive';

export function resolveVisibilitySnapshotHydration(input: {
  exists: boolean;
  fromCache: boolean;
  persistedVisibility: boolean | undefined;
  lastKnownVisibility: boolean | null;
}): VisibilitySnapshotHydration {
  if (!input.exists) {
    return input.fromCache ? 'await_confirmation' : 'inactive';
  }
  if (input.persistedVisibility === true) return 'active_pending';
  if (!input.fromCache) return 'inactive';
  if (input.lastKnownVisibility === true) return 'last_known_provisional';
  if (input.lastKnownVisibility === false) return 'inactive';
  return 'await_confirmation';
}

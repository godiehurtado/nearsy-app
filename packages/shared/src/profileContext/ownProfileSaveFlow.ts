/**
 * Own Profile save → Discovery context sync ordering.
 *
 * 1. The private user-doc write runs first; a failure stops here and Discovery
 *    is never asked to re-project unsaved data.
 * 2. A save whose session ended (screen unmounted or another user signed in)
 *    stops before touching UI state or calling the sync.
 * 3. syncDiscoveryProfileContext then re-projects from the server copy.
 *    A sync failure never repeats or reverts the write; the caller may retry
 *    the sync alone (idempotent, no writes).
 */

import type { SyncDiscoveryProfileContextOutcome } from './syncDiscoveryProfileContext';
import { isSameCurrentCity, type CurrentCity } from './currentCity.ts';

/**
 * - synced: Discovery projection updated with the saved context.
 * - not-projected: no public projection yet (e.g. not visible); it is built
 *   from the saved user doc when visibility turns on.
 * - failed: Discovery may still show the previous context.
 */
export type DiscoveryContextSyncStatus = 'synced' | 'not-projected' | 'failed';

export function classifyDiscoveryContextSync(
  outcome: SyncDiscoveryProfileContextOutcome,
  expectedCity: CurrentCity | null,
): DiscoveryContextSyncStatus {
  if (outcome.kind === 'failed') return 'failed';
  if (outcome.kind === 'not_synced') return 'not-projected';
  const echoed = outcome.response.currentCity;
  if (echoed !== undefined && !isSameCurrentCity(echoed, expectedCity)) {
    return 'failed';
  }
  return 'synced';
}

export async function syncDiscoveryContextSafely(
  sync: () => Promise<SyncDiscoveryProfileContextOutcome>,
  expectedCity: CurrentCity | null,
): Promise<DiscoveryContextSyncStatus> {
  try {
    return classifyDiscoveryContextSync(await sync(), expectedCity);
  } catch {
    return 'failed';
  }
}

export type SaveThenSyncResult = DiscoveryContextSyncStatus | 'stale';

export async function persistThenSyncDiscovery(input: {
  write: () => Promise<unknown>;
  isCurrent: () => boolean;
  onPersisted: () => void;
  expectedCity: CurrentCity | null;
  sync: () => Promise<SyncDiscoveryProfileContextOutcome>;
}): Promise<SaveThenSyncResult> {
  await input.write();
  if (!input.isCurrent()) return 'stale';
  input.onPersisted();
  const status = await syncDiscoveryContextSafely(
    input.sync,
    input.expectedCity,
  );
  return input.isCurrent() ? status : 'stale';
}

/** True only while the screen is mounted and the same user is signed in. */
export function isSaveSessionCurrent(input: {
  startedUid: string | null;
  currentUid: string | null | undefined;
  mounted: boolean;
}): boolean {
  return (
    input.mounted &&
    !!input.startedUid &&
    input.startedUid === (input.currentUid ?? null)
  );
}

/** Drops re-entrant calls while one is in flight (double tap on Save). */
export function createSingleFlight() {
  let running = false;
  return {
    isRunning: () => running,
    async run<T>(fn: () => Promise<T>): Promise<T | undefined> {
      if (running) return undefined;
      running = true;
      try {
        return await fn();
      } finally {
        running = false;
      }
    },
  };
}

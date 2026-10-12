/**
 * Own Profile save → Discovery context sync ordering.
 *
 * 1. Private user-doc writes run first, in order; a failure stops here and
 *    Discovery is never asked to re-project unsaved data.
 * 2. Only after every write succeeds is the draft committed as saved.
 * 3. syncDiscoveryProfileContext then re-projects from the server copy.
 *    A sync failure never repeats or reverts the private writes; the caller
 *    reports it and may retry the sync alone (idempotent, no writes).
 */

import type { SyncDiscoveryProfileContextOutcome } from '../visibility/syncDiscoveryProfileContext';
import { isSameCurrentCity, type CurrentCity } from './currentCity';

/**
 * - synced: Discovery projection updated with the saved context.
 * - not-projected: no public projection exists yet (e.g. not visible); it is
 *   built from the saved user doc on activateVisibility / setActiveProfileMode.
 * - failed: Discovery may still show the previous context.
 */
export type DiscoveryContextSyncStatus = 'synced' | 'not-projected' | 'failed';

export function classifyDiscoveryContextSync(
  outcome: SyncDiscoveryProfileContextOutcome,
  expectedCity: CurrentCity | null,
): DiscoveryContextSyncStatus {
  if (outcome.ok === false) return 'failed';
  if (!outcome.response.synced) return 'not-projected';
  if (
    outcome.response.currentCity !== undefined &&
    !isSameCurrentCity(outcome.response.currentCity, expectedCity)
  ) {
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

export async function persistOwnProfileThenSyncDiscovery(input: {
  patches: ReadonlyArray<Record<string, unknown>>;
  write: (patch: Record<string, unknown>) => Promise<unknown>;
  onPersisted: () => void;
  expectedCity: CurrentCity | null;
  sync: () => Promise<SyncDiscoveryProfileContextOutcome>;
}): Promise<DiscoveryContextSyncStatus> {
  for (const patch of input.patches) {
    if (Object.keys(patch).length === 0) continue;
    await input.write(patch);
  }
  input.onPersisted();
  return syncDiscoveryContextSafely(input.sync, input.expectedCity);
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

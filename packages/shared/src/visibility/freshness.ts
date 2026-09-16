/**
 * Freshness and accuracy — pure (backend remains authoritative for eligibility).
 */

import {
  LOCATION_TTL_MS,
  MAX_LOCATION_ACCURACY_METERS,
} from './constants';
import type { LocationAvailability } from './types';

/**
 * Inclusive TTL: elapsed === LOCATION_TTL_MS is still fresh.
 * `confirmedAt` and `nowMs` are epoch milliseconds.
 */
export function isLocationFresh(
  confirmedAt: number,
  nowMs: number,
  ttlMs: number = LOCATION_TTL_MS,
): boolean {
  if (!Number.isFinite(confirmedAt) || !Number.isFinite(nowMs)) return false;
  if (confirmedAt > nowMs) return false;
  return nowMs - confirmedAt <= ttlMs;
}

export function isAccuracyValid(
  accuracyMeters: number,
  maxAccuracyMeters: number = MAX_LOCATION_ACCURACY_METERS,
): boolean {
  return (
    Number.isFinite(accuracyMeters) &&
    accuracyMeters >= 0 &&
    accuracyMeters <= maxAccuracyMeters
  );
}

export function evaluateLocationAvailability(input: {
  confirmedAt: number | null | undefined;
  accuracyMeters?: number | null;
  nowMs: number;
  ttlMs?: number;
}): LocationAvailability {
  if (input.confirmedAt == null || !Number.isFinite(input.confirmedAt)) {
    return { status: 'missing' };
  }
  if (
    input.accuracyMeters != null &&
    !isAccuracyValid(input.accuracyMeters)
  ) {
    return { status: 'invalid', reason: 'accuracy' };
  }
  if (!isLocationFresh(input.confirmedAt, input.nowMs, input.ttlMs)) {
    return { status: 'stale', confirmedAt: input.confirmedAt };
  }
  return { status: 'fresh', confirmedAt: input.confirmedAt };
}

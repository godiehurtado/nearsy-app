/**
 * Local filter helpers for Visibility / Discovery UI logic.
 *
 * Backend remains authoritative for eligibility, ranking, and privacy.
 * These helpers exist for client-side preview, tests, and UX consistency only.
 */

import {
  MAX_VISIBILITY_AGE,
  MIN_VISIBILITY_AGE,
} from './constants';
import type { LocalDiscoveryCandidate } from './types';

/** Inclusive age membership in [ageMin, ageMax]. */
export function isAgeWithinInclusiveRange(
  ageYears: number,
  ageMin: number,
  ageMax: number,
): boolean {
  return (
    Number.isFinite(ageYears) &&
    ageYears >= ageMin &&
    ageYears <= ageMax &&
    ageYears >= MIN_VISIBILITY_AGE &&
    ageYears <= MAX_VISIBILITY_AGE
  );
}

/** Inclusive distance: candidate distance ≤ maxDistanceMeters. */
export function isWithinMaxDistance(
  distanceMeters: number,
  maxDistanceMeters: number,
): boolean {
  return (
    Number.isFinite(distanceMeters) &&
    Number.isFinite(maxDistanceMeters) &&
    distanceMeters >= 0 &&
    distanceMeters <= maxDistanceMeters
  );
}

/**
 * Interest OR match:
 * - empty selection → any candidate passes;
 * - non-empty → at least one shared ID.
 */
export function interestsMatchOr(
  selectedInterestIds: readonly string[],
  candidateInterestIds: readonly string[],
): boolean {
  if (selectedInterestIds.length === 0) return true;
  const candidateSet = new Set(candidateInterestIds);
  return selectedInterestIds.some((id) => candidateSet.has(id));
}

/**
 * Deterministic local ordering: distance ASC, then uid ASC.
 * Not a substitute for server Discovery ordering.
 */
export function compareCandidatesByDistanceThenUid(
  a: Pick<LocalDiscoveryCandidate, 'distanceMeters' | 'uid'>,
  b: Pick<LocalDiscoveryCandidate, 'distanceMeters' | 'uid'>,
): number {
  if (a.distanceMeters !== b.distanceMeters) {
    return a.distanceMeters - b.distanceMeters;
  }
  if (a.uid < b.uid) return -1;
  if (a.uid > b.uid) return 1;
  return 0;
}

export function sortCandidatesByDistanceThenUid<
  T extends Pick<LocalDiscoveryCandidate, 'distanceMeters' | 'uid'>,
>(candidates: readonly T[]): T[] {
  return [...candidates].sort(compareCandidatesByDistanceThenUid);
}

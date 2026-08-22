/**
 * Visibility search preferences — pure helpers (no persistence).
 */

import {
  DEFAULT_METRIC_DISTANCE_METERS,
  DEFAULT_US_DISTANCE_METERS,
  MAX_SEARCH_INTEREST_IDS,
  MAX_VISIBILITY_AGE,
  MIN_VISIBILITY_AGE,
} from './constants';
import { isCanonicalDistanceInRange } from './distance';
import type {
  DistanceDisplayUnit,
  PreparedSearchPreferences,
  ProfileMode,
  ValidationResult,
  VisibilitySearchPreferences,
  VisibilitySearchPreferencesByMode,
} from './types';

export const INTEREST_IDS_OVER_MAX_REASON = 'interest-ids-over-max';

export function createDefaultSearchPreferences(
  unit: DistanceDisplayUnit,
  updatedAt: number = 0,
): VisibilitySearchPreferences {
  return {
    ageMin: MIN_VISIBILITY_AGE,
    ageMax: MAX_VISIBILITY_AGE,
    maxDistanceMeters:
      unit === 'ft'
        ? DEFAULT_US_DISTANCE_METERS
        : DEFAULT_METRIC_DISTANCE_METERS,
    interestIds: [],
    updatedAt,
  };
}

/** Independent defaults for Personal and Professional. */
export function createDefaultSearchPreferencesByMode(
  unit: DistanceDisplayUnit,
  updatedAt: number = 0,
): VisibilitySearchPreferencesByMode {
  return {
    personal: createDefaultSearchPreferences(unit, updatedAt),
    professional: createDefaultSearchPreferences(unit, updatedAt),
  };
}

export function isVisibilityAgeInBounds(age: number): boolean {
  return (
    Number.isInteger(age) &&
    age >= MIN_VISIBILITY_AGE &&
    age <= MAX_VISIBILITY_AGE
  );
}

export function validateAgeRange(
  ageMin: number,
  ageMax: number,
): ValidationResult {
  const reasons: string[] = [];
  if (!isVisibilityAgeInBounds(ageMin)) {
    reasons.push('ageMin-out-of-bounds');
  }
  if (!isVisibilityAgeInBounds(ageMax)) {
    reasons.push('ageMax-out-of-bounds');
  }
  if (ageMin > ageMax) {
    reasons.push('age-range-inverted');
  }
  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}

/**
 * Interest IDs: non-empty trimmed strings; custom IDs are never official.
 * Catalog membership is optional (pass `knownIds` when available).
 */
export function isCustomSearchInterestId(id: string): boolean {
  return typeof id === 'string' && id.startsWith('custom_');
}

export function isValidInterestId(
  id: string,
  knownIds?: ReadonlySet<string>,
): boolean {
  if (typeof id !== 'string') return false;
  const trimmed = id.trim();
  if (trimmed.length === 0 || trimmed !== id) return false;
  if (isCustomSearchInterestId(id)) return false;
  if (knownIds && !knownIds.has(id)) return false;
  return true;
}

export function isOfficialSearchInterestId(
  id: string,
  knownIds?: ReadonlySet<string>,
): boolean {
  return isValidInterestId(id, knownIds);
}

/** Official unique IDs in first-seen order (does not cap length). */
export function keepOfficialSearchInterestIds(
  ids: readonly string[],
  knownIds?: ReadonlySet<string>,
): string[] {
  return dedupeInterestIds(
    ids.filter((id) => isOfficialSearchInterestId(id, knownIds)),
  );
}

/** Official unique IDs, capped at MAX_SEARCH_INTEREST_IDS (lenient parse). */
export function sanitizeSearchInterestIds(
  ids: readonly string[],
  knownIds?: ReadonlySet<string>,
): string[] {
  return keepOfficialSearchInterestIds(ids, knownIds).slice(
    0,
    MAX_SEARCH_INTEREST_IDS,
  );
}

/** Adding a 13th independent official ID is not allowed. Deselect is always ok. */
export function canAddSearchInterest(
  currentIds: readonly string[],
  candidateId: string,
  knownIds?: ReadonlySet<string>,
): boolean {
  if (!isOfficialSearchInterestId(candidateId, knownIds)) return false;
  const current = keepOfficialSearchInterestIds(currentIds, knownIds);
  if (current.includes(candidateId)) return true;
  return current.length < MAX_SEARCH_INTEREST_IDS;
}

/** Deduplicate preserving first-seen order. */
export function dedupeInterestIds(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function validateInterestIds(
  ids: readonly string[],
  knownIds?: ReadonlySet<string>,
): ValidationResult {
  const reasons: string[] = [];
  for (const id of ids) {
    if (!isValidInterestId(id, knownIds)) {
      reasons.push(`invalid-interest-id:${id}`);
    }
  }
  const deduped = dedupeInterestIds(ids);
  if (deduped.length !== ids.length) {
    reasons.push('interest-ids-not-unique');
  }
  if (deduped.length > MAX_SEARCH_INTEREST_IDS) {
    reasons.push(INTEREST_IDS_OVER_MAX_REASON);
  }
  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}

/**
 * Drop unofficial IDs, then reject a 13th official selection before persist.
 * Empty `interestIds` remains valid (no filter).
 */
export function prepareSearchPreferencesForPersist(
  prefs: VisibilitySearchPreferences,
  knownIds?: ReadonlySet<string>,
): PreparedSearchPreferences {
  const official = keepOfficialSearchInterestIds(prefs.interestIds, knownIds);
  if (official.length > MAX_SEARCH_INTEREST_IDS) {
    return { ok: false, reasons: [INTEREST_IDS_OVER_MAX_REASON] };
  }
  const next: VisibilitySearchPreferences = {
    ...prefs,
    interestIds: official,
  };
  const check = validateSearchPreferences(next, knownIds);
  if (check.ok === false) return check;
  return { ok: true, prefs: next };
}

export function validateSearchPreferences(
  prefs: VisibilitySearchPreferences,
  knownIds?: ReadonlySet<string>,
): ValidationResult {
  const reasons: string[] = [];
  const age = validateAgeRange(prefs.ageMin, prefs.ageMax);
  if (age.ok === false) reasons.push(...age.reasons);
  if (!isCanonicalDistanceInRange(prefs.maxDistanceMeters)) {
    reasons.push('maxDistanceMeters-out-of-range');
  }
  const interests = validateInterestIds(prefs.interestIds, knownIds);
  if (interests.ok === false) reasons.push(...interests.reasons);
  if (!Number.isFinite(prefs.updatedAt) || prefs.updatedAt < 0) {
    reasons.push('updatedAt-invalid');
  }
  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}

export function selectPreferencesForMode(
  byMode: VisibilitySearchPreferencesByMode,
  mode: ProfileMode,
): VisibilitySearchPreferences {
  return byMode[mode];
}

/** Replace one mode without mutating the other (immutable). */
export function updatePreferencesForMode(
  byMode: VisibilitySearchPreferencesByMode,
  mode: ProfileMode,
  next: VisibilitySearchPreferences,
): VisibilitySearchPreferencesByMode {
  return {
    ...byMode,
    [mode]: next,
  };
}

/** Reset one mode to unit defaults; leave the other unchanged. */
export function resetPreferencesForMode(
  byMode: VisibilitySearchPreferencesByMode,
  mode: ProfileMode,
  unit: DistanceDisplayUnit,
  updatedAt: number = 0,
): VisibilitySearchPreferencesByMode {
  return updatePreferencesForMode(
    byMode,
    mode,
    createDefaultSearchPreferences(unit, updatedAt),
  );
}

export function withDedupedInterestIds(
  prefs: VisibilitySearchPreferences,
): VisibilitySearchPreferences {
  return {
    ...prefs,
    interestIds: dedupeInterestIds(prefs.interestIds),
  };
}

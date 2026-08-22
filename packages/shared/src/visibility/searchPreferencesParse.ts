/**
 * Pure searchPreferences parsing (no Firebase / RN).
 */

import {
  createDefaultSearchPreferencesByMode,
  validateSearchPreferences,
} from './preferences';
import type {
  DistanceDisplayUnit,
  VisibilitySearchPreferences,
  VisibilitySearchPreferencesByMode,
} from './types';

export function parseSearchPreferencesFromUserDoc(
  data: Record<string, unknown> | null | undefined,
  unit: DistanceDisplayUnit,
): VisibilitySearchPreferencesByMode {
  const defaults = createDefaultSearchPreferencesByMode(unit, Date.now());
  const raw = data?.searchPreferences;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return defaults;
  }
  const bag = raw as Record<string, unknown>;
  return {
    personal: parseOne(bag.personal, defaults.personal),
    professional: parseOne(bag.professional, defaults.professional),
  };
}

function parseOne(
  value: unknown,
  fallback: VisibilitySearchPreferences,
): VisibilitySearchPreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return fallback;
  }
  const v = value as Record<string, unknown>;
  const prefs: VisibilitySearchPreferences = {
    ageMin:
      typeof v.ageMin === 'number' && Number.isFinite(v.ageMin)
        ? v.ageMin
        : fallback.ageMin,
    ageMax:
      typeof v.ageMax === 'number' && Number.isFinite(v.ageMax)
        ? v.ageMax
        : fallback.ageMax,
    maxDistanceMeters:
      typeof v.maxDistanceMeters === 'number' &&
      Number.isFinite(v.maxDistanceMeters)
        ? v.maxDistanceMeters
        : fallback.maxDistanceMeters,
    interestIds: Array.isArray(v.interestIds)
      ? v.interestIds.filter((id): id is string => typeof id === 'string')
      : fallback.interestIds,
    updatedAt:
      typeof v.updatedAt === 'number' && Number.isFinite(v.updatedAt)
        ? v.updatedAt
        : fallback.updatedAt,
  };
  const check = validateSearchPreferences(prefs);
  return check.ok ? prefs : fallback;
}

export function resolveDistanceDisplayUnit(
  localeTag: string | undefined,
): DistanceDisplayUnit {
  const tag = (localeTag ?? '').toLowerCase().replace('_', '-');
  if (tag === 'en-us' || tag.endsWith('-us') || tag.includes('-us-')) {
    return 'ft';
  }
  return 'm';
}

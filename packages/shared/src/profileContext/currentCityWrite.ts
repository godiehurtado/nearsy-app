import {
  isSameCurrentCity,
  parseCurrentCity,
  type CurrentCity,
} from './currentCity.ts';

/**
 * `users/{uid}` patch for currentCity against the last persisted value.
 * - Unchanged → no key, so ordinary saves never rewrite the field.
 * - Removed (null) → `deleteSentinel` (Firestore field delete): real absence,
 *   never an empty object and never a country fallback.
 * - A malformed non-null value writes nothing rather than deleting.
 */
export function buildCurrentCityWritePatch(
  next: CurrentCity | null | undefined,
  persisted: CurrentCity | null | undefined,
  deleteSentinel: unknown,
): Record<string, unknown> {
  const nextCity = parseCurrentCity(next);
  if (next != null && !nextCity) return {};
  const persistedCity = parseCurrentCity(persisted);
  if (isSameCurrentCity(nextCity, persistedCity)) return {};
  if (!nextCity) return { currentCity: deleteSentinel };
  return { currentCity: { ...nextCity } };
}

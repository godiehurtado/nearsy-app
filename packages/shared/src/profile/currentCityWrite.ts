import { deleteField } from 'firebase/firestore';

import { isSameCurrentCity, parseCurrentCity, type CurrentCity } from './currentCity';

/**
 * `users/{uid}` patch for currentCity against the last persisted value.
 * Unchanged → no key at all, so ordinary saves never rewrite the field.
 * Removed (null) → the field is deleted (real absence, no country fallback).
 * A malformed non-null value writes nothing rather than deleting.
 */
export function buildCurrentCityWritePatch(
  next: CurrentCity | null | undefined,
  persisted: CurrentCity | null | undefined,
): Record<string, unknown> {
  const nextCity = parseCurrentCity(next);
  if (next != null && !nextCity) return {};
  const persistedCity = parseCurrentCity(persisted);
  if (isSameCurrentCity(nextCity, persistedCity)) return {};
  if (!nextCity) return { currentCity: deleteField() };
  return { currentCity: { ...nextCity } };
}

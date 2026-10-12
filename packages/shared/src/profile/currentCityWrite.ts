import { deleteField } from 'firebase/firestore';

import { isSameCurrentCity, parseCurrentCity, type CurrentCity } from './currentCity';

/**
 * `users/{uid}` patch for currentCity against the last persisted value.
 * Unchanged → no key at all, so ordinary saves never rewrite the field.
 * Removed → the field is deleted (real absence, no country fallback).
 */
export function buildCurrentCityWritePatch(
  next: CurrentCity | null | undefined,
  persisted: CurrentCity | null | undefined,
): Record<string, unknown> {
  const nextCity = parseCurrentCity(next);
  const persistedCity = parseCurrentCity(persisted);
  if (isSameCurrentCity(nextCity, persistedCity)) return {};
  if (!nextCity) return { currentCity: deleteField() };
  return { currentCity: { ...nextCity } };
}

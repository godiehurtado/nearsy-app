/**
 * Profile Context canonical fields (ENH-PROFILE-01).
 * Top-level users/{uid} fields — not mode presentation.
 * Client never writes zodiacSign.
 *
 * Legacy `residenceCountryCode` is neither read nor written: it is ignored
 * (not deleted) and never turned into a current city. `currentCity` is
 * optional and written only through `buildCurrentCityWritePatch`.
 */

import { normalizeCountryCode } from './countryCatalog';
import {
  isSameCurrentCity,
  parseCurrentCity,
  type CurrentCity,
} from './currentCity';
import {
  MAX_PROFILE_LANGUAGE_CODES,
  MIN_CRJ_LANGUAGE_CODES,
  normalizeLanguageCodes,
} from './languageCatalog';

export type ProfileContextFields = {
  birthCountryCode: string | null;
  currentCity: CurrentCity | null;
  languageCodes: string[];
};

export const EMPTY_PROFILE_CONTEXT: ProfileContextFields = {
  birthCountryCode: null,
  currentCity: null,
  languageCodes: [],
};

/** Read top-level context from a user document (safe defaults). */
export function readProfileContextFromUserDoc(
  data: Record<string, unknown> | null | undefined,
): ProfileContextFields {
  if (!data) return { ...EMPTY_PROFILE_CONTEXT };
  return {
    birthCountryCode: normalizeCountryCode(data.birthCountryCode),
    currentCity: parseCurrentCity(data.currentCity),
    languageCodes: normalizeLanguageCodes(data.languageCodes),
  };
}

/** Normalize draft context for compare/save. */
export function normalizeProfileContext(
  input: ProfileContextFields,
): ProfileContextFields {
  return {
    birthCountryCode: normalizeCountryCode(input.birthCountryCode),
    currentCity: parseCurrentCity(input.currentCity),
    languageCodes: normalizeLanguageCodes(input.languageCodes),
  };
}

export function isProfileContextDirty(
  draft: ProfileContextFields,
  snapshot: ProfileContextFields | null,
): boolean {
  if (!snapshot) return false;
  const a = normalizeProfileContext(draft);
  const b = normalizeProfileContext(snapshot);
  if (a.birthCountryCode !== b.birthCountryCode) return true;
  if (!isSameCurrentCity(a.currentCity, b.currentCity)) return true;
  if (a.languageCodes.length !== b.languageCodes.length) return true;
  return a.languageCodes.some((code, i) => code !== b.languageCodes[i]);
}

/** NEW CRJ identity gate — country of origin required; current city optional. */
export function isCrjIdentityContextValid(input: {
  birthCountryCode: string | null | undefined;
}): boolean {
  return normalizeCountryCode(input.birthCountryCode) != null;
}

/** NEW CRJ details gate — at least one language, at most 10. */
export function isCrjLanguagesValid(
  languageCodes: readonly string[] | null | undefined,
): boolean {
  const codes = normalizeLanguageCodes(languageCodes ?? []);
  return (
    codes.length >= MIN_CRJ_LANGUAGE_CODES &&
    codes.length <= MAX_PROFILE_LANGUAGE_CODES
  );
}

/**
 * Firestore patch for country of origin + languages only.
 * Never includes zodiacSign, currentCity or the legacy residence field.
 */
export function buildProfileContextSavePatch(input: {
  birthCountryCode: string | null;
  languageCodes: string[];
}): Record<string, unknown> {
  return {
    birthCountryCode: normalizeCountryCode(input.birthCountryCode),
    languageCodes: normalizeLanguageCodes(input.languageCodes),
  };
}

export function profileContextSaveOmitsZodiac(
  patch: Record<string, unknown>,
): boolean {
  return !Object.prototype.hasOwnProperty.call(patch, 'zodiacSign');
}

/** Discovery Detail context presence helpers. */
export function hasAnyDiscoveryContext(input: {
  birthCountryCode?: string | null;
  currentCity?: CurrentCity | null;
  languageCodes?: readonly string[] | null;
}): boolean {
  if (normalizeCountryCode(input.birthCountryCode)) return true;
  if (parseCurrentCity(input.currentCity)) return true;
  return normalizeLanguageCodes(input.languageCodes ?? []).length > 0;
}

/**
 * User-doc top-level profile context fields (NOT under profiles[mode]).
 * Zodiac is derived/server-owned — never written from this module.
 *
 * Legacy `residenceCountryCode` is no longer read or written: it is ignored
 * (not deleted) so ordinary saves cause no unexpected writes, and it is never
 * turned into a current city.
 */

import { normalizeCountryCode } from './countryCatalog';
import { parseCurrentCity, type CurrentCity } from './currentCity';
import {
  MAX_PROFILE_LANGUAGES,
  MIN_PROFILE_LANGUAGES_CRJ,
  normalizeLanguageCodes,
} from './languageCatalog';

export type UserProfileContext = {
  birthCountryCode: string | null;
  currentCity: CurrentCity | null;
  languageCodes: string[];
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseUserProfileContext(
  doc: unknown,
): UserProfileContext {
  if (!isPlainObject(doc)) {
    return {
      birthCountryCode: null,
      currentCity: null,
      languageCodes: [],
    };
  }

  return {
    birthCountryCode: normalizeCountryCode(doc.birthCountryCode),
    currentCity: parseCurrentCity(doc.currentCity),
    languageCodes: normalizeLanguageCodes(doc.languageCodes),
  };
}

/** Country of origin + languages. Current city uses buildCurrentCityWritePatch. */
export function buildProfileContextWritePatch(input: {
  birthCountryCode?: string | null;
  languageCodes?: string[];
}): Record<string, unknown> {
  const patch: Record<string, unknown> = {};

  if (Object.prototype.hasOwnProperty.call(input, 'birthCountryCode')) {
    patch.birthCountryCode = normalizeCountryCode(input.birthCountryCode);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'languageCodes')) {
    patch.languageCodes = normalizeLanguageCodes(input.languageCodes);
  }

  // Never include zodiacSign — derived, not user-writable via this patch.
  return patch;
}

/** CRJ requires the country of origin; current city is optional. */
export function isCrjProfileContextOriginValid(
  birth: string | null | undefined,
): boolean {
  return normalizeCountryCode(birth) !== null;
}

export function isCrjProfileContextLanguagesValid(
  codes: unknown,
): boolean {
  const normalized = normalizeLanguageCodes(codes);
  return (
    normalized.length >= MIN_PROFILE_LANGUAGES_CRJ &&
    normalized.length <= MAX_PROFILE_LANGUAGES
  );
}

export function areProfileContextFieldsComplete(
  ctx: UserProfileContext,
): boolean {
  return (
    isCrjProfileContextOriginValid(ctx.birthCountryCode) &&
    isCrjProfileContextLanguagesValid(ctx.languageCodes)
  );
}

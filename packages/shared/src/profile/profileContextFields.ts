/**
 * User-doc top-level profile context fields (NOT under profiles[mode]).
 * Zodiac is derived/server-owned — never written from this module.
 */

import { normalizeCountryCode } from './countryCatalog';
import {
  MAX_PROFILE_LANGUAGES,
  MIN_PROFILE_LANGUAGES_CRJ,
  normalizeLanguageCodes,
} from './languageCatalog';

export type UserProfileContext = {
  birthCountryCode: string | null;
  residenceCountryCode: string | null;
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
      residenceCountryCode: null,
      languageCodes: [],
    };
  }

  return {
    birthCountryCode: normalizeCountryCode(doc.birthCountryCode),
    residenceCountryCode: normalizeCountryCode(doc.residenceCountryCode),
    languageCodes: normalizeLanguageCodes(doc.languageCodes),
  };
}

export function buildProfileContextWritePatch(input: {
  birthCountryCode?: string | null;
  residenceCountryCode?: string | null;
  languageCodes?: string[];
}): Record<string, unknown> {
  const patch: Record<string, unknown> = {};

  if (Object.prototype.hasOwnProperty.call(input, 'birthCountryCode')) {
    patch.birthCountryCode = normalizeCountryCode(input.birthCountryCode);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'residenceCountryCode')) {
    patch.residenceCountryCode = normalizeCountryCode(
      input.residenceCountryCode,
    );
  }
  if (Object.prototype.hasOwnProperty.call(input, 'languageCodes')) {
    patch.languageCodes = normalizeLanguageCodes(input.languageCodes);
  }

  // Never include zodiacSign — derived, not user-writable via this patch.
  return patch;
}

export function isCrjProfileContextCountriesValid(
  birth: string | null | undefined,
  residence: string | null | undefined,
): boolean {
  return (
    normalizeCountryCode(birth) !== null &&
    normalizeCountryCode(residence) !== null
  );
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
    isCrjProfileContextCountriesValid(
      ctx.birthCountryCode,
      ctx.residenceCountryCode,
    ) && isCrjProfileContextLanguagesValid(ctx.languageCodes)
  );
}

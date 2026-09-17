/**
 * Profile Context canonical fields (ENH-PROFILE-01).
 * Top-level users/{uid} fields — not mode presentation.
 * Client never writes zodiacSign.
 */

import { normalizeCountryCode } from './countryCatalog';
import {
  MAX_PROFILE_LANGUAGE_CODES,
  MIN_CRJ_LANGUAGE_CODES,
  normalizeLanguageCodes,
} from './languageCatalog';

export type ProfileContextFields = {
  birthCountryCode: string | null;
  residenceCountryCode: string | null;
  languageCodes: string[];
};

export const EMPTY_PROFILE_CONTEXT: ProfileContextFields = {
  birthCountryCode: null,
  residenceCountryCode: null,
  languageCodes: [],
};

/** Read top-level context from a user document (safe defaults). */
export function readProfileContextFromUserDoc(
  data: Record<string, unknown> | null | undefined,
): ProfileContextFields {
  if (!data) return { ...EMPTY_PROFILE_CONTEXT };
  return {
    birthCountryCode: normalizeCountryCode(data.birthCountryCode),
    residenceCountryCode: normalizeCountryCode(data.residenceCountryCode),
    languageCodes: normalizeLanguageCodes(data.languageCodes),
  };
}

/** Normalize draft context for compare/save. */
export function normalizeProfileContext(
  input: ProfileContextFields,
): ProfileContextFields {
  return {
    birthCountryCode: normalizeCountryCode(input.birthCountryCode),
    residenceCountryCode: normalizeCountryCode(input.residenceCountryCode),
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
  if (a.residenceCountryCode !== b.residenceCountryCode) return true;
  if (a.languageCodes.length !== b.languageCodes.length) return true;
  return a.languageCodes.some((code, i) => code !== b.languageCodes[i]);
}

/** NEW CRJ identity gate — both countries required. */
export function isCrjIdentityContextValid(input: {
  birthCountryCode: string | null | undefined;
  residenceCountryCode: string | null | undefined;
}): boolean {
  return (
    normalizeCountryCode(input.birthCountryCode) != null &&
    normalizeCountryCode(input.residenceCountryCode) != null
  );
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
 * Firestore patch for context fields only.
 * Never includes zodiacSign.
 */
export function buildProfileContextSavePatch(
  input: ProfileContextFields,
): Record<string, unknown> {
  const normalized = normalizeProfileContext(input);
  return {
    birthCountryCode: normalized.birthCountryCode,
    residenceCountryCode: normalized.residenceCountryCode,
    languageCodes: normalized.languageCodes,
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
  residenceCountryCode?: string | null;
  languageCodes?: readonly string[] | null;
}): boolean {
  if (normalizeCountryCode(input.birthCountryCode)) return true;
  if (normalizeCountryCode(input.residenceCountryCode)) return true;
  return normalizeLanguageCodes(input.languageCodes ?? []).length > 0;
}

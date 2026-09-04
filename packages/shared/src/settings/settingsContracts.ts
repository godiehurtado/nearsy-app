/**
 * More / Settings — pure contracts for Unit 2A (no I/O).
 */
import {
  ageFromBirthDate,
  birthDateToIso,
  birthPartsFromIso,
  isCompleteBirthDate,
  type BirthDateParts,
} from '../utils/birthDate.ts';
import {
  MAX_VISIBILITY_AGE,
  MIN_VISIBILITY_AGE,
} from '../visibility/constants.ts';

export const SETTINGS_MIN_AGE = MIN_VISIBILITY_AGE;
export const SETTINGS_MAX_AGE = MAX_VISIBILITY_AGE;

export type PhoneVerificationClearPatch = {
  phoneVerified: false;
  phoneVerifiedAt: null;
};

export type BirthDatePersistencePatch = {
  birthDate: string;
  birthYear: number;
};

/** Canonical E.164-ish compare: digits-only after optional leading +. */
export function normalizeCanonicalPhone(
  value: string | null | undefined,
): string {
  if (!value) return '';
  const trimmed = value.replace(/\s+/g, '');
  if (!trimmed) return '';
  const digits = trimmed.replace(/\D/g, '');
  return trimmed.startsWith('+') ? `+${digits}` : digits ? `+${digits}` : '';
}

export function isValidE164Phone(fullPhone: string): boolean {
  if (!fullPhone) return false;
  return /^\+[1-9]\d{7,14}$/.test(fullPhone);
}

/**
 * When the canonical phone value actually changes, clear verification.
 * Same number → empty patch (do not invalidate).
 */
export function buildPhoneSavePatch(input: {
  previousPhone: string | null | undefined;
  nextPhone: string | null;
}): {
  phone: string | null;
  verification: PhoneVerificationClearPatch | null;
} {
  const next = input.nextPhone ? normalizeCanonicalPhone(input.nextPhone) : '';
  const prev = normalizeCanonicalPhone(input.previousPhone);
  const phone = next || null;
  if (phone && !isValidE164Phone(phone)) {
    throw new Error('INVALID_PHONE');
  }
  if (phone === (prev || null) || (!phone && !prev)) {
    return { phone, verification: null };
  }
  return {
    phone,
    verification: { phoneVerified: false, phoneVerifiedAt: null },
  };
}

export function validateSettingsBirthDate(
  parts: BirthDateParts,
  asOf: Date = new Date(),
):
  | { ok: true; age: number; iso: string; birthYear: number }
  | { ok: false; reason: 'incomplete' | 'invalid' | 'too_young' | 'too_old' } {
  if (!isCompleteBirthDate(parts)) {
    return { ok: false, reason: 'incomplete' };
  }
  const age = ageFromBirthDate(parts, asOf);
  const iso = birthDateToIso(parts);
  if (age == null || !iso || parts.year == null) {
    return { ok: false, reason: 'invalid' };
  }
  if (age < SETTINGS_MIN_AGE) return { ok: false, reason: 'too_young' };
  if (age > SETTINGS_MAX_AGE) return { ok: false, reason: 'too_old' };
  return { ok: true, age, iso, birthYear: parts.year };
}

export function buildBirthDatePersistencePatch(
  parts: BirthDateParts,
  asOf: Date = new Date(),
): BirthDatePersistencePatch {
  const result = validateSettingsBirthDate(parts, asOf);
  if (result.ok === false) {
    throw new Error(`INVALID_BIRTH_DATE:${result.reason}`);
  }
  return { birthDate: result.iso, birthYear: result.birthYear };
}

export function resolveBirthPartsFromProfile(input: {
  birthDate?: string | null;
  birthYear?: number | null;
}): BirthDateParts | null {
  if (typeof input.birthDate === 'string' && input.birthDate.trim()) {
    return birthPartsFromIso(input.birthDate.trim());
  }
  return null;
}

export function validateVisibilityAgeRange(
  minRaw: string,
  maxRaw: string,
):
  | { ok: true; min: number | null; max: number | null }
  | {
      ok: false;
      reason: 'min_bounds' | 'max_bounds' | 'order';
    } {
  const minTrim = minRaw.trim();
  const maxTrim = maxRaw.trim();
  const min = minTrim ? Number(minTrim) : null;
  const max = maxTrim ? Number(maxTrim) : null;

  if (minTrim) {
    if (
      !Number.isInteger(min) ||
      (min as number) < SETTINGS_MIN_AGE ||
      (min as number) > SETTINGS_MAX_AGE
    ) {
      return { ok: false, reason: 'min_bounds' };
    }
  }
  if (maxTrim) {
    if (
      !Number.isInteger(max) ||
      (max as number) < SETTINGS_MIN_AGE ||
      (max as number) > SETTINGS_MAX_AGE
    ) {
      return { ok: false, reason: 'max_bounds' };
    }
  }
  if (min != null && max != null && min > max) {
    return { ok: false, reason: 'order' };
  }
  return { ok: true, min, max };
}

export function formatVisibilityAgeSummary(
  min: number | null | undefined,
  max: number | null | undefined,
  notSetLabel: string,
): string {
  const hasMin = typeof min === 'number';
  const hasMax = typeof max === 'number';
  if (!hasMin && !hasMax) return notSetLabel;
  if (hasMin && hasMax) return `${min} – ${max}`;
  if (hasMin) return `${min}+`;
  return `≤ ${max}`;
}

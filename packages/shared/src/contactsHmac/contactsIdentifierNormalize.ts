/**
 * Address-book identifiers normalized with the same rules Identity applies in
 * `syncContactHashes` (nearsy-identity-functions src/modules/contactsHmac/normalize.ts,
 * libphonenumber-js 1.13.11 with `max` metadata). Identity rejects the whole
 * request for one identifier it cannot normalize, so the client sends only rows
 * that pass, already in canonical form.
 *
 * Never logs or returns raw values outside the identifiers themselves.
 */
import { parsePhoneNumberWithError, type CountryCode } from 'libphonenumber-js/max';

import {
  CONTACT_EMAIL_MAX_CHARS,
  CONTACT_EMAIL_RE,
  CONTACT_PHONE_MAX_CHARS,
  type ContactIdentifierInput,
} from './contactsHmacContract.ts';

/** Identity: at most 28 characters before parsing. */
const PHONE_RAW_MAX_CHARS = CONTACT_PHONE_MAX_CHARS + 8;

export type PhoneDropReason = 'no_region' | 'extension' | 'invalid';

export type PhoneNormalization =
  | { ok: true; value: string }
  | { ok: false; reason: PhoneDropReason };

/** Same checks as Identity `normalizeEmail`; null when Identity would reject it. */
export function normalizeContactEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  if (
    !email ||
    email.length > CONTACT_EMAIL_MAX_CHARS ||
    !CONTACT_EMAIL_RE.test(email) ||
    email.includes('..')
  ) {
    return null;
  }
  return email;
}

function isCountryCode(value: unknown): value is CountryCode {
  return typeof value === 'string' && /^[A-Z]{2}$/.test(value);
}

/**
 * E.164 of a phone that Identity accepts, or why it cannot be sent.
 *
 * - International ("+..."): parsed as is.
 * - National: only with a reliable region. Without one it is left out; no
 *   country is guessed, and no prefix is added by intuition.
 * - Extensions, letters, short codes and numbers that are not valid for their
 *   country are left out: Identity would reject the whole snapshot for them.
 */
export function normalizeContactPhone(
  raw: string,
  reliableRegion?: string | null,
): PhoneNormalization {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, reason: 'invalid' };
  if (/[A-Za-z]/.test(trimmed)) {
    // "ext", "x": Identity rejects letters. A line with an extension is not a person's number.
    return { ok: false, reason: /(ext|x)\.?\s*\d+\s*$/i.test(trimmed) ? 'extension' : 'invalid' };
  }
  if (/[,;#]/.test(trimmed)) {
    // Android pause/wait characters and "#" dial extensions.
    return { ok: false, reason: 'extension' };
  }
  if (trimmed.length > PHONE_RAW_MAX_CHARS) return { ok: false, reason: 'invalid' };
  const international = trimmed.startsWith('+');
  if (!international && !isCountryCode(reliableRegion)) {
    return { ok: false, reason: 'no_region' };
  }
  try {
    const parsed = international
      ? parsePhoneNumberWithError(trimmed, { extract: false })
      : parsePhoneNumberWithError(trimmed, {
          extract: false,
          defaultCountry: reliableRegion as CountryCode,
        });
    if (parsed.ext) return { ok: false, reason: 'extension' };
    if (!parsed.isPossible() || !parsed.isValid()) return { ok: false, reason: 'invalid' };
    const e164 = parsed.format('E.164');
    if (!e164.startsWith('+') || e164.length > CONTACT_PHONE_MAX_CHARS) {
      return { ok: false, reason: 'invalid' };
    }
    return { ok: true, value: e164 };
  } catch {
    return { ok: false, reason: 'invalid' };
  }
}

/**
 * Region of the account's own verified phone: the one reliable region the app
 * has. The device language is not a country, and neither is a guess.
 */
export function reliableRegionFromVerifiedPhone(
  phone: unknown,
  phoneVerified: unknown,
): string | null {
  if (phoneVerified !== true || typeof phone !== 'string') return null;
  const normalized = normalizeContactPhone(phone);
  if (!normalized.ok) return null;
  try {
    const country = parsePhoneNumberWithError(normalized.value).country;
    return isCountryCode(country) ? country : null;
  } catch {
    return null;
  }
}

/** True when Identity's parser accepts the row exactly as sent. */
export function isWireValidIdentifier(row: unknown): row is ContactIdentifierInput {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return false;
  const rec = row as Record<string, unknown>;
  if (Object.keys(rec).some((key) => key !== 'kind' && key !== 'value')) return false;
  if (typeof rec.value !== 'string') return false;
  if (rec.kind === 'email') return normalizeContactEmail(rec.value) === rec.value;
  if (rec.kind === 'phone') {
    const phone = normalizeContactPhone(rec.value);
    return phone.ok && phone.value === rec.value;
  }
  return false;
}

/** Aggregate counts only: safe to log. */
export type IdentifierStats = {
  emailsSeen: number;
  emailsKept: number;
  emailsInvalid: number;
  phonesSeen: number;
  phonesKept: number;
  phonesNoRegion: number;
  phonesExtension: number;
  phonesInvalid: number;
  duplicates: number;
};

export function emptyIdentifierStats(): IdentifierStats {
  return {
    emailsSeen: 0,
    emailsKept: 0,
    emailsInvalid: 0,
    phonesSeen: 0,
    phonesKept: 0,
    phonesNoRegion: 0,
    phonesExtension: 0,
    phonesInvalid: 0,
    duplicates: 0,
  };
}

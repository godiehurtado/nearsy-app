/**
 * Client-side identifier filter. Identity still normalizes and HMACs.
 * Invalid identifiers are skipped one by one, never the whole contact, and
 * the rest still upload. Identity rejects the whole request when any single
 * identifier is invalid, so the client applies the same rules first.
 * Over-cap is a hard reject — Identity does not silent-truncate.
 */

import {
  ParseError,
  parsePhoneNumberWithError,
  type CountryCode,
} from 'libphonenumber-js/max';

import {
  CONTACT_EMAIL_MAX_CHARS,
  CONTACT_HASH_CAP,
  CONTACT_PHONE_MAX_CHARS,
  type ContactIdentifierInput,
  type ContactIdentifierKind,
} from './domain';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Invisible format marks iOS can keep around numbers (bidi, BOM, zero-width). */
const FORMAT_MARKS_RE = /[​-‏‪-‮⁠-⁩﻿]/g;

export type AddressBookContactRow = {
  phoneNumbers?: Array<{ number?: string | null } | null> | null;
  emails?: Array<{ email?: string | null } | null> | null;
};

export function tryNormalizeEmail(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  const email = raw.trim().toLowerCase();
  if (
    !email ||
    email.length > CONTACT_EMAIL_MAX_CHARS ||
    !EMAIL_RE.test(email) ||
    email.includes('..')
  ) {
    return null;
  }
  return email;
}

/**
 * Identity's normalizeContactPhone rules (libphonenumber-js/max, same version):
 * starts with "+", at most 28 characters, no letters, possible and valid, and an
 * E.164 of at most 20 characters. Returns that E.164 or null.
 */
function identityAcceptedE164(candidate: string): string | null {
  if (
    !candidate.startsWith('+') ||
    candidate.length > CONTACT_PHONE_MAX_CHARS + 8 ||
    /[A-Za-z]/.test(candidate)
  ) {
    return null;
  }
  try {
    const parsed = parsePhoneNumberWithError(candidate, { extract: false });
    if (!parsed.isPossible() || !parsed.isValid()) return null;
    const e164 = parsed.format('E.164');
    return e164.length <= CONTACT_PHONE_MAX_CHARS ? e164 : null;
  } catch (err) {
    // ParseError is an invalid number; anything else must not break the sync.
    if (err instanceof ParseError) return null;
    return null;
  }
}

/**
 * Normalizes one address-book phone to the E.164 Identity accepts.
 *
 * - A number written with "+" keeps its own country; the default region is
 *   never applied to it.
 * - A national number (no "+") is read in `defaultRegion` only when one is
 *   given. That region is an interpretation rule, not a fact about the
 *   contact's country. Without it, nothing is prefixed and the number is
 *   skipped.
 * - Every result is checked again with Identity's rules before it is kept.
 */
export function tryNormalizePhone(
  raw: string,
  defaultRegion?: CountryCode | null,
): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.replace(FORMAT_MARKS_RE, '').trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('+')) return identityAcceptedE164(trimmed);
  if (!defaultRegion || trimmed.length > CONTACT_PHONE_MAX_CHARS + 8 || /[A-Za-z]/.test(trimmed)) {
    return null;
  }
  try {
    const parsed = parsePhoneNumberWithError(trimmed, {
      defaultCountry: defaultRegion,
      extract: false,
    });
    if (!parsed.isPossible() || !parsed.isValid()) return null;
    return identityAcceptedE164(parsed.format('E.164'));
  } catch {
    return null;
  }
}

export function tryNormalizeIdentifier(
  kind: ContactIdentifierKind,
  value: string,
  defaultRegion?: CountryCode | null,
): string | null {
  if (kind === 'email') return tryNormalizeEmail(value);
  if (kind === 'phone') return tryNormalizePhone(value, defaultRegion);
  return null;
}

export type SelectIdentifiersResult =
  | { ok: true; identifiers: ContactIdentifierInput[] }
  | { ok: false; reason: 'contacts-identifier-cap' | 'contacts-identifier-invalid' };

const hasText = (value: unknown): boolean =>
  typeof value === 'string' && value.trim().length > 0;

/**
 * Collect unique normalized identifiers. More than CONTACT_HASH_CAP unique
 * values → cap (do not truncate).
 *
 * Empty is only valid when the book holds no phone or email at all. A book that
 * holds some, none of them valid (for example only national numbers), fails as
 * contacts-identifier-invalid: sending an empty snapshot would erase the
 * previous sync without evidence that the contacts are gone.
 */
export function selectUploadableIdentifiers(
  rows: readonly AddressBookContactRow[],
  options: { defaultRegion?: CountryCode | null; cap?: number } = {},
): SelectIdentifiersResult {
  const cap = options.cap ?? CONTACT_HASH_CAP;
  const unique = new Map<string, ContactIdentifierInput>();
  let present = 0;
  for (const row of rows) {
    for (const phone of row.phoneNumbers ?? []) {
      if (hasText(phone?.number)) present += 1;
      const value = tryNormalizePhone(phone?.number ?? '', options.defaultRegion);
      if (!value) continue;
      unique.set(`phone:${value}`, { kind: 'phone', value });
    }
    for (const email of row.emails ?? []) {
      if (hasText(email?.email)) present += 1;
      const value = tryNormalizeEmail(email?.email ?? '');
      if (!value) continue;
      unique.set(`email:${value}`, { kind: 'email', value });
    }
  }
  // Counted after normalizing and deduplicating; over the limit nothing is sent.
  if (unique.size > cap) {
    return { ok: false, reason: 'contacts-identifier-cap' };
  }
  if (unique.size === 0 && present > 0) {
    return { ok: false, reason: 'contacts-identifier-invalid' };
  }
  const identifiers = [...unique.values()].sort((a, b) => {
    const keyA = `${a.kind}:${a.value}`;
    const keyB = `${b.kind}:${b.value}`;
    return keyA < keyB ? -1 : keyA > keyB ? 1 : 0;
  });
  return { ok: true, identifiers };
}

/** Local change detector. Not an Identity HMAC. Never stores raw identifiers. */
export function fingerprintIdentifiers(
  identifiers: readonly ContactIdentifierInput[],
): string {
  const payload = identifiers.map((row) => `${row.kind}:${row.value}`).join('\n');
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < payload.length; i += 1) {
    h1 ^= payload.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= payload.charCodeAt(payload.length - 1 - i);
    h2 = Math.imul(h2, 0x811c9dc5);
  }
  return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}:${identifiers.length}`;
}

export function nextSnapshotVersion(input: {
  lastVersion: number | null;
  lastFingerprint: string | null;
  nextFingerprint: string;
}): number {
  if (
    input.lastVersion != null &&
    input.lastVersion >= 1 &&
    input.lastFingerprint === input.nextFingerprint
  ) {
    return input.lastVersion;
  }
  return (input.lastVersion != null && input.lastVersion >= 1
    ? input.lastVersion
    : 0) + 1;
}

export function createSourceId(randomHex: string): string {
  const compact = randomHex.replace(/[^A-Za-z0-9]/g, '');
  const id = `ios_${compact}`.slice(0, 32);
  return id.length >= 8 ? id : `ios_${compact}src0000`.slice(0, 16);
}

/**
 * Default region for national numbers: only the country of the account's own
 * phone, and only when OTP verified it. Never language, locale or SIM.
 * Null when there is no verified phone or it has no single country.
 */
export function resolveDefaultPhoneRegion(input: {
  phone: unknown;
  phoneVerified: unknown;
}): CountryCode | null {
  if (input.phoneVerified !== true || typeof input.phone !== 'string') return null;
  const own = input.phone.trim();
  if (!own.startsWith('+')) return null;
  try {
    const parsed = parsePhoneNumberWithError(own, { extract: false });
    if (!parsed.isValid()) return null;
    return parsed.country ?? null;
  } catch {
    return null;
  }
}

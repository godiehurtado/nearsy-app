/**
 * Client-side identifier filter. Identity still normalizes and HMACs.
 * Invalid identifiers are skipped one by one, never the whole contact, and
 * the rest still upload. Identity rejects the whole request when any single
 * identifier is invalid, so the client applies the same rules first.
 * Over-cap is a hard reject — Identity does not silent-truncate.
 */

import { ParseError, parsePhoneNumberWithError } from 'libphonenumber-js/max';

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
 * Same rules as Identity's normalizeContactPhone (libphonenumber-js/max, same
 * version): international form only, possible and valid, sent as E.164.
 * Anything Identity would refuse is skipped here instead of failing the sync.
 */
export function tryNormalizePhone(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.replace(FORMAT_MARKS_RE, '').trim();
  if (
    !trimmed.startsWith('+') ||
    trimmed.length > CONTACT_PHONE_MAX_CHARS + 8 ||
    /[A-Za-z]/.test(trimmed)
  ) {
    return null;
  }
  try {
    const parsed = parsePhoneNumberWithError(trimmed, { extract: false });
    if (!parsed.isPossible() || !parsed.isValid()) return null;
    const e164 = parsed.format('E.164');
    return e164.length <= CONTACT_PHONE_MAX_CHARS ? e164 : null;
  } catch (err) {
    // ParseError is an invalid number; anything else must not break the sync.
    if (err instanceof ParseError) return null;
    return null;
  }
}

export function tryNormalizeIdentifier(
  kind: ContactIdentifierKind,
  value: string,
): string | null {
  if (kind === 'email') return tryNormalizeEmail(value);
  if (kind === 'phone') return tryNormalizePhone(value);
  return null;
}

export type SelectIdentifiersResult =
  | { ok: true; identifiers: ContactIdentifierInput[] }
  | { ok: false; reason: 'contacts-identifier-cap' };

/**
 * Collect unique normalized identifiers. Empty is a valid granted book.
 * More than CONTACT_HASH_CAP unique values → cap (do not truncate).
 */
export function selectUploadableIdentifiers(
  rows: readonly AddressBookContactRow[],
): SelectIdentifiersResult {
  const unique = new Map<string, ContactIdentifierInput>();
  for (const row of rows) {
    for (const phone of row.phoneNumbers ?? []) {
      const value = tryNormalizePhone(phone?.number ?? '');
      if (!value) continue;
      unique.set(`phone:${value}`, { kind: 'phone', value });
    }
    for (const email of row.emails ?? []) {
      const value = tryNormalizeEmail(email?.email ?? '');
      if (!value) continue;
      unique.set(`email:${value}`, { kind: 'email', value });
    }
  }
  if (unique.size > CONTACT_HASH_CAP) {
    return { ok: false, reason: 'contacts-identifier-cap' };
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

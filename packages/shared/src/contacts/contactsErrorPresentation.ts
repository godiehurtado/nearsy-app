/**
 * User-safe Contacts sync error copy. Maps Identity reason tokens only —
 * never raw transport messages.
 */
import type { TFunction } from 'i18next';

import type { ContactsHmacFailReason } from './errors';

/** Bound client-side wait so More Settings never hangs on address-book sync. */
export const CONTACTS_SYNC_TIMEOUT_MS = 45_000;

const RETRYABLE_REASONS = new Set<string>([
  'contacts-hmac-unavailable',
  'contacts-rate-limited',
  'contacts-invalid-response',
  'contacts-epoch-mismatch',
  'contacts-snapshot-stale',
  'contacts-snapshot-conflict',
  'contacts-timeout',
]);

const CAP_REASONS = new Set<string>([
  'contacts-source-cap',
  'contacts-identifier-cap',
  'contacts-union-cap',
]);

export function isContactsSyncRetryable(reason: string): boolean {
  // Caps need a user action (trim address book) — identical auto-retry is wrong.
  if (CAP_REASONS.has(reason)) return false;
  return RETRYABLE_REASONS.has(reason);
}

export function isContactsCapExceeded(reason: string): boolean {
  return CAP_REASONS.has(reason);
}

export function presentContactsSyncError(
  reason: string,
  t: TFunction,
): string {
  const key = reason as ContactsHmacFailReason | 'contacts-timeout';
  switch (key) {
    case 'contacts-os-denied':
      return t('settings.contacts.permissionDenied');
    case 'contacts-unauthenticated':
      return t('settings.contacts.errors.unauthenticated');
    case 'contacts-account-gone':
      return t('settings.contacts.errors.accountGone');
    case 'contacts-not-enabled':
      return t('settings.contacts.errors.notEnabled');
    case 'contacts-epoch-mismatch':
    case 'contacts-snapshot-stale':
    case 'contacts-snapshot-conflict':
      return t('settings.contacts.errors.stale');
    case 'contacts-source-removed':
      return t('settings.contacts.errors.sourceRemoved');
    case 'contacts-source-cap':
    case 'contacts-identifier-cap':
    case 'contacts-union-cap':
      return t('settings.contacts.errors.capAction');
    case 'contacts-identifier-invalid':
    case 'contacts-client-hash-rejected':
      return t('settings.contacts.errors.invalid');
    case 'contacts-hmac-unavailable':
    case 'contacts-rate-limited':
      return t('settings.contacts.errors.unavailable');
    case 'contacts-timeout':
      return t('settings.contacts.errors.timeout');
    case 'contacts-invalid-response':
    default:
      return t('settings.contacts.errors.generic');
  }
}

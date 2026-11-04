/**
 * Identity Contacts HMAC errors (PR #23).
 * Identity reason tokens only. Previous Functions draft names are not used.
 */

export type ContactsHmacFailReason =
  | 'contacts-unauthenticated'
  | 'contacts-account-gone'
  | 'contacts-not-enabled'
  | 'contacts-epoch-mismatch'
  | 'contacts-epoch-required'
  | 'contacts-snapshot-stale'
  | 'contacts-snapshot-conflict'
  | 'contacts-source-removed'
  | 'contacts-source-cap'
  | 'contacts-identifier-cap'
  | 'contacts-union-cap'
  | 'contacts-identifier-invalid'
  | 'contacts-client-hash-rejected'
  | 'contacts-hmac-unavailable'
  | 'contacts-auth-lookup-failed'
  | 'contacts-rate-limited'
  | 'contacts-invalid-response'
  | 'contacts-os-denied';

const IDENTITY_REASONS = new Set<string>([
  'contacts-unauthenticated',
  'contacts-account-gone',
  'contacts-not-enabled',
  'contacts-epoch-mismatch',
  'contacts-epoch-required',
  'contacts-snapshot-stale',
  'contacts-snapshot-conflict',
  'contacts-source-removed',
  'contacts-source-cap',
  'contacts-identifier-cap',
  'contacts-union-cap',
  'contacts-identifier-invalid',
  'contacts-client-hash-rejected',
  'contacts-hmac-unavailable',
  'contacts-auth-lookup-failed',
  'contacts-rate-limited',
]);

/**
 * Proves Identity rejected this call and wrote nothing. Anything else
 * (transport, unparseable, infrastructure) may have been applied server-side.
 */
export function isDefiniteContactsRejection(reason: string): boolean {
  return (
    reason !== 'contacts-hmac-unavailable' &&
    reason !== 'contacts-auth-lookup-failed' &&
    reason !== 'contacts-invalid-response' &&
    reason !== 'contacts-timeout'
  );
}

export class ContactsHmacClientError extends Error {
  readonly reason: ContactsHmacFailReason;
  readonly retryable: boolean;

  constructor(reason: ContactsHmacFailReason, message: string, retryable = false) {
    super(message);
    this.name = 'ContactsHmacClientError';
    this.reason = reason;
    this.retryable = retryable;
  }
}

export function isContactsHmacClientError(
  value: unknown,
): value is ContactsHmacClientError {
  return value instanceof ContactsHmacClientError;
}

const REASON_IN_MESSAGE = /\((contacts-[a-z-]+)\)/;

export function parseContactsHmacFailReason(
  value: unknown,
): ContactsHmacFailReason | null {
  if (typeof value === 'string' && IDENTITY_REASONS.has(value)) {
    return value as ContactsHmacFailReason;
  }
  if (typeof value === 'string') {
    const match = REASON_IN_MESSAGE.exec(value);
    if (match && IDENTITY_REASONS.has(match[1])) {
      return match[1] as ContactsHmacFailReason;
    }
  }
  if (value && typeof value === 'object') {
    const rec = value as Record<string, unknown>;
    const fromReason = parseContactsHmacFailReason(rec.reason);
    if (fromReason) return fromReason;
    const fromMessage = parseContactsHmacFailReason(rec.message);
    if (fromMessage) return fromMessage;
    const details = rec.details;
    if (details && typeof details === 'object') {
      const nested = parseContactsHmacFailReason(
        (details as Record<string, unknown>).reason,
      );
      if (nested) return nested;
    }
  }
  return null;
}

/** Epoch / cap failures must not mark the address book synced. */
export function shouldMarkBookSynced(reason: ContactsHmacFailReason | null): boolean {
  if (!reason) return true;
  return (
    reason !== 'contacts-epoch-mismatch' &&
    reason !== 'contacts-epoch-required' &&
    reason !== 'contacts-union-cap' &&
    reason !== 'contacts-identifier-cap' &&
    reason !== 'contacts-snapshot-stale' &&
    reason !== 'contacts-snapshot-conflict' &&
    reason !== 'contacts-source-removed' &&
    reason !== 'contacts-not-enabled' &&
    reason !== 'contacts-os-denied'
  );
}

/**
 * Identity Contacts HMAC client contract, at #27 (merge
 * 295e0f44fc34bf4a1f17afa2d5ece987203665d1): contract v1 §14 for mobile clients.
 * Writer: godiehurtado/nearsy-identity-functions @ cf6e6d9862d0005e00ae84d4dbdca6791d242fa8
 * Functions #40 consume: 60d33bab35743b39d221ec92d550129b623173f5
 *   (exact `source.epoch === contactsEpoch`; not Identity fencing).
 *
 * Do not use Functions-draft names (enableContactSync, expectedEpoch,
 * deleteContactSource). Clients send identifiers; Identity HMACs.
 */

export const CONTACTS_HMAC_REGION = 'us-central1' as const;
export const CONTACTS_HMAC_CODEBASE = 'nearsy-identity' as const;

export const ENABLE_CONTACTS_SYNC = 'enableContactsSync' as const;
export const SYNC_CONTACT_HASHES = 'syncContactHashes' as const;
export const DISABLE_CONTACTS_SYNC = 'disableContactsSync' as const;
export const REMOVE_CONTACT_SOURCE = 'removeContactSource' as const;
export const REFRESH_VERIFIED_ACTOR_KEYS = 'refreshVerifiedActorKeys' as const;

export const CONTACT_HASH_CAP = 500;
export const CONTACT_SOURCE_CAP = 8;
export const CONTACT_SOURCE_ID_MIN = 8;
export const CONTACT_SOURCE_ID_MAX = 128;
export const CONTACT_EMAIL_MAX_CHARS = 254;
export const CONTACT_PHONE_MAX_CHARS = 20;
export const SOURCE_ID_RE = /^[A-Za-z0-9_-]{8,128}$/;
export const CONTACT_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const CONTACT_E164_RE = /^\+[1-9]\d{7,14}$/;

export const BANNED_CONTACTS_WIRE_FIELDS = [
  'hashes',
  'hash',
  'name',
  'names',
  'photo',
  'photos',
  'note',
  'notes',
  'displayName',
] as const;

export const CONTACTS_HMAC_FAIL_REASONS = [
  'contacts-unauthenticated',
  'contacts-account-gone',
  'contacts-not-enabled',
  'contacts-epoch-mismatch',
  'contacts-epoch-required',
  'contacts-snapshot-stale',
  'contacts-source-removed',
  'contacts-snapshot-conflict',
  'contacts-source-cap',
  'contacts-identifier-cap',
  'contacts-union-cap',
  'contacts-identifier-invalid',
  'contacts-client-hash-rejected',
  'contacts-hmac-unavailable',
  'contacts-rate-limited',
  /** Identity Admin Auth / actor lookup — not a missing HMAC secret. */
  'contacts-auth-lookup-failed',
] as const;

export type ContactsHmacFailReason = (typeof CONTACTS_HMAC_FAIL_REASONS)[number];

export type ContactIdentifierKind = 'phone' | 'email';

export type ContactIdentifierInput = {
  kind: ContactIdentifierKind;
  value: string;
};

export type EnableContactsSyncRequest = {
  contactsEpoch: number;
};
export type RefreshVerifiedActorKeysRequest = Record<string, never>;

export type SyncContactHashesRequest = {
  sourceId: string;
  snapshotVersion: number;
  contactsEpoch: number;
  identifiers: ContactIdentifierInput[];
};

export type DisableContactsSyncRequest = {
  contactsEpoch: number;
};

export type RemoveContactSourceRequest = {
  sourceId: string;
  contactsEpoch: number;
  /** Highest version sent for this source and epoch, uncertain ones included. */
  knownSnapshotVersion?: number;
};

/**
 * Full Identity `ContactsWireResult` (service.ts). No omitted fields.
 */
export type ContactsWireResult = {
  result: string;
  contactsSyncEnabled: boolean;
  contactsEpoch: number;
  notifyNearbyContactsEffective: boolean;
  sourceId?: string;
  snapshotVersion?: number;
  identifierCount?: number;
  keyCount?: number;
  syncCommitted: boolean;
  reevaluateRequired: boolean;
};

export type EnableContactsSyncResult = ContactsWireResult & {
  result: 'enabled';
};
export type SyncContactHashesResult = ContactsWireResult & {
  result: 'synced' | 'idempotent';
};
export type DisableContactsSyncResult = ContactsWireResult & {
  result: 'disabled';
};
export type RemoveContactSourceResult = ContactsWireResult & {
  result: 'removed' | 'absent' | 'superseded';
};
export type RefreshVerifiedActorKeysResult = ContactsWireResult & {
  result: 'refreshed';
};

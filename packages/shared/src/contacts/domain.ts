/**
 * Identity Contacts HMAC domain (PR #23 @ 7ebba056).
 * Clients send raw identifiers over TLS. Identity hashes. Never persist raw.
 */

export const CONTACT_HASH_CAP = 500;
export const CONTACT_SOURCE_CAP = 8;
export const CONTACT_SOURCE_ID_MIN = 8;
export const CONTACT_SOURCE_ID_MAX = 128;
export const CONTACT_EMAIL_MAX_CHARS = 254;
export const CONTACT_PHONE_MAX_CHARS = 20;
export const SOURCE_ID_RE = /^[A-Za-z0-9_-]{8,128}$/;

export const CONTACT_IDENTIFIER_KINDS = ['phone', 'email'] as const;
export type ContactIdentifierKind = (typeof CONTACT_IDENTIFIER_KINDS)[number];

export type ContactIdentifierInput = {
  kind: ContactIdentifierKind;
  value: string;
};

export const CONTACTS_HMAC_CALLABLE_NAMES = {
  enableContactsSync: 'enableContactsSync',
  disableContactsSync: 'disableContactsSync',
  removeContactSource: 'removeContactSource',
  syncContactHashes: 'syncContactHashes',
  refreshVerifiedActorKeys: 'refreshVerifiedActorKeys',
} as const;

export type ContactsHmacCallableName =
  (typeof CONTACTS_HMAC_CALLABLE_NAMES)[keyof typeof CONTACTS_HMAC_CALLABLE_NAMES];

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
  'expectedEpoch',
] as const;

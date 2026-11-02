import {
  BANNED_CONTACTS_WIRE_FIELDS,
  CONTACT_E164_RE,
  CONTACT_EMAIL_MAX_CHARS,
  CONTACT_EMAIL_RE,
  CONTACT_HASH_CAP,
  CONTACT_PHONE_MAX_CHARS,
  CONTACTS_HMAC_FAIL_REASONS,
  DISABLE_CONTACTS_SYNC,
  ENABLE_CONTACTS_SYNC,
  REFRESH_VERIFIED_ACTOR_KEYS,
  REMOVE_CONTACT_SOURCE,
  SOURCE_ID_RE,
  SYNC_CONTACT_HASHES,
  type ContactIdentifierInput,
  type ContactsHmacFailReason,
  type ContactsWireResult,
  type DisableContactsSyncRequest,
  type RemoveContactSourceRequest,
  type SyncContactHashesRequest,
} from './contactsHmacContract.ts';

export type ContactsHmacFunctionsPort = {
  region: string;
  call: (name: string, data?: unknown) => Promise<unknown>;
};

export class ContactsHmacError extends Error {
  readonly reason: ContactsHmacFailReason | 'generic' | 'APP_CHECK_NOT_READY';

  constructor(
    reason: ContactsHmacFailReason | 'generic' | 'APP_CHECK_NOT_READY',
    message: string,
  ) {
    super(message);
    this.name = 'ContactsHmacError';
    this.reason = reason;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function rejectBanned(rec: Record<string, unknown>): void {
  for (const key of BANNED_CONTACTS_WIRE_FIELDS) {
    if (key in rec) {
      throw new ContactsHmacError(
        'contacts-client-hash-rejected',
        `Client-computed hashes are not accepted. (contacts-client-hash-rejected)`,
      );
    }
  }
}

export function assertSourceId(raw: unknown): string {
  if (typeof raw !== 'string' || !SOURCE_ID_RE.test(raw)) {
    throw new ContactsHmacError(
      'contacts-identifier-invalid',
      'One or more contact identifiers are invalid. (contacts-identifier-invalid)',
    );
  }
  return raw;
}

export function assertSnapshotVersion(raw: unknown): number {
  if (
    typeof raw !== 'number' ||
    !Number.isInteger(raw) ||
    raw < 1 ||
    raw > Number.MAX_SAFE_INTEGER
  ) {
    throw new ContactsHmacError(
      'contacts-identifier-invalid',
      'One or more contact identifiers are invalid. (contacts-identifier-invalid)',
    );
  }
  return raw;
}

export function assertContactsEpoch(raw: unknown): number {
  if (
    typeof raw !== 'number' ||
    !Number.isInteger(raw) ||
    raw < 0 ||
    raw > Number.MAX_SAFE_INTEGER
  ) {
    throw new ContactsHmacError(
      'contacts-identifier-invalid',
      'One or more contact identifiers are invalid. (contacts-identifier-invalid)',
    );
  }
  return raw;
}

export function normalizeClientEmail(raw: string): string | null {
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

/** Conservative E.164 filter. Identity still validates with libphonenumber. */
export function normalizeClientPhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('+') || trimmed.length > CONTACT_PHONE_MAX_CHARS) {
    return null;
  }
  if (/[A-Za-z]/.test(trimmed)) return null;
  if (!CONTACT_E164_RE.test(trimmed)) return null;
  return trimmed;
}

export type RawContactRecord = {
  emails?: Array<{ email?: string | null } | null> | null;
  phoneNumbers?: Array<{ number?: string | null } | null> | null;
};

export type CollectIdentifiersResult =
  | { ok: true; identifiers: ContactIdentifierInput[] }
  | { ok: false; reason: 'contacts-identifier-cap' };

function identifierKey(row: ContactIdentifierInput): string {
  return `${row.kind}:${row.value}`;
}

export function collectContactIdentifiers(
  records: readonly RawContactRecord[],
): CollectIdentifiersResult {
  const seen = new Set<string>();
  const identifiers: ContactIdentifierInput[] = [];
  for (const record of records) {
    for (const row of record.emails ?? []) {
      const email = normalizeClientEmail(row?.email ?? '');
      if (!email) continue;
      const item: ContactIdentifierInput = { kind: 'email', value: email };
      const key = identifierKey(item);
      if (seen.has(key)) continue;
      seen.add(key);
      identifiers.push(item);
    }
    for (const row of record.phoneNumbers ?? []) {
      const phone = normalizeClientPhone(row?.number ?? '');
      if (!phone) continue;
      const item: ContactIdentifierInput = { kind: 'phone', value: phone };
      const key = identifierKey(item);
      if (seen.has(key)) continue;
      seen.add(key);
      identifiers.push(item);
    }
  }
  if (identifiers.length > CONTACT_HASH_CAP) {
    return { ok: false, reason: 'contacts-identifier-cap' };
  }
  return { ok: true, identifiers };
}

export function identifiersFingerprint(
  identifiers: readonly ContactIdentifierInput[],
): string {
  return identifiers
    .map((row) => `${row.kind}:${row.value}`)
    .sort()
    .join('\n');
}

/**
 * Same snapshotVersion + same normalized set is Identity-idempotent.
 * Book change increments. Missing/removed source starts at 1.
 */
export function snapshotVersionForUpload(input: {
  lastAckedVersion: number | null;
  lastAckedFingerprint: string | null;
  nextFingerprint: string;
}): number {
  if (input.lastAckedVersion == null || input.lastAckedVersion < 1) return 1;
  if (input.lastAckedFingerprint === input.nextFingerprint) {
    return input.lastAckedVersion;
  }
  return input.lastAckedVersion + 1;
}

export function buildEnableRequest(): Record<string, never> {
  return {};
}

export function buildRefreshRequest(): Record<string, never> {
  return {};
}

export function buildSyncRequest(
  input: SyncContactHashesRequest,
): SyncContactHashesRequest {
  const rec = input as unknown as Record<string, unknown>;
  rejectBanned(rec);
  if ('expectedEpoch' in rec) {
    throw new ContactsHmacError(
      'contacts-identifier-invalid',
      'One or more contact identifiers are invalid. (contacts-identifier-invalid)',
    );
  }
  return {
    sourceId: assertSourceId(input.sourceId),
    snapshotVersion: assertSnapshotVersion(input.snapshotVersion),
    contactsEpoch: assertContactsEpoch(input.contactsEpoch),
    identifiers: input.identifiers,
  };
}

export function buildDisableRequest(
  contactsEpoch: number,
): DisableContactsSyncRequest {
  return { contactsEpoch: assertContactsEpoch(contactsEpoch) };
}

export function buildRemoveSourceRequest(
  sourceId: string,
  contactsEpoch: number,
): RemoveContactSourceRequest {
  return {
    sourceId: assertSourceId(sourceId),
    contactsEpoch: assertContactsEpoch(contactsEpoch),
  };
}

export function parseContactsWireResult(raw: unknown): ContactsWireResult {
  if (!isRecord(raw)) {
    throw new ContactsHmacError('generic', 'Invalid Contacts response.');
  }
  rejectBanned(raw);
  if ('expectedEpoch' in raw) {
    throw new ContactsHmacError('generic', 'Invalid Contacts response.');
  }
  if (typeof raw.result !== 'string' || !raw.result) {
    throw new ContactsHmacError('generic', 'Invalid Contacts response.');
  }
  if (typeof raw.contactsSyncEnabled !== 'boolean') {
    throw new ContactsHmacError('generic', 'Invalid Contacts response.');
  }
  if (typeof raw.notifyNearbyContactsEffective !== 'boolean') {
    throw new ContactsHmacError('generic', 'Invalid Contacts response.');
  }
  if (typeof raw.syncCommitted !== 'boolean') {
    throw new ContactsHmacError('generic', 'Invalid Contacts response.');
  }
  if (typeof raw.reevaluateRequired !== 'boolean') {
    throw new ContactsHmacError('generic', 'Invalid Contacts response.');
  }
  const contactsEpoch = assertContactsEpoch(raw.contactsEpoch);
  const out: ContactsWireResult = {
    result: raw.result,
    contactsSyncEnabled: raw.contactsSyncEnabled,
    contactsEpoch,
    notifyNearbyContactsEffective: raw.notifyNearbyContactsEffective,
    syncCommitted: raw.syncCommitted,
    reevaluateRequired: raw.reevaluateRequired,
  };
  if (typeof raw.sourceId === 'string') out.sourceId = assertSourceId(raw.sourceId);
  if (raw.snapshotVersion !== undefined) {
    out.snapshotVersion = assertSnapshotVersion(raw.snapshotVersion);
  }
  if (raw.identifierCount !== undefined) {
    if (
      typeof raw.identifierCount !== 'number' ||
      !Number.isInteger(raw.identifierCount) ||
      raw.identifierCount < 0
    ) {
      throw new ContactsHmacError('generic', 'Invalid Contacts response.');
    }
    out.identifierCount = raw.identifierCount;
  }
  if (raw.keyCount !== undefined) {
    if (
      typeof raw.keyCount !== 'number' ||
      !Number.isInteger(raw.keyCount) ||
      raw.keyCount < 0
    ) {
      throw new ContactsHmacError('generic', 'Invalid Contacts response.');
    }
    out.keyCount = raw.keyCount;
  }
  return out;
}

/** Identity write stays even if Functions reevaluate fails. */
export function shouldScheduleReevaluate(result: ContactsWireResult): boolean {
  return result.syncCommitted === true && result.reevaluateRequired === true;
}

export function contactsEpochFromUserDoc(value: unknown): number {
  if (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= Number.MAX_SAFE_INTEGER
  ) {
    return value;
  }
  return 0;
}

export function mapContactsCallableError(err: unknown): ContactsHmacError {
  if (err instanceof ContactsHmacError) return err;
  const e = err as { code?: unknown; message?: unknown; details?: unknown };
  const httpsCode = typeof e.code === 'string' ? e.code : '';
  const message = typeof e.message === 'string' ? e.message : '';
  const details = e.details;
  let backend = '';
  if (typeof details === 'string') backend = details;
  else if (isRecord(details) && typeof details.reason === 'string') {
    backend = details.reason;
  } else if (isRecord(details) && typeof details.code === 'string') {
    backend = details.code;
  }
  const haystack = `${httpsCode} ${message} ${backend}`;
  for (const reason of CONTACTS_HMAC_FAIL_REASONS) {
    if (haystack.includes(reason)) {
      return new ContactsHmacError(
        reason,
        message || `${reason}`,
      );
    }
  }
  if (/unauthenticated/i.test(haystack)) {
    return new ContactsHmacError(
      'contacts-unauthenticated',
      message || 'Authentication is required. (contacts-unauthenticated)',
    );
  }
  if (/resource-exhausted|rate.?limit/i.test(haystack)) {
    return new ContactsHmacError(
      'contacts-rate-limited',
      message || 'Too many Contacts requests. Try again later. (contacts-rate-limited)',
    );
  }
  return new ContactsHmacError(
    'generic',
    message || 'Contacts request failed.',
  );
}

export async function enableContactsSync(
  functions: ContactsHmacFunctionsPort,
): Promise<ContactsWireResult> {
  try {
    return parseContactsWireResult(
      await functions.call(ENABLE_CONTACTS_SYNC, buildEnableRequest()),
    );
  } catch (err) {
    throw mapContactsCallableError(err);
  }
}

export async function syncContactHashes(
  functions: ContactsHmacFunctionsPort,
  input: SyncContactHashesRequest,
): Promise<ContactsWireResult> {
  try {
    return parseContactsWireResult(
      await functions.call(SYNC_CONTACT_HASHES, buildSyncRequest(input)),
    );
  } catch (err) {
    throw mapContactsCallableError(err);
  }
}

export async function disableContactsSync(
  functions: ContactsHmacFunctionsPort,
  contactsEpoch: number,
): Promise<ContactsWireResult> {
  try {
    return parseContactsWireResult(
      await functions.call(
        DISABLE_CONTACTS_SYNC,
        buildDisableRequest(contactsEpoch),
      ),
    );
  } catch (err) {
    throw mapContactsCallableError(err);
  }
}

export async function removeContactSource(
  functions: ContactsHmacFunctionsPort,
  input: RemoveContactSourceRequest,
): Promise<ContactsWireResult> {
  try {
    return parseContactsWireResult(
      await functions.call(
        REMOVE_CONTACT_SOURCE,
        buildRemoveSourceRequest(input.sourceId, input.contactsEpoch),
      ),
    );
  } catch (err) {
    throw mapContactsCallableError(err);
  }
}

export async function refreshVerifiedActorKeys(
  functions: ContactsHmacFunctionsPort,
): Promise<ContactsWireResult> {
  try {
    return parseContactsWireResult(
      await functions.call(REFRESH_VERIFIED_ACTOR_KEYS, buildRefreshRequest()),
    );
  } catch (err) {
    throw mapContactsCallableError(err);
  }
}

export function contactsHmacErrorToI18nKey(
  reason: ContactsHmacError['reason'],
): string {
  switch (reason) {
    case 'contacts-unauthenticated':
    case 'contacts-account-gone':
      return 'auth';
    case 'contacts-not-enabled':
      return 'notEnabled';
    case 'contacts-epoch-mismatch':
      return 'epochMismatch';
    case 'contacts-snapshot-stale':
      return 'snapshotStale';
    case 'contacts-snapshot-conflict':
      return 'snapshotConflict';
    case 'contacts-source-cap':
      return 'sourceCap';
    case 'contacts-identifier-cap':
    case 'contacts-union-cap':
      return 'cap';
    case 'contacts-identifier-invalid':
      return 'identifierInvalid';
    case 'contacts-client-hash-rejected':
      return 'hashRejected';
    case 'contacts-hmac-unavailable':
    case 'APP_CHECK_NOT_READY':
      return 'unavailable';
    case 'contacts-rate-limited':
      return 'rateLimited';
    default:
      return 'generic';
  }
}

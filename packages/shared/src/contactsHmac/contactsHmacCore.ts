import {
  BANNED_CONTACTS_WIRE_FIELDS,
  CONTACT_HASH_CAP,
  CONTACT_IDENTIFIER_CLIENT_MAX,
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
import {
  emptyIdentifierStats,
  isWireValidIdentifier,
  normalizeContactEmail,
  normalizeContactPhone,
  type IdentifierStats,
} from './contactsIdentifierNormalize.ts';
import type {
  ContactsLocalState,
  ContactsPermissionStatus,
} from './contactsSyncFlow.ts';

export type ContactsHmacFunctionsPort = {
  region: string;
  call: (name: string, data?: unknown) => Promise<unknown>;
};

/**
 * Client-only reasons, never sent by Identity:
 * - `contacts-transport-uncertain`: UI timeout or transport failure. The server
 *   may still have committed, so this is never a definitive failure.
 * - `contacts-result-unknown`: INTERNAL/UNKNOWN with no `details.reason`, or a
 *   reply that cannot be read. Identity before #25 answers an Auth lookup failure
 *   this way. Its cause cannot be told from here, so none is assumed.
 */
export type ContactsClientFailReason =
  | 'contacts-transport-uncertain'
  | 'contacts-result-unknown';

export type ContactsErrorReason =
  | ContactsHmacFailReason
  | ContactsClientFailReason
  | 'generic'
  | 'APP_CHECK_NOT_READY';

export class ContactsHmacError extends Error {
  readonly reason: ContactsErrorReason;

  constructor(reason: ContactsErrorReason, message: string) {
    super(message);
    this.name = 'ContactsHmacError';
    this.reason = reason;
  }
}

/** A flow failed part-way: `state` is what the caller must keep from now on. */
export class ContactsFlowStateError extends ContactsHmacError {
  readonly state: ContactsLocalState;
  readonly permission: ContactsPermissionStatus | null;
  readonly scheduleReevaluate: boolean;

  constructor(
    cause: ContactsHmacError,
    state: ContactsLocalState,
    extra?: {
      permission?: ContactsPermissionStatus | null;
      scheduleReevaluate?: boolean;
    },
  ) {
    super(cause.reason, cause.message);
    this.name = 'ContactsFlowStateError';
    this.state = state;
    this.permission = extra?.permission ?? null;
    this.scheduleReevaluate = extra?.scheduleReevaluate ?? false;
  }
}

/**
 * Identity confirmed enable; a later stage (permission, read, sync, remove)
 * failed. The integration stays enabled with `enableResult.contactsEpoch`.
 */
export class ContactsSyncAfterEnableError extends ContactsFlowStateError {
  readonly enableResult: ContactsWireResult;
  readonly stateAfterEnable: ContactsLocalState;

  constructor(
    cause: ContactsHmacError,
    enableResult: ContactsWireResult,
    stateAfterEnable: ContactsLocalState,
    extra?: {
      permission?: ContactsPermissionStatus | null;
      scheduleReevaluate?: boolean;
    },
  ) {
    super(cause, stateAfterEnable, extra);
    this.name = 'ContactsSyncAfterEnableError';
    this.enableResult = enableResult;
    this.stateAfterEnable = stateAfterEnable;
  }
}

/** The server may have written despite the error: keep pending, never revert. */
export function isContactsOutcomeUncertain(
  reason: ContactsErrorReason,
): boolean {
  return (
    reason === 'contacts-transport-uncertain' ||
    reason === 'contacts-result-unknown'
  );
}

/**
 * The only proof that a snapshot is stored: syncCommitted with a sync result,
 * for the source and version that were actually sent.
 */
export function isConfirmedSnapshotResult(
  result: ContactsWireResult,
  sent: { sourceId: string; snapshotVersion: number },
): boolean {
  if (result.syncCommitted !== true) return false;
  if (result.result !== 'synced' && result.result !== 'idempotent') return false;
  if (result.sourceId !== undefined && result.sourceId !== sent.sourceId) {
    return false;
  }
  if (
    result.snapshotVersion !== undefined &&
    result.snapshotVersion !== sent.snapshotVersion
  ) {
    return false;
  }
  return true;
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

/** Identity's email rule; null when Identity would reject it. */
export function normalizeClientEmail(raw: string): string | null {
  return normalizeContactEmail(raw);
}

/**
 * Identity's phone rule (libphonenumber, valid for its country), in E.164.
 * National numbers need a reliable region; without one they are left out.
 */
export function normalizeClientPhone(
  raw: string,
  reliableRegion?: string | null,
): string | null {
  const phone = normalizeContactPhone(raw, reliableRegion);
  return phone.ok ? phone.value : null;
}

export type RawContactRecord = {
  emails?: Array<{ email?: string | null } | null> | null;
  phoneNumbers?: Array<{ number?: string | null } | null> | null;
};

export type CollectIdentifiersResult =
  | { ok: true; identifiers: ContactIdentifierInput[]; stats: IdentifierStats }
  | { ok: false; reason: 'contacts-identifier-cap'; stats: IdentifierStats }
  /**
   * The book has identifiers but none can be sent. That is not an empty book:
   * uploading nothing would erase the previous snapshot.
   */
  | { ok: false; reason: 'contacts-identifier-invalid'; stats: IdentifierStats };

function identifierKey(row: ContactIdentifierInput): string {
  return `${row.kind}:${row.value}`;
}

/**
 * Normalizes every identifier on its own: one that cannot be sent is left out
 * without taking the valid ones of the same contact with it. Duplicates are
 * removed after normalization, so two spellings of one number count once.
 */
export function collectContactIdentifiers(
  records: readonly RawContactRecord[],
  options: { reliableRegion?: string | null; identifierCap?: number } = {},
): CollectIdentifiersResult {
  // Over the limit nothing is sent: never a truncated or split snapshot.
  const cap = effectiveIdentifierCap(options.identifierCap);
  const stats = emptyIdentifierStats();
  const seen = new Set<string>();
  const identifiers: ContactIdentifierInput[] = [];
  const keep = (item: ContactIdentifierInput) => {
    const key = identifierKey(item);
    if (seen.has(key)) {
      stats.duplicates += 1;
      return;
    }
    seen.add(key);
    identifiers.push(item);
    if (item.kind === 'email') stats.emailsKept += 1;
    else stats.phonesKept += 1;
  };
  for (const record of records) {
    for (const row of record.emails ?? []) {
      const raw = typeof row?.email === 'string' ? row.email : '';
      if (!raw.trim()) continue;
      stats.emailsSeen += 1;
      const email = normalizeContactEmail(raw);
      if (!email) {
        stats.emailsInvalid += 1;
        continue;
      }
      keep({ kind: 'email', value: email });
    }
    for (const row of record.phoneNumbers ?? []) {
      const raw = typeof row?.number === 'string' ? row.number : '';
      if (!raw.trim()) continue;
      stats.phonesSeen += 1;
      const phone = normalizeContactPhone(raw, options.reliableRegion);
      if ('reason' in phone) {
        if (phone.reason === 'no_region') stats.phonesNoRegion += 1;
        else if (phone.reason === 'extension') stats.phonesExtension += 1;
        else stats.phonesInvalid += 1;
        continue;
      }
      keep({ kind: 'phone', value: phone.value });
    }
  }
  if (identifiers.length > cap) {
    return { ok: false, reason: 'contacts-identifier-cap', stats };
  }
  if (identifiers.length === 0 && stats.emailsSeen + stats.phonesSeen > 0) {
    return { ok: false, reason: 'contacts-identifier-invalid', stats };
  }
  return { ok: true, identifiers, stats };
}

/** Local ack digest only — never persist or log raw phones/emails. */
function stableDigestHex(input: string): string {
  let h1 = 0x811c9dc5 >>> 0;
  let h2 = 0x811c9dc5 >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    h1 ^= code;
    h1 = Math.imul(h1, 16777619) >>> 0;
    h2 ^= code + i + 1;
    h2 = Math.imul(h2, 16777619) >>> 0;
  }
  return `${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}

export function identifiersFingerprint(
  identifiers: readonly ContactIdentifierInput[],
): string {
  const material = identifiers
    .map((row) => `${row.kind}:${row.value}`)
    .sort()
    .join('\n');
  return `fp1:${stableDigestHex(material)}`;
}

/**
 * Same snapshotVersion + same normalized set is Identity-idempotent; the same
 * version with different content is a conflict. So a version is reused only for
 * the fingerprint it was last attempted with, and never below a higher attempt
 * whose outcome is unknown.
 * After removeContactSource, Identity fences `snapshotVersion <= removed`.
 * `removedSnapshotFloor` keeps the next recreate strictly greater.
 * Disable clears fences server-side and the floor client-side.
 */
export function snapshotVersionForUpload(input: {
  lastAckedVersion: number | null;
  lastAckedFingerprint: string | null;
  nextFingerprint: string;
  removedSnapshotFloor?: number | null;
  pendingUpload?: { version: number; fingerprint: string } | null;
  highestAttemptedVersion?: number | null;
}): number {
  const positive = (n: number | null | undefined) =>
    typeof n === 'number' && n >= 1 ? n : 0;
  const floor = positive(input.removedSnapshotFloor);
  const acked = positive(input.lastAckedVersion);
  const highest = positive(input.highestAttemptedVersion);
  const pending = input.pendingUpload;
  if (
    pending &&
    pending.fingerprint === input.nextFingerprint &&
    pending.version > floor &&
    pending.version >= highest &&
    pending.version >= acked
  ) {
    return pending.version;
  }
  if (
    !pending &&
    acked >= 1 &&
    input.lastAckedFingerprint === input.nextFingerprint &&
    acked > floor &&
    acked >= highest
  ) {
    return acked;
  }
  return Math.max(acked, floor, highest, positive(pending?.version)) + 1;
}

/** Floor after a successful remove / absent fence for this sourceId. */
export function removedSnapshotFloorAfterRemove(input: {
  previousFloor: number | null;
  removedSnapshotVersion: number | null | undefined;
  lastAckedVersion: number | null;
}): number | null {
  const candidates = [
    input.previousFloor,
    input.removedSnapshotVersion,
    input.lastAckedVersion,
  ].filter(
    (n): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 1,
  );
  if (candidates.length === 0) return null;
  return Math.max(...candidates);
}

export function buildEnableRequest(contactsEpoch: number): {
  contactsEpoch: number;
} {
  return { contactsEpoch: assertContactsEpoch(contactsEpoch) };
}

export function buildRefreshRequest(): Record<string, never> {
  return {};
}

/**
 * Identity rejects the whole request for one bad row: never send one. Duplicates
 * count toward Identity's limit, so the list must already be unique.
 */
export function assertWireIdentifiers(raw: unknown): ContactIdentifierInput[] {
  if (
    !Array.isArray(raw) ||
    !raw.every((row) => isWireValidIdentifier(row)) ||
    new Set(raw.map((row: ContactIdentifierInput) => identifierKey(row))).size !== raw.length
  ) {
    throw new ContactsHmacError(
      'contacts-identifier-invalid',
      'One or more contact identifiers are invalid. (contacts-identifier-invalid)',
    );
  }
  if (raw.length > CONTACT_IDENTIFIER_CLIENT_MAX) {
    throw new ContactsHmacError(
      'contacts-identifier-cap',
      'Too many identifiers in this snapshot. (contacts-identifier-cap)',
    );
  }
  return raw.map((row: ContactIdentifierInput) => ({ kind: row.kind, value: row.value }));
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
    identifiers: assertWireIdentifiers(input.identifiers),
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
  knownSnapshotVersion?: number,
): RemoveContactSourceRequest {
  const request: RemoveContactSourceRequest = {
    sourceId: assertSourceId(sourceId),
    contactsEpoch: assertContactsEpoch(contactsEpoch),
  };
  if (knownSnapshotVersion !== undefined) {
    request.knownSnapshotVersion = assertContactsEpoch(knownSnapshotVersion);
  }
  return request;
}

export function parseContactsWireResult(raw: unknown): ContactsWireResult {
  if (!isRecord(raw)) {
    throw new ContactsHmacError('contacts-result-unknown', 'Invalid Contacts response.');
  }
  rejectBanned(raw);
  if ('expectedEpoch' in raw) {
    throw new ContactsHmacError('contacts-result-unknown', 'Invalid Contacts response.');
  }
  if (typeof raw.result !== 'string' || !raw.result) {
    throw new ContactsHmacError('contacts-result-unknown', 'Invalid Contacts response.');
  }
  if (typeof raw.contactsSyncEnabled !== 'boolean') {
    throw new ContactsHmacError('contacts-result-unknown', 'Invalid Contacts response.');
  }
  if (typeof raw.notifyNearbyContactsEffective !== 'boolean') {
    throw new ContactsHmacError('contacts-result-unknown', 'Invalid Contacts response.');
  }
  if (typeof raw.syncCommitted !== 'boolean') {
    throw new ContactsHmacError('contacts-result-unknown', 'Invalid Contacts response.');
  }
  if (typeof raw.reevaluateRequired !== 'boolean') {
    throw new ContactsHmacError('contacts-result-unknown', 'Invalid Contacts response.');
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
      throw new ContactsHmacError('contacts-result-unknown', 'Invalid Contacts response.');
    }
    out.identifierCount = raw.identifierCount;
  }
  if (raw.keyCount !== undefined) {
    if (
      typeof raw.keyCount !== 'number' ||
      !Number.isInteger(raw.keyCount) ||
      raw.keyCount < 0
    ) {
      throw new ContactsHmacError('contacts-result-unknown', 'Invalid Contacts response.');
    }
    out.keyCount = raw.keyCount;
  }
  // Additive: an invalid value is ignored (as if absent), never a failed reply.
  const cap = raw.identifierCap;
  if (typeof cap === 'number' && Number.isSafeInteger(cap) && cap >= 1) {
    out.identifierCap = cap;
  }
  return out;
}

/**
 * Identifiers one snapshot may hold: what Identity announced, never above what
 * this client supports; 500 when the server does not announce it.
 */
export function effectiveIdentifierCap(announced: number | null | undefined): number {
  if (typeof announced !== 'number' || !Number.isSafeInteger(announced) || announced < 1) {
    return CONTACT_HASH_CAP;
  }
  return Math.min(announced, CONTACT_IDENTIFIER_CLIENT_MAX);
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
  // App Check rejections may surface as `unauthenticated`: not a signed-out user.
  if (/app.?check/i.test(haystack)) {
    return new ContactsHmacError(
      'APP_CHECK_NOT_READY',
      message || 'App Check is not ready.',
    );
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
  // Checked by code before any message text: the cause of these is not knowable.
  if (
    /(^|\/)(internal|unknown)$/i.test(httpsCode) ||
    /^internal$/i.test(message.trim())
  ) {
    return new ContactsHmacError(
      'contacts-result-unknown',
      message || 'Contacts could not confirm the result. (contacts-result-unknown)',
    );
  }
  // Timeout / transport: the server may have committed, and the secret is not
  // the problem. `contacts-hmac-unavailable` is only the explicit Identity reason.
  if (/deadline-exceeded|timeout|unavailable|cancelled|network/i.test(haystack)) {
    return new ContactsHmacError(
      'contacts-transport-uncertain',
      message ||
        'Contacts could not confirm the result. (contacts-transport-uncertain)',
    );
  }
  // permission-denied / other stay generic: never "missing HMAC secret".
  return new ContactsHmacError(
    'generic',
    message || 'Contacts request failed.',
  );
}

export async function enableContactsSync(
  functions: ContactsHmacFunctionsPort,
  contactsEpoch: number,
): Promise<ContactsWireResult> {
  try {
    return parseContactsWireResult(
      await functions.call(ENABLE_CONTACTS_SYNC, buildEnableRequest(contactsEpoch)),
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
        buildRemoveSourceRequest(
          input.sourceId,
          input.contactsEpoch,
          input.knownSnapshotVersion,
        ),
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

export type ContactsErrorI18nKey =
  | 'auth'
  | 'authLookup'
  | 'notEnabled'
  | 'epochMismatch'
  | 'epochRequired'
  | 'snapshotStale'
  | 'sourceRemoved'
  | 'snapshotConflict'
  | 'sourceCap'
  | 'identifierCap'
  | 'unionCap'
  | 'identifierInvalid'
  | 'hashRejected'
  | 'unavailable'
  | 'transportUncertain'
  | 'resultUnknown'
  | 'appCheck'
  | 'rateLimited'
  | 'generic';

export function contactsHmacErrorToI18nKey(
  reason: ContactsHmacError['reason'],
): ContactsErrorI18nKey {
  switch (reason) {
    case 'contacts-unauthenticated':
    case 'contacts-account-gone':
      return 'auth';
    case 'contacts-auth-lookup-failed':
      return 'authLookup';
    case 'contacts-not-enabled':
      return 'notEnabled';
    case 'contacts-epoch-mismatch':
      return 'epochMismatch';
    case 'contacts-epoch-required':
      return 'epochRequired';
    case 'contacts-snapshot-stale':
      return 'snapshotStale';
    case 'contacts-source-removed':
      return 'sourceRemoved';
    case 'contacts-snapshot-conflict':
      return 'snapshotConflict';
    case 'contacts-source-cap':
      return 'sourceCap';
    case 'contacts-identifier-cap':
      return 'identifierCap';
    case 'contacts-union-cap':
      return 'unionCap';
    case 'contacts-identifier-invalid':
      return 'identifierInvalid';
    case 'contacts-client-hash-rejected':
      return 'hashRejected';
    case 'contacts-hmac-unavailable':
      return 'unavailable';
    case 'contacts-transport-uncertain':
      return 'transportUncertain';
    case 'contacts-result-unknown':
      return 'resultUnknown';
    case 'APP_CHECK_NOT_READY':
      return 'appCheck';
    case 'contacts-rate-limited':
      return 'rateLimited';
    default:
      return 'generic';
  }
}

/** Caps and fence errors are hard fails — never present as success. */
export function isContactsHardCapOrFenceError(
  reason: ContactsHmacError['reason'],
): boolean {
  return (
    reason === 'contacts-identifier-cap' ||
    reason === 'contacts-union-cap' ||
    reason === 'contacts-source-cap' ||
    reason === 'contacts-source-removed' ||
    reason === 'contacts-snapshot-stale' ||
    reason === 'contacts-snapshot-conflict'
  );
}

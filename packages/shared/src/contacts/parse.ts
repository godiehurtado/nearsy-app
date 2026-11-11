/**
 * Identity Contacts HMAC request builders + response parse.
 * Field is contactsEpoch. Never the previous Functions epoch field. Never client hashes.
 */

import { parseIdentifierCap } from './identifierCap';
import {
  BANNED_CONTACTS_WIRE_FIELDS,
  CONTACT_IDENTIFIER_KINDS,
  SOURCE_ID_RE,
  type ContactIdentifierInput,
} from './domain';
import { ContactsHmacClientError } from './errors';
import type {
  ContactsWireResult,
  DisableContactsSyncRequest,
  EnableContactsSyncRequest,
  RefreshVerifiedActorKeysRequest,
  RemoveContactSourceRequest,
  SyncContactHashesRequest,
} from './wireTypes';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertNoBannedFields(rec: Record<string, unknown>, path: string): void {
  for (const key of BANNED_CONTACTS_WIRE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(rec, key)) {
      throw new ContactsHmacClientError(
        'contacts-client-hash-rejected',
        `Forbidden Contacts field "${key}" at ${path}`,
      );
    }
  }
}

function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw new ContactsHmacClientError(
      'contacts-invalid-response',
      `Invalid boolean for ${field}`,
    );
  }
  return value;
}

function requireEpoch(value: unknown, field: string): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > Number.MAX_SAFE_INTEGER
  ) {
    throw new ContactsHmacClientError(
      'contacts-invalid-response',
      `Invalid ${field}`,
    );
  }
  return value;
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ContactsHmacClientError(
      'contacts-invalid-response',
      `Invalid ${field}`,
    );
  }
  return value;
}

function optionalInteger(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined;
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > Number.MAX_SAFE_INTEGER
  ) {
    throw new ContactsHmacClientError(
      'contacts-invalid-response',
      `Invalid ${field}`,
    );
  }
  return value;
}

export function buildEnableContactsSyncRequest(
  contactsEpoch: number,
): EnableContactsSyncRequest {
  return { contactsEpoch };
}

export function buildRefreshVerifiedActorKeysRequest(): RefreshVerifiedActorKeysRequest {
  return {};
}

export function buildDisableContactsSyncRequest(
  contactsEpoch: number,
): DisableContactsSyncRequest {
  return { contactsEpoch };
}

export function buildRemoveContactSourceRequest(input: {
  sourceId: string;
  contactsEpoch: number;
  knownSnapshotVersion: number;
}): RemoveContactSourceRequest {
  return {
    sourceId: input.sourceId,
    contactsEpoch: input.contactsEpoch,
    knownSnapshotVersion: input.knownSnapshotVersion,
  };
}

export function buildSyncContactHashesRequest(input: {
  sourceId: string;
  snapshotVersion: number;
  contactsEpoch: number;
  identifiers: ContactIdentifierInput[];
}): SyncContactHashesRequest {
  return {
    sourceId: input.sourceId,
    snapshotVersion: input.snapshotVersion,
    contactsEpoch: input.contactsEpoch,
    identifiers: input.identifiers.map((row) => ({
      kind: row.kind,
      value: row.value,
    })),
  };
}

export function assertSyncRequestShape(request: SyncContactHashesRequest): void {
  const rec = request as unknown as Record<string, unknown>;
  assertNoBannedFields(rec, 'syncContactHashes');
  if (!SOURCE_ID_RE.test(request.sourceId)) {
    throw new ContactsHmacClientError(
      'contacts-identifier-invalid',
      'Invalid sourceId',
    );
  }
  if (
    !Number.isInteger(request.snapshotVersion) ||
    request.snapshotVersion < 1
  ) {
    throw new ContactsHmacClientError(
      'contacts-identifier-invalid',
      'Invalid snapshotVersion',
    );
  }
  if (!Number.isInteger(request.contactsEpoch) || request.contactsEpoch < 0) {
    throw new ContactsHmacClientError(
      'contacts-identifier-invalid',
      'Invalid contactsEpoch',
    );
  }
  if (!Array.isArray(request.identifiers)) {
    throw new ContactsHmacClientError(
      'contacts-identifier-invalid',
      'identifiers must be an array',
    );
  }
  for (const row of request.identifiers) {
    if (!CONTACT_IDENTIFIER_KINDS.includes(row.kind)) {
      throw new ContactsHmacClientError(
        'contacts-identifier-invalid',
        'Invalid identifier kind',
      );
    }
  }
}

export function parseContactsWireResult(data: unknown): ContactsWireResult {
  if (!isPlainObject(data)) {
    throw new ContactsHmacClientError(
      'contacts-invalid-response',
      'Contacts response must be an object',
    );
  }
  assertNoBannedFields(data, 'ContactsWireResult');
  const result: ContactsWireResult = {
    result: requireNonEmptyString(data.result, 'result'),
    contactsSyncEnabled: requireBoolean(
      data.contactsSyncEnabled,
      'contactsSyncEnabled',
    ),
    contactsEpoch: requireEpoch(data.contactsEpoch, 'contactsEpoch'),
    notifyNearbyContactsEffective: requireBoolean(
      data.notifyNearbyContactsEffective,
      'notifyNearbyContactsEffective',
    ),
    syncCommitted: requireBoolean(data.syncCommitted, 'syncCommitted'),
    reevaluateRequired: requireBoolean(
      data.reevaluateRequired,
      'reevaluateRequired',
    ),
  };
  if (typeof data.sourceId === 'string' && data.sourceId.trim()) {
    result.sourceId = data.sourceId.trim();
  }
  const snapshotVersion = optionalInteger(data.snapshotVersion, 'snapshotVersion');
  if (snapshotVersion !== undefined) result.snapshotVersion = snapshotVersion;
  const identifierCount = optionalInteger(
    data.identifierCount,
    'identifierCount',
  );
  if (identifierCount !== undefined) result.identifierCount = identifierCount;
  const keyCount = optionalInteger(data.keyCount, 'keyCount');
  if (keyCount !== undefined) result.keyCount = keyCount;
  // Additive: an invalid value is ignored, never a failed response.
  const identifierCap = parseIdentifierCap(data.identifierCap);
  if (identifierCap !== null) result.identifierCap = identifierCap;
  return result;
}

export function shouldCallReevaluateAfterIdentity(
  result: ContactsWireResult,
): boolean {
  return result.syncCommitted === true && result.reevaluateRequired === true;
}

/** Same snapshotVersion + same normalized set → Identity result "idempotent". */
export function isIdempotentSyncResult(result: ContactsWireResult): boolean {
  return result.result === 'idempotent';
}

import type {
  ContactsLocalState,
  ContactsPendingUpload,
  ContactsUncertainOp,
} from './contactsSyncFlow.ts';
import { assertSourceId } from './contactsHmacCore.ts';

/**
 * Device-wide key from earlier builds. Its owner is unknown, so it is never read:
 * adopting it would credit that source to whichever account signs in first.
 */
export const CONTACTS_LEGACY_SOURCE_ID_KEY = 'nearsy.contacts.sourceId.v1';
export const CONTACTS_SOURCE_ID_PREFIX = 'nearsy.contacts.sourceId.v2:';
export const CONTACTS_STATE_STORAGE_PREFIX = 'nearsy.contacts.state.v1:';

export type KvStore = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem?: (key: string) => Promise<void>;
};

function randomSourceId(bytes: Uint8Array): string {
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return assertSourceId(hex);
}

export function contactsSourceIdStorageKey(uid: string): string {
  return `${CONTACTS_SOURCE_ID_PREFIX}${uid}`;
}

function validSourceIdOrNull(value: unknown): string | null {
  try {
    return assertSourceId(value);
  } catch {
    return null;
  }
}

/**
 * Per-account source. State saved under this uid proves which source it used,
 * which keeps its versions and fences; otherwise the account gets a new source.
 */
export async function loadOrCreateSourceIdForUid(
  store: KvStore,
  uid: string,
  randomBytes: () => Uint8Array | Promise<Uint8Array>,
): Promise<string> {
  const key = contactsSourceIdStorageKey(uid);
  const existing = validSourceIdOrNull(await store.getItem(key));
  if (existing) return existing;

  let owned: string | null = null;
  const rawState = await store.getItem(contactsStateStorageKey(uid));
  if (rawState) {
    try {
      owned = validSourceIdOrNull(
        (JSON.parse(rawState) as { sourceId?: unknown }).sourceId,
      );
    } catch {
      owned = null;
    }
  }
  const sourceId = owned ?? randomSourceId(await randomBytes());
  await store.setItem(key, sourceId);
  return sourceId;
}

export function contactsStateStorageKey(uid: string): string {
  return `${CONTACTS_STATE_STORAGE_PREFIX}${uid}`;
}

function asPositiveInt(value: unknown): number | null {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= Number.MAX_SAFE_INTEGER
    ? value
    : null;
}

/**
 * Persist only opaque fields. Reject legacy payloads that stored raw fingerprints
 * (pre-fp1 digests containing ':' emails/phones).
 */
function sanitizeFingerprint(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (!value.startsWith('fp1:')) return null;
  if (value.length > 80) return null;
  return value;
}

const UNCERTAIN_OPS: readonly ContactsUncertainOp[] = [
  'enable',
  'sync',
  'remove',
  'disable',
];

function emptyState(sourceId: string): ContactsLocalState {
  return {
    sourceId,
    contactsEpoch: 0,
    lastAckedVersion: null,
    lastAckedFingerprint: null,
    removedSnapshotFloor: null,
    lastAckedEpoch: null,
    pendingUpload: null,
    highestAttemptedVersion: null,
    uncertainOp: null,
    reevaluateOwed: false,
    userConsent: false,
  };
}

function asEpoch(value: unknown): number | null {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= Number.MAX_SAFE_INTEGER
    ? value
    : null;
}

function sanitizePendingUpload(value: unknown): ContactsPendingUpload | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const version = asPositiveInt(row.version);
  const fingerprint = sanitizeFingerprint(row.fingerprint);
  const epoch = asEpoch(row.epoch);
  if (version == null || fingerprint == null || epoch == null) return null;
  return { version, fingerprint, epoch };
}

export async function loadContactsLocalState(
  store: KvStore,
  uid: string,
  sourceId: string,
): Promise<ContactsLocalState> {
  const raw = await store.getItem(contactsStateStorageKey(uid));
  if (!raw) return emptyState(sourceId);
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    // Acks and fences belong to one source: never carry them to another.
    if (typeof parsed.sourceId === 'string' && parsed.sourceId !== sourceId) {
      return emptyState(sourceId);
    }
    const contactsEpoch = asEpoch(parsed.contactsEpoch) ?? 0;
    const lastAckedVersion = asPositiveInt(parsed.lastAckedVersion);
    const state: ContactsLocalState = {
      sourceId,
      contactsEpoch,
      lastAckedVersion,
      // Also drops raw identifier material if an older build stored it.
      lastAckedFingerprint: sanitizeFingerprint(parsed.lastAckedFingerprint),
      removedSnapshotFloor: asPositiveInt(parsed.removedSnapshotFloor),
      // Earlier builds only kept one epoch, so their ack belongs to it.
      lastAckedEpoch:
        asEpoch(parsed.lastAckedEpoch) ??
        (lastAckedVersion != null ? contactsEpoch : null),
      pendingUpload: sanitizePendingUpload(parsed.pendingUpload),
      highestAttemptedVersion: asPositiveInt(parsed.highestAttemptedVersion),
      uncertainOp: UNCERTAIN_OPS.includes(
        parsed.uncertainOp as ContactsUncertainOp,
      )
        ? (parsed.uncertainOp as ContactsUncertainOp)
        : null,
      reevaluateOwed: parsed.reevaluateOwed === true,
      epochStale: parsed.epochStale === true,
      userConsent: parsed.userConsent === true,
    };
    if (typeof parsed.enablementConfirmed === 'boolean') {
      state.enablementConfirmed = parsed.enablementConfirmed;
    }
    return state;
  } catch {
    return emptyState(sourceId);
  }
}

export async function persistContactsLocalState(
  store: KvStore,
  uid: string,
  state: ContactsLocalState,
): Promise<void> {
  // Explicit field list: nothing else, and never identifiers, reaches storage.
  const safe: ContactsLocalState = {
    sourceId: state.sourceId,
    contactsEpoch: state.contactsEpoch,
    lastAckedVersion: state.lastAckedVersion,
    lastAckedFingerprint: sanitizeFingerprint(state.lastAckedFingerprint),
    removedSnapshotFloor: state.removedSnapshotFloor,
    lastAckedEpoch: state.lastAckedEpoch ?? null,
    pendingUpload: sanitizePendingUpload(state.pendingUpload),
    highestAttemptedVersion: state.highestAttemptedVersion ?? null,
    uncertainOp: state.uncertainOp ?? null,
    reevaluateOwed: state.reevaluateOwed === true,
    epochStale: state.epochStale === true,
    userConsent: state.userConsent === true,
  };
  if (typeof state.enablementConfirmed === 'boolean') {
    safe.enablementConfirmed = state.enablementConfirmed;
  }
  await store.setItem(contactsStateStorageKey(uid), JSON.stringify(safe));
}

export async function clearContactsLocalAck(
  store: KvStore,
  uid: string,
  sourceId: string,
  contactsEpoch: number,
  removedSnapshotFloor: number | null = null,
): Promise<ContactsLocalState> {
  const next: ContactsLocalState = {
    sourceId,
    contactsEpoch,
    lastAckedVersion: null,
    lastAckedFingerprint: null,
    removedSnapshotFloor,
  };
  await persistContactsLocalState(store, uid, next);
  return next;
}

import type { ContactsLocalState } from './contactsSyncFlow.ts';
import { assertSourceId } from './contactsHmacCore.ts';

export const CONTACTS_SOURCE_ID_STORAGE_KEY = 'nearsy.contacts.sourceId.v1';
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

export async function loadOrCreateSourceId(
  store: KvStore,
  randomBytes: () => Uint8Array | Promise<Uint8Array>,
): Promise<string> {
  const existing = await store.getItem(CONTACTS_SOURCE_ID_STORAGE_KEY);
  if (existing) return assertSourceId(existing);
  const created = randomSourceId(await randomBytes());
  await store.setItem(CONTACTS_SOURCE_ID_STORAGE_KEY, created);
  return created;
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

export async function loadContactsLocalState(
  store: KvStore,
  uid: string,
  sourceId: string,
): Promise<ContactsLocalState> {
  const raw = await store.getItem(contactsStateStorageKey(uid));
  if (!raw) {
    return {
      sourceId,
      contactsEpoch: 0,
      lastAckedVersion: null,
      lastAckedFingerprint: null,
      removedSnapshotFloor: null,
    };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<ContactsLocalState> &
      Record<string, unknown>;
    // Never keep raw identifier material if an older build stored it.
    if (
      typeof parsed.lastAckedFingerprint === 'string' &&
      !parsed.lastAckedFingerprint.startsWith('fp1:')
    ) {
      return {
        sourceId,
        contactsEpoch:
          typeof parsed.contactsEpoch === 'number' && parsed.contactsEpoch >= 0
            ? parsed.contactsEpoch
            : 0,
        lastAckedVersion: asPositiveInt(parsed.lastAckedVersion),
        lastAckedFingerprint: null,
        removedSnapshotFloor: asPositiveInt(parsed.removedSnapshotFloor),
      };
    }
    return {
      sourceId,
      contactsEpoch:
        typeof parsed.contactsEpoch === 'number' && parsed.contactsEpoch >= 0
          ? parsed.contactsEpoch
          : 0,
      lastAckedVersion: asPositiveInt(parsed.lastAckedVersion),
      lastAckedFingerprint: sanitizeFingerprint(parsed.lastAckedFingerprint),
      removedSnapshotFloor: asPositiveInt(parsed.removedSnapshotFloor),
    };
  } catch {
    return {
      sourceId,
      contactsEpoch: 0,
      lastAckedVersion: null,
      lastAckedFingerprint: null,
      removedSnapshotFloor: null,
    };
  }
}

export async function persistContactsLocalState(
  store: KvStore,
  uid: string,
  state: ContactsLocalState,
): Promise<void> {
  const safe: ContactsLocalState = {
    sourceId: state.sourceId,
    contactsEpoch: state.contactsEpoch,
    lastAckedVersion: state.lastAckedVersion,
    lastAckedFingerprint: sanitizeFingerprint(state.lastAckedFingerprint),
    removedSnapshotFloor: state.removedSnapshotFloor,
  };
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

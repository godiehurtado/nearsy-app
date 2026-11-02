import type { ContactsLocalState } from './contactsSyncFlow.ts';
import { assertSourceId } from './contactsHmacCore.ts';

export const CONTACTS_SOURCE_ID_STORAGE_KEY = 'nearsy.contacts.sourceId.v1';
export const CONTACTS_STATE_STORAGE_PREFIX = 'nearsy.contacts.state.v1:';

export type KvStore = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
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
    };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<ContactsLocalState>;
    return {
      sourceId,
      contactsEpoch:
        typeof parsed.contactsEpoch === 'number' && parsed.contactsEpoch >= 0
          ? parsed.contactsEpoch
          : 0,
      lastAckedVersion:
        typeof parsed.lastAckedVersion === 'number' && parsed.lastAckedVersion >= 1
          ? parsed.lastAckedVersion
          : null,
      lastAckedFingerprint:
        typeof parsed.lastAckedFingerprint === 'string'
          ? parsed.lastAckedFingerprint
          : null,
    };
  } catch {
    return {
      sourceId,
      contactsEpoch: 0,
      lastAckedVersion: null,
      lastAckedFingerprint: null,
    };
  }
}

export async function persistContactsLocalState(
  store: KvStore,
  uid: string,
  state: ContactsLocalState,
): Promise<void> {
  await store.setItem(contactsStateStorageKey(uid), JSON.stringify(state));
}

export async function clearContactsLocalAck(
  store: KvStore,
  uid: string,
  sourceId: string,
  contactsEpoch: number,
): Promise<ContactsLocalState> {
  const next: ContactsLocalState = {
    sourceId,
    contactsEpoch,
    lastAckedVersion: null,
    lastAckedFingerprint: null,
  };
  await persistContactsLocalState(store, uid, next);
  return next;
}

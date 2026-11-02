/**
 * Persists Contacts sourceId / contactsEpoch / snapshotVersion / fingerprint.
 * Never stores raw phone numbers or emails.
 */

import type { ContactsSessionSnapshot, ContactsSessionStore } from './port';

const SOURCE_KEY = 'nearsy.contacts.v1.sourceId';
const EPOCH_KEY = 'nearsy.contacts.v1.contactsEpoch';
const VERSION_KEY = 'nearsy.contacts.v1.snapshotVersion';
const FINGERPRINT_KEY = 'nearsy.contacts.v1.fingerprint';

type ExpoSecureStoreLike = {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
};

let storePromise: Promise<ExpoSecureStoreLike | null> | null = null;

async function loadSecureStore(): Promise<ExpoSecureStoreLike | null> {
  try {
    const mod = (await import('expo-secure-store')) as ExpoSecureStoreLike;
    return mod;
  } catch {
    return null;
  }
}

function secureStore(): Promise<ExpoSecureStoreLike | null> {
  storePromise ??= loadSecureStore();
  return storePromise;
}

async function read(key: string): Promise<string | null> {
  const store = await secureStore();
  if (!store) return null;
  try {
    return await store.getItemAsync(key);
  } catch {
    return null;
  }
}

async function write(key: string, value: string): Promise<void> {
  const store = await secureStore();
  if (!store) return;
  await store.setItemAsync(key, value);
}

async function remove(key: string): Promise<void> {
  const store = await secureStore();
  if (!store) return;
  try {
    await store.deleteItemAsync(key);
  } catch {
    /* ignore */
  }
}

export function createContactsSessionStore(): ContactsSessionStore {
  return {
    async load(): Promise<ContactsSessionSnapshot | null> {
      const sourceId = await read(SOURCE_KEY);
      if (!sourceId) return null;
      const epochRaw = await read(EPOCH_KEY);
      const versionRaw = await read(VERSION_KEY);
      const fingerprint = await read(FINGERPRINT_KEY);
      const contactsEpoch = epochRaw != null ? Number(epochRaw) : 0;
      const snapshotVersion = versionRaw != null ? Number(versionRaw) : null;
      return {
        sourceId,
        contactsEpoch:
          Number.isInteger(contactsEpoch) && contactsEpoch >= 0
            ? contactsEpoch
            : 0,
        snapshotVersion:
          snapshotVersion != null &&
          Number.isInteger(snapshotVersion) &&
          snapshotVersion >= 1
            ? snapshotVersion
            : null,
        fingerprint,
      };
    },
    async save(snapshot) {
      await write(SOURCE_KEY, snapshot.sourceId);
      await write(EPOCH_KEY, String(snapshot.contactsEpoch));
      if (snapshot.snapshotVersion != null) {
        await write(VERSION_KEY, String(snapshot.snapshotVersion));
      } else {
        await remove(VERSION_KEY);
      }
      if (snapshot.fingerprint) {
        await write(FINGERPRINT_KEY, snapshot.fingerprint);
      } else {
        await remove(FINGERPRINT_KEY);
      }
    },
    async clearSnapshotVersion() {
      await remove(VERSION_KEY);
      await remove(FINGERPRINT_KEY);
    },
  };
}

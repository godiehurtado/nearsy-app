/**
 * Persists Contacts sourceId / contactsEpoch / snapshotVersion / fingerprint
 * per Firebase UID. Never stores raw phone numbers or emails.
 *
 * Migration: legacy global keys (`nearsy.contacts.v1.*` without uid) are
 * claimed once by the first authenticated UID that loads an empty uid-scoped
 * session. Other accounts never reuse that epoch/version (fresh sourceId).
 */

import type { ContactsSessionSnapshot, ContactsSessionStore } from './port';

const LEGACY_SOURCE_KEY = 'nearsy.contacts.v1.sourceId';
const LEGACY_EPOCH_KEY = 'nearsy.contacts.v1.contactsEpoch';
const LEGACY_VERSION_KEY = 'nearsy.contacts.v1.snapshotVersion';
const LEGACY_FINGERPRINT_KEY = 'nearsy.contacts.v1.fingerprint';

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

function keysForUid(uid: string) {
  const prefix = `nearsy.contacts.v1.uid.${uid}`;
  return {
    sourceId: `${prefix}.sourceId`,
    contactsEpoch: `${prefix}.contactsEpoch`,
    snapshotVersion: `${prefix}.snapshotVersion`,
    fingerprint: `${prefix}.fingerprint`,
  };
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

function parseEpoch(raw: string | null): number {
  const n = raw != null ? Number(raw) : 0;
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

function parseVersion(raw: string | null): number | null {
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

async function clearLegacyGlobalKeys(): Promise<void> {
  await remove(LEGACY_SOURCE_KEY);
  await remove(LEGACY_EPOCH_KEY);
  await remove(LEGACY_VERSION_KEY);
  await remove(LEGACY_FINGERPRINT_KEY);
}

/**
 * Claim legacy global session into uid-scoped keys once, then delete globals
 * so a later account cannot inherit another UID's epoch/version fence.
 */
async function migrateLegacyIfNeeded(
  uid: string,
  scoped: ReturnType<typeof keysForUid>,
): Promise<ContactsSessionSnapshot | null> {
  const existing = await read(scoped.sourceId);
  if (existing) return null;

  const legacySource = await read(LEGACY_SOURCE_KEY);
  if (!legacySource) return null;

  const snapshot: ContactsSessionSnapshot = {
    sourceId: legacySource,
    contactsEpoch: parseEpoch(await read(LEGACY_EPOCH_KEY)),
    snapshotVersion: parseVersion(await read(LEGACY_VERSION_KEY)),
    fingerprint: await read(LEGACY_FINGERPRINT_KEY),
  };
  await write(scoped.sourceId, snapshot.sourceId);
  await write(scoped.contactsEpoch, String(snapshot.contactsEpoch));
  if (snapshot.snapshotVersion != null) {
    await write(scoped.snapshotVersion, String(snapshot.snapshotVersion));
  }
  if (snapshot.fingerprint) {
    await write(scoped.fingerprint, snapshot.fingerprint);
  }
  await clearLegacyGlobalKeys();
  return snapshot;
}

export function createContactsSessionStore(uid: string): ContactsSessionStore {
  if (!uid.trim()) {
    throw new Error('contacts-session-uid-required');
  }
  const scoped = keysForUid(uid.trim());

  return {
    async load(): Promise<ContactsSessionSnapshot | null> {
      const migrated = await migrateLegacyIfNeeded(uid.trim(), scoped);
      if (migrated) return migrated;

      const sourceId = await read(scoped.sourceId);
      if (!sourceId) return null;
      return {
        sourceId,
        contactsEpoch: parseEpoch(await read(scoped.contactsEpoch)),
        snapshotVersion: parseVersion(await read(scoped.snapshotVersion)),
        fingerprint: await read(scoped.fingerprint),
      };
    },
    async save(snapshot) {
      await write(scoped.sourceId, snapshot.sourceId);
      await write(scoped.contactsEpoch, String(snapshot.contactsEpoch));
      if (snapshot.snapshotVersion != null) {
        await write(scoped.snapshotVersion, String(snapshot.snapshotVersion));
      } else {
        await remove(scoped.snapshotVersion);
      }
      if (snapshot.fingerprint) {
        await write(scoped.fingerprint, snapshot.fingerprint);
      } else {
        await remove(scoped.fingerprint);
      }
    },
    async clearFingerprint() {
      // Keep snapshotVersion: Identity fences removedSnapshotVersion for this
      // stable sourceId. Restarting at 1 would throw contacts-source-removed.
      await remove(scoped.fingerprint);
    },
  };
}

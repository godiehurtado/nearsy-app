/**
 * Persists Contacts sourceId / contactsEpoch / snapshotVersion / fingerprint
 * per Firebase UID. Never stores raw phone numbers or emails.
 *
 * Legacy global keys (`nearsy.contacts.v1.{sourceId,contactsEpoch,...}`,
 * written by builds before UID scoping) carry no UID, so nothing proves which
 * account created them. They are therefore NOT migrated to any UID:
 *  - every UID starts its own scoped session and mints a fresh sourceId on its
 *    first sync, never reusing the legacy sourceId / epoch / version fences;
 *  - legacy keys are left in place, untouched (not read for identity, not
 *    deleted). Server-side, a legacy source stays attached to whichever account
 *    uploaded it until that account disables Contacts sync or Identity
 *    retires it; this client never sends it again.
 * A sourceId already stored under the same UID keeps its monotonic
 * snapshotVersion and fences (see clearFingerprint).
 */

import type { ContactsSessionSnapshot, ContactsSessionStore } from './port';

/** Pre-UID keys. Kept for documentation/tests; never read for identity. */
export const LEGACY_CONTACTS_SESSION_KEYS = [
  'nearsy.contacts.v1.sourceId',
  'nearsy.contacts.v1.contactsEpoch',
  'nearsy.contacts.v1.snapshotVersion',
  'nearsy.contacts.v1.fingerprint',
] as const;

export type ExpoSecureStoreLike = {
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

function defaultSecureStore(): Promise<ExpoSecureStoreLike | null> {
  storePromise ??= loadSecureStore();
  return storePromise;
}

/** SecureStore keys allow only [A-Za-z0-9._-]; escape anything else. */
export function encodeUidForKey(uid: string): string {
  return uid.replace(
    /[^A-Za-z0-9]/g,
    (ch) => `_${ch.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
}

export function contactsSessionKeysForUid(uid: string) {
  const prefix = `nearsy.contacts.v1.uid.${encodeUidForKey(uid)}`;
  return {
    sourceId: `${prefix}.sourceId`,
    contactsEpoch: `${prefix}.contactsEpoch`,
    snapshotVersion: `${prefix}.snapshotVersion`,
    fingerprint: `${prefix}.fingerprint`,
  };
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

/**
 * Testable adapter. `getStore` resolves the SecureStore module (or null when
 * unavailable, in which case nothing is persisted). A failing read throws so
 * callers never mistake an unreadable session for "no session" and mint a new
 * sourceId over an existing one.
 */
export function createSecureStoreContactsSessionStore(
  uid: string,
  getStore: () => Promise<ExpoSecureStoreLike | null> = defaultSecureStore,
): ContactsSessionStore {
  const trimmed = uid.trim();
  if (!trimmed) {
    throw new Error('contacts-session-uid-required');
  }
  const keys = contactsSessionKeysForUid(trimmed);

  const read = async (key: string): Promise<string | null> => {
    const store = await getStore();
    if (!store) return null;
    try {
      return await store.getItemAsync(key);
    } catch {
      throw new Error('contacts-session-unavailable');
    }
  };
  const write = async (key: string, value: string): Promise<void> => {
    const store = await getStore();
    if (!store) return;
    await store.setItemAsync(key, value);
  };
  const remove = async (key: string): Promise<void> => {
    const store = await getStore();
    if (!store) return;
    try {
      await store.deleteItemAsync(key);
    } catch {
      /* ignore */
    }
  };

  return {
    async load(): Promise<ContactsSessionSnapshot | null> {
      const sourceId = await read(keys.sourceId);
      if (!sourceId) return null;
      return {
        sourceId,
        contactsEpoch: parseEpoch(await read(keys.contactsEpoch)),
        snapshotVersion: parseVersion(await read(keys.snapshotVersion)),
        fingerprint: await read(keys.fingerprint),
      };
    },
    async save(snapshot) {
      // Same sourceId: snapshotVersion never goes backwards (a late persist
      // from an older operation must not reopen a fenced version).
      const storedSource = await read(keys.sourceId);
      const storedVersion =
        storedSource === snapshot.sourceId
          ? parseVersion(await read(keys.snapshotVersion))
          : null;
      const nextVersion =
        storedVersion != null &&
        (snapshot.snapshotVersion == null ||
          snapshot.snapshotVersion < storedVersion)
          ? storedVersion
          : snapshot.snapshotVersion;
      await write(keys.sourceId, snapshot.sourceId);
      await write(keys.contactsEpoch, String(snapshot.contactsEpoch));
      if (nextVersion != null) {
        await write(keys.snapshotVersion, String(nextVersion));
      } else {
        await remove(keys.snapshotVersion);
      }
      if (snapshot.fingerprint) {
        await write(keys.fingerprint, snapshot.fingerprint);
      } else {
        await remove(keys.fingerprint);
      }
    },
    async clearFingerprint() {
      // Keep snapshotVersion: Identity fences removedSnapshotVersion for this
      // stable sourceId. Restarting at 1 would throw contacts-source-removed.
      await remove(keys.fingerprint);
    },
  };
}

export function createContactsSessionStore(uid: string): ContactsSessionStore {
  return createSecureStoreContactsSessionStore(uid);
}

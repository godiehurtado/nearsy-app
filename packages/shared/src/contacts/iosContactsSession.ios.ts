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

import { createContactsSessionStoreFromIO } from './contactsSessionState';
import type {
  ContactsSentSnapshot,
  ContactsSessionSnapshot,
  ContactsSessionStore,
} from './port';

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
    sent: `${prefix}.sent`,
    disablePending: `${prefix}.disablePending`,
  };
}

/** Missing or corrupt means unknown: Identity is asked, never a default of 0. */
function parseEpoch(raw: string | null): number | null {
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

function parseSent(raw: string | null): ContactsSentSnapshot | null {
  if (raw == null) return null;
  try {
    const value = JSON.parse(raw) as Partial<ContactsSentSnapshot>;
    if (
      Number.isInteger(value.epoch) &&
      (value.epoch as number) >= 0 &&
      Number.isInteger(value.version) &&
      (value.version as number) >= 1
    ) {
      return {
        epoch: value.epoch as number,
        version: value.version as number,
        fingerprint:
          typeof value.fingerprint === 'string' ? value.fingerprint : null,
      };
    }
  } catch {
    /* corrupt: treated as nothing sent */
  }
  return null;
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
    } catch (err) {
      const unavailable = new Error('contacts-session-unavailable');
      // Kept for the diagnostic code only; the behavior stays this one error.
      (unavailable as Error & { cause?: unknown }).cause = err;
      throw unavailable;
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

  const writeOrRemove = async (key: string, value: string | null) => {
    if (value != null) await write(key, value);
    else await remove(key);
  };

  // Rules (monotonic epoch and version, serialized writes) live in
  // contactsSessionState. Keep snapshotVersion when clearing a fingerprint:
  // restarting at 1 for this stable sourceId would hit contacts-source-removed.
  return createContactsSessionStoreFromIO(`secure:${trimmed}`, {
    async read(): Promise<ContactsSessionSnapshot | null> {
      const sourceId = await read(keys.sourceId);
      const contactsEpoch = parseEpoch(await read(keys.contactsEpoch));
      const disablePending = (await read(keys.disablePending)) != null;
      if (!sourceId && contactsEpoch == null && !disablePending) return null;
      return {
        sourceId: sourceId || null,
        contactsEpoch,
        snapshotVersion: parseVersion(await read(keys.snapshotVersion)),
        fingerprint: await read(keys.fingerprint),
        sent: parseSent(await read(keys.sent)),
        disablePending,
      };
    },
    async write(snapshot) {
      await writeOrRemove(keys.disablePending, snapshot.disablePending ? '1' : null);
      await writeOrRemove(keys.sourceId, snapshot.sourceId);
      await writeOrRemove(
        keys.sent,
        snapshot.sent ? JSON.stringify(snapshot.sent) : null,
      );
      await writeOrRemove(
        keys.snapshotVersion,
        snapshot.snapshotVersion != null ? String(snapshot.snapshotVersion) : null,
      );
      await writeOrRemove(keys.fingerprint, snapshot.fingerprint || null);
      await writeOrRemove(
        keys.contactsEpoch,
        snapshot.contactsEpoch != null ? String(snapshot.contactsEpoch) : null,
      );
    },
  });
}

export function createContactsSessionStore(uid: string): ContactsSessionStore {
  return createSecureStoreContactsSessionStore(uid);
}

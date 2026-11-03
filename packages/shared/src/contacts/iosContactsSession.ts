import type { ContactsSessionSnapshot, ContactsSessionStore } from './port';

/** In-memory stub (non-iOS). UID-scoped to mirror SecureStore isolation. */
const memoryByUid = new Map<string, ContactsSessionSnapshot>();

export function createContactsSessionStore(uid: string): ContactsSessionStore {
  if (!uid.trim()) {
    throw new Error('contacts-session-uid-required');
  }
  const key = uid.trim();

  return {
    async load() {
      const memory = memoryByUid.get(key);
      return memory?.sourceId ? { ...memory } : null;
    },
    async save(snapshot) {
      memoryByUid.set(key, { ...snapshot });
    },
    async clearFingerprint() {
      const memory = memoryByUid.get(key);
      if (!memory) return;
      memoryByUid.set(key, { ...memory, fingerprint: null });
    },
  };
}

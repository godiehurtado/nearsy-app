import { createContactsSessionStoreFromIO } from './contactsSessionState';
import type { ContactsSessionSnapshot, ContactsSessionStore } from './port';

/** In-memory stub (non-iOS). UID-scoped to mirror SecureStore isolation. */
const memoryByUid = new Map<string, ContactsSessionSnapshot>();

export function createContactsSessionStore(uid: string): ContactsSessionStore {
  if (!uid.trim()) {
    throw new Error('contacts-session-uid-required');
  }
  const key = uid.trim();

  return createContactsSessionStoreFromIO(`memory:${key}`, {
    async read() {
      const memory = memoryByUid.get(key);
      return memory ? { ...memory } : null;
    },
    async write(snapshot) {
      memoryByUid.set(key, { ...snapshot });
    },
  });
}

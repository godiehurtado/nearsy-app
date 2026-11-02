import type { ContactsSessionSnapshot, ContactsSessionStore } from './port';

const memory: ContactsSessionSnapshot = {
  sourceId: '',
  contactsEpoch: 0,
  snapshotVersion: null,
  fingerprint: null,
};

export function createContactsSessionStore(): ContactsSessionStore {
  return {
    async load() {
      return memory.sourceId ? { ...memory } : null;
    },
    async save(snapshot) {
      memory.sourceId = snapshot.sourceId;
      memory.contactsEpoch = snapshot.contactsEpoch;
      memory.snapshotVersion = snapshot.snapshotVersion;
      memory.fingerprint = snapshot.fingerprint;
    },
    async clearFingerprint() {
      memory.fingerprint = null;
    },
  };
}

import { createContactsSessionStoreFromIO } from './contactsSessionState';
import { parseContactsWireResult } from './parse';
import type { ContactsHmacClient, ContactsSessionSnapshot } from './port';
import type { ContactsWireResult } from './wireTypes';

export function createFakeContactsHmacClient(
  handlers: Partial<ContactsHmacClient> = {},
): ContactsHmacClient & { calls: Array<{ name: string; request: unknown }> } {
  const calls: Array<{ name: string; request: unknown }> = [];
  return {
    calls,
    async enableContactsSync(request) {
      calls.push({ name: 'enableContactsSync', request });
      if (handlers.enableContactsSync) return handlers.enableContactsSync(request);
      return parseContactsWireResult({
        result: 'enabled',
        contactsSyncEnabled: true,
        contactsEpoch: request.contactsEpoch,
        notifyNearbyContactsEffective: true,
        keyCount: 0,
        syncCommitted: true,
        reevaluateRequired: true,
      });
    },
    async syncContactHashes(request) {
      calls.push({ name: 'syncContactHashes', request });
      if (handlers.syncContactHashes) return handlers.syncContactHashes(request);
      return parseContactsWireResult({
        result: 'synced',
        contactsSyncEnabled: true,
        contactsEpoch: request.contactsEpoch,
        notifyNearbyContactsEffective: true,
        sourceId: request.sourceId,
        snapshotVersion: request.snapshotVersion,
        identifierCount: request.identifiers.length,
        keyCount: 0,
        syncCommitted: true,
        reevaluateRequired: true,
      });
    },
    async disableContactsSync(request) {
      calls.push({ name: 'disableContactsSync', request });
      if (handlers.disableContactsSync) {
        return handlers.disableContactsSync(request);
      }
      return parseContactsWireResult({
        result: 'disabled',
        contactsSyncEnabled: false,
        contactsEpoch: request.contactsEpoch + 1,
        notifyNearbyContactsEffective: false,
        keyCount: 0,
        syncCommitted: true,
        reevaluateRequired: true,
      });
    },
    async removeContactSource(request) {
      calls.push({ name: 'removeContactSource', request });
      if (handlers.removeContactSource) {
        return handlers.removeContactSource(request);
      }
      return parseContactsWireResult({
        result: 'removed',
        contactsSyncEnabled: true,
        contactsEpoch: request.contactsEpoch,
        notifyNearbyContactsEffective: true,
        sourceId: request.sourceId,
        snapshotVersion: 1,
        syncCommitted: true,
        reevaluateRequired: true,
      });
    },
    async refreshVerifiedActorKeys(request) {
      calls.push({ name: 'refreshVerifiedActorKeys', request });
      if (handlers.refreshVerifiedActorKeys) {
        return handlers.refreshVerifiedActorKeys(request);
      }
      return parseContactsWireResult({
        result: 'refreshed',
        contactsSyncEnabled: true,
        contactsEpoch: 1,
        notifyNearbyContactsEffective: true,
        keyCount: 0,
        syncCommitted: true,
        reevaluateRequired: false,
      });
    },
  };
}

let memoryStoreCount = 0;

export function createMemoryContactsSessionStore(seed?: {
  sourceId?: string | null;
  contactsEpoch?: number | null;
  snapshotVersion?: number | null;
  fingerprint?: string | null;
}) {
  let current: ContactsSessionSnapshot = {
    sourceId: seed?.sourceId === undefined ? 'ios_testdevice01' : seed.sourceId,
    contactsEpoch: seed?.contactsEpoch === undefined ? 0 : seed.contactsEpoch,
    snapshotVersion: seed?.snapshotVersion ?? null,
    fingerprint: seed?.fingerprint ?? null,
    sent: null,
  };
  memoryStoreCount += 1;
  const store = createContactsSessionStoreFromIO(`fake-${memoryStoreCount}`, {
    async read() {
      return current.sourceId == null &&
        current.contactsEpoch == null &&
        !current.disablePending
        ? null
        : { ...current };
    },
    async write(next) {
      current = { ...next };
    },
  });
  return {
    ...store,
    peek() {
      return { ...current };
    },
  };
}

import { parseContactsWireResult } from './parse';
import type { ContactsHmacClient } from './port';
import type { ContactsWireResult } from './wireTypes';

export function createFakeContactsHmacClient(
  handlers: Partial<ContactsHmacClient> = {},
): ContactsHmacClient & { calls: Array<{ name: string; request: unknown }> } {
  const calls: Array<{ name: string; request: unknown }> = [];
  const enabled: ContactsWireResult = parseContactsWireResult({
    result: 'enabled',
    contactsSyncEnabled: true,
    contactsEpoch: 1,
    notifyNearbyContactsEffective: true,
    keyCount: 0,
    syncCommitted: true,
    reevaluateRequired: true,
  });
  return {
    calls,
    async enableContactsSync(request) {
      calls.push({ name: 'enableContactsSync', request });
      if (handlers.enableContactsSync) return handlers.enableContactsSync(request);
      return enabled;
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

export function createMemoryContactsSessionStore(seed?: {
  sourceId?: string;
  contactsEpoch?: number;
  snapshotVersion?: number | null;
  fingerprint?: string | null;
}) {
  let current = {
    sourceId: seed?.sourceId ?? 'ios_testdevice01',
    contactsEpoch: seed?.contactsEpoch ?? 0,
    snapshotVersion: seed?.snapshotVersion ?? null,
    fingerprint: seed?.fingerprint ?? null,
  };
  return {
    async load() {
      return { ...current };
    },
    async save(next: typeof current) {
      current = { ...next };
    },
    async clearSnapshotVersion() {
      current = { ...current, snapshotVersion: null, fingerprint: null };
    },
    peek() {
      return { ...current };
    },
  };
}

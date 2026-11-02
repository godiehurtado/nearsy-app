/**
 * Identity Contacts HMAC wire (PR #23 service.ts ContactsWireResult).
 * Full field list — do not invent omitted markdown ellipses.
 */

import type { ContactIdentifierInput } from './domain';

export type EnableContactsSyncRequest = Record<string, never>;

export type SyncContactHashesRequest = {
  sourceId: string;
  snapshotVersion: number;
  contactsEpoch: number;
  identifiers: ContactIdentifierInput[];
};

export type DisableContactsSyncRequest = {
  contactsEpoch: number;
};

export type RemoveContactSourceRequest = {
  sourceId: string;
  contactsEpoch: number;
};

export type RefreshVerifiedActorKeysRequest = Record<string, never>;

export type ContactsWireResult = {
  result: string;
  contactsSyncEnabled: boolean;
  contactsEpoch: number;
  notifyNearbyContactsEffective: boolean;
  sourceId?: string;
  snapshotVersion?: number;
  identifierCount?: number;
  keyCount?: number;
  syncCommitted: boolean;
  reevaluateRequired: boolean;
};

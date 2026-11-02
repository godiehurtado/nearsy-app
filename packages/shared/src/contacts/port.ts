import type {
  ContactsWireResult,
  DisableContactsSyncRequest,
  EnableContactsSyncRequest,
  RefreshVerifiedActorKeysRequest,
  RemoveContactSourceRequest,
  SyncContactHashesRequest,
} from './wireTypes';

export type ContactsHmacClient = {
  enableContactsSync(
    request: EnableContactsSyncRequest,
  ): Promise<ContactsWireResult>;
  syncContactHashes(
    request: SyncContactHashesRequest,
  ): Promise<ContactsWireResult>;
  disableContactsSync(
    request: DisableContactsSyncRequest,
  ): Promise<ContactsWireResult>;
  removeContactSource(
    request: RemoveContactSourceRequest,
  ): Promise<ContactsWireResult>;
  refreshVerifiedActorKeys(
    request: RefreshVerifiedActorKeysRequest,
  ): Promise<ContactsWireResult>;
};

export type ContactsSessionSnapshot = {
  sourceId: string;
  contactsEpoch: number;
  snapshotVersion: number | null;
  fingerprint: string | null;
};

export type ContactsSessionStore = {
  load(): Promise<ContactsSessionSnapshot | null>;
  save(snapshot: ContactsSessionSnapshot): Promise<void>;
  /**
   * Clears the local fingerprint after remove/disable so the next sync
   * bumps. Keeps snapshotVersion so a stable sourceId cannot restart at 1
   * and collide with Identity removedSnapshotVersion.
   */
  clearFingerprint(): Promise<void>;
};

export type ContactsPermissionStatus =
  | 'granted'
  | 'limited'
  | 'denied'
  | 'undetermined';

export type ContactsAddressBookPort = {
  getPermission(): Promise<ContactsPermissionStatus>;
  requestPermission(): Promise<ContactsPermissionStatus>;
  readRows(): Promise<
    Array<{
      phoneNumbers?: Array<{ number?: string | null } | null> | null;
      emails?: Array<{ email?: string | null } | null> | null;
    }>
  >;
};

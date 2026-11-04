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

/** Highest snapshot sent in `epoch`, confirmed or not. */
export type ContactsSentSnapshot = {
  epoch: number;
  version: number;
  /** Null once the version must not be reused for any content. */
  fingerprint: string | null;
};

export type ContactsSessionSnapshot = {
  /** Null until this UID's first upload. */
  sourceId: string | null;
  /** Highest epoch seen for this UID. Null means unknown: ask Identity. */
  contactsEpoch: number | null;
  snapshotVersion: number | null;
  /** Confirmed snapshot in `contactsEpoch`. */
  fingerprint: string | null;
  sent?: ContactsSentSnapshot | null;
  /**
   * The user asked to turn off and the server has not confirmed it. Survives
   * restarts and sign-out, and blocks enable and sync until resolved.
   */
  disablePending?: boolean;
};

export type ContactsSessionStore = {
  load(): Promise<ContactsSessionSnapshot | null>;
  /** Atomic read-modify-write, serialized per UID. */
  update(
    mutate: (current: ContactsSessionSnapshot | null) => ContactsSessionSnapshot,
  ): Promise<ContactsSessionSnapshot>;
  save(snapshot: ContactsSessionSnapshot): Promise<void>;
  /**
   * Clears the local fingerprint after remove/disable so the next sync
   * bumps. Keeps snapshotVersion so a stable sourceId cannot restart at 1
   * and collide with Identity removedSnapshotVersion.
   */
  clearFingerprint(): Promise<void>;
  /**
   * After sign-out the next session asks Identity again. Keeps the sourceId
   * and version counter: the source stays stable for this install.
   */
  forgetEpoch(): Promise<void>;
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

/**
 * Default (non-Android): Identity Contacts HMAC is not invoked.
 */
import { ContactsHmacError } from './contactsHmacCore.ts';
import type { ContactsWireResult } from './contactsHmacContract.ts';
import type {
  ContactsDisclosureAcceptance,
  ContactsOpResult,
  ContactsUserDocFacts,
} from './contactsSyncSession.ts';
import {
  CONTACTS_STATUS_SIGNED_OUT,
  type ContactsSyncStatus,
} from './contactsSyncStatus.ts';

export {
  ContactsFlowStateError,
  ContactsHmacError,
  ContactsSyncAfterEnableError,
  collectContactIdentifiers,
  contactsEpochFromUserDoc,
  contactsHmacErrorToI18nKey,
  identifiersFingerprint,
  isContactsHardCapOrFenceError,
  isContactsOutcomeUncertain,
  removedSnapshotFloorAfterRemove,
  shouldScheduleReevaluate,
  snapshotVersionForUpload,
} from './contactsHmacCore.ts';
export {
  contactsCanRetry,
  contactsCanRetryRead,
  contactsCopyParams,
  contactsOperationInFlight,
  contactsStatusCopyKey,
  contactsToggleLocked,
  contactsToggleValue,
} from './contactsSyncStatus.ts';
export type { ContactsSyncStatus } from './contactsSyncStatus.ts';
export type {
  ContactsLocalState,
  ContactsFlowOutcome,
  ContactsEnableStage,
} from './contactsSyncFlow.ts';
export type {
  ContactsDisclosureAcceptance,
  ContactsOpResult,
  ContactsUserDocFacts,
} from './contactsSyncSession.ts';

async function unavailable(): Promise<ContactsOpResult> {
  return {
    status: 'failed',
    error: new ContactsHmacError(
      'contacts-hmac-unavailable',
      'Contacts hashing is not configured. (contacts-hmac-unavailable)',
    ),
  };
}

export function getContactsSyncStatus(): ContactsSyncStatus {
  return CONTACTS_STATUS_SIGNED_OUT;
}

export function subscribeContactsSyncStatus(
  _listener: (status: ContactsSyncStatus) => void,
): () => void {
  return () => {};
}

export async function bindContactsUserDoc(
  _uid: string,
  _doc: ContactsUserDocFacts,
  _options?: { readOnly?: boolean },
): Promise<void> {}

export function expectContactsUserDocRead(_uid: string): void {}

export function reportContactsUserDocReadFailed(_uid: string): void {}

export function enableThenSyncContacts(
  _acceptance?: ContactsDisclosureAcceptance,
): Promise<ContactsOpResult> {
  return unavailable();
}

export function retryContactsSync(
  _acceptance?: ContactsDisclosureAcceptance,
): Promise<ContactsOpResult> {
  return unavailable();
}

export function disableContactsIntegration(): Promise<ContactsOpResult> {
  return unavailable();
}

export function refreshContactsActorKeys(): Promise<ContactsOpResult> {
  return unavailable();
}

export function contactsReliablePhoneRegion(_phone: unknown, _phoneVerified: unknown): string | null {
  return null;
}

export function contactsHmacAvailable(): boolean {
  return false;
}

export type { ContactsWireResult };

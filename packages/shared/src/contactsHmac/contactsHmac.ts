/**
 * Default (non-Android): Identity Contacts HMAC is not invoked.
 */
import { ContactsHmacError } from './contactsHmacCore.ts';
import type { ContactsWireResult } from './contactsHmacContract.ts';
import type { ContactsFlowOutcome, ContactsLocalState } from './contactsSyncFlow.ts';

export {
  ContactsHmacError,
  collectContactIdentifiers,
  contactsEpochFromUserDoc,
  contactsHmacErrorToI18nKey,
  identifiersFingerprint,
  isContactsHardCapOrFenceError,
  removedSnapshotFloorAfterRemove,
  shouldScheduleReevaluate,
  snapshotVersionForUpload,
} from './contactsHmacCore.ts';
export type { ContactsLocalState, ContactsFlowOutcome } from './contactsSyncFlow.ts';

function unavailable(): never {
  throw new ContactsHmacError(
    'contacts-hmac-unavailable',
    'Contacts hashing is not configured. (contacts-hmac-unavailable)',
  );
}

export async function enableThenSyncContacts(
  _state: ContactsLocalState,
  _liveEpochHint?: number,
): Promise<ContactsFlowOutcome> {
  return unavailable();
}

export async function resyncGrantedContacts(
  _state: ContactsLocalState,
): Promise<ContactsFlowOutcome> {
  return unavailable();
}

export async function disableContactsIntegration(
  _state: ContactsLocalState,
): Promise<ContactsFlowOutcome> {
  return unavailable();
}

export async function refreshContactsActorKeys(
  _state: ContactsLocalState,
): Promise<ContactsFlowOutcome> {
  return unavailable();
}

export async function loadContactsLocalState(
  _uid: string,
): Promise<ContactsLocalState | null> {
  return null;
}

export async function persistContactsLocalState(
  _uid: string,
  _state: ContactsLocalState,
): Promise<void> {}

export function contactsHmacAvailable(): boolean {
  return false;
}

export type { ContactsWireResult };

/**
 * Android Identity Contacts HMAC wiring.
 * Auth + App Check, caller uid only, us-central1, codebase nearsy-identity.
 * No productive calls from tooling; UI invokes on explicit consent.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

import { firebaseAuth } from '../config/firebaseConfig.android';
import {
  ensureAppCheckInitialized,
  getAppCheckInitStatus,
} from '../config/appCheckBootstrap';
import {
  getIdentityFunctions,
  getIdentityFunctionsRegion,
} from '../config/identityFunctions';
import { scheduleReevaluateProximityNotices } from '../alerts/reevaluateProximityNotices';
import { createAndroidContactsBook } from './contactsBook.android.ts';
import { ContactsHmacError } from './contactsHmacCore.ts';
import { reliableRegionFromVerifiedPhone } from './contactsIdentifierNormalize.ts';
import {
  createContactsSyncSession,
  type ContactsDisclosureAcceptance,
  type ContactsOpResult,
  type ContactsUserDocFacts,
} from './contactsSyncSession.ts';
import type { ContactsSyncStatus } from './contactsSyncStatus.ts';

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

/** Bound Identity round-trips so More stays navigable and errors stay concrete. */
export const CONTACTS_CALLABLE_TIMEOUT_MS = 45_000;

async function ensureAppCheckReady(): Promise<void> {
  const status = await ensureAppCheckInitialized();
  if (status.status === 'ready') return;
  if (status.status === 'error') {
    throw new ContactsHmacError(
      'APP_CHECK_NOT_READY',
      'App Check initialization failed.',
    );
  }
  const latest = getAppCheckInitStatus();
  if (latest.status !== 'ready') {
    throw new ContactsHmacError(
      'APP_CHECK_NOT_READY',
      'App Check is not ready.',
    );
  }
}

/** Reliable phone region per account, from its own user document. */
const reliableRegionByUid = new Map<string, string | null>();

const session = createContactsSyncSession({
  currentUid: () => firebaseAuth.currentUser?.uid ?? null,
  store: AsyncStorage,
  randomBytes: () => Crypto.getRandomBytesAsync(16),
  region: getIdentityFunctionsRegion(),
  async callIdentity(name, data) {
    const result = await getIdentityFunctions().httpsCallable(name)(data ?? {});
    return result.data;
  },
  createBook: () =>
    createAndroidContactsBook({
      reliableRegion: () => {
        const uid = firebaseAuth.currentUser?.uid;
        return uid ? reliableRegionByUid.get(uid) ?? null : null;
      },
    }),
  ensureAppCheck: ensureAppCheckReady,
  scheduleReevaluate: scheduleReevaluateProximityNotices,
  timeoutMs: CONTACTS_CALLABLE_TIMEOUT_MS,
});

let authBound = false;

function bound() {
  if (!authBound) {
    authBound = true;
    firebaseAuth.onAuthStateChanged((user) => {
      session.handleAuthChanged(user?.uid ?? null);
    });
  }
  return session;
}

export function getContactsSyncStatus(): ContactsSyncStatus {
  return bound().getStatus();
}

export function subscribeContactsSyncStatus(
  listener: (status: ContactsSyncStatus) => void,
): () => void {
  return bound().subscribe(listener);
}

export function bindContactsUserDoc(
  uid: string,
  doc: ContactsUserDocFacts,
  options?: { readOnly?: boolean },
): Promise<void> {
  if (doc.reliablePhoneRegion !== undefined) {
    reliableRegionByUid.set(uid, doc.reliablePhoneRegion);
  }
  return bound().bindUserDoc(uid, doc, options);
}

export function expectContactsUserDocRead(uid: string): void {
  bound().expectUserDocRead(uid);
}

export function reportContactsUserDocReadFailed(uid: string): void {
  bound().reportUserDocReadFailed(uid);
}

export function enableThenSyncContacts(
  acceptance?: ContactsDisclosureAcceptance,
): Promise<ContactsOpResult> {
  return bound().enableThenSync(acceptance);
}

export function retryContactsSync(
  acceptance?: ContactsDisclosureAcceptance,
): Promise<ContactsOpResult> {
  return bound().retry(acceptance);
}

export function disableContactsIntegration(): Promise<ContactsOpResult> {
  return bound().disable();
}

export function refreshContactsActorKeys(): Promise<ContactsOpResult> {
  return bound().refreshKeys();
}

/** Region of the account's own verified phone; null when there is none. */
export function contactsReliablePhoneRegion(phone: unknown, phoneVerified: unknown): string | null {
  return reliableRegionFromVerifiedPhone(phone, phoneVerified);
}

export function contactsHmacAvailable(): boolean {
  return true;
}

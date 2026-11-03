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
import {
  createContactsSyncSession,
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
  contactsOperationInFlight,
  contactsStatusCopyKey,
  contactsToggleValue,
} from './contactsSyncStatus.ts';
export type { ContactsSyncStatus } from './contactsSyncStatus.ts';
export type {
  ContactsLocalState,
  ContactsFlowOutcome,
  ContactsEnableStage,
} from './contactsSyncFlow.ts';
export type {
  ContactsOpResult,
  ContactsUserDocFacts,
} from './contactsSyncSession.ts';

/** Bound Identity round-trips so More stays navigable and errors stay concrete. */
export const CONTACTS_CALLABLE_TIMEOUT_MS = 45_000;
/** Past the native callable deadline, so it only frees a request that never settles. */
export const CONTACTS_LATE_RESULT_GRACE_MS = 60_000;

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

const session = createContactsSyncSession({
  currentUid: () => firebaseAuth.currentUser?.uid ?? null,
  store: AsyncStorage,
  randomBytes: () => Crypto.getRandomBytesAsync(16),
  region: getIdentityFunctionsRegion(),
  async callIdentity(name, data) {
    const result = await getIdentityFunctions().httpsCallable(name)(data ?? {});
    return result.data;
  },
  createBook: createAndroidContactsBook,
  ensureAppCheck: ensureAppCheckReady,
  scheduleReevaluate: scheduleReevaluateProximityNotices,
  timeoutMs: CONTACTS_CALLABLE_TIMEOUT_MS,
  lateResultGraceMs: CONTACTS_LATE_RESULT_GRACE_MS,
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
): Promise<void> {
  return bound().bindUserDoc(uid, doc);
}

export function enableThenSyncContacts(): Promise<ContactsOpResult> {
  return bound().enableThenSync();
}

export function retryContactsSync(): Promise<ContactsOpResult> {
  return bound().retry();
}

export function disableContactsIntegration(): Promise<ContactsOpResult> {
  return bound().disable();
}

export function refreshContactsActorKeys(): Promise<ContactsOpResult> {
  return bound().refreshKeys();
}

export function contactsHmacAvailable(): boolean {
  return true;
}

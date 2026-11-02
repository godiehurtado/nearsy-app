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
import {
  ContactsHmacError,
  mapContactsCallableError,
  type ContactsHmacFunctionsPort,
} from './contactsHmacCore.ts';
import {
  loadContactsLocalState as loadState,
  loadOrCreateSourceId,
  persistContactsLocalState as persistState,
} from './contactsSource.ts';
import type { ContactsLocalState } from './contactsSyncFlow.ts';
import {
  runDisable,
  runEnableThenSync,
  runRefreshKeys,
  runResyncGrantedBook,
  type ContactsFlowOutcome,
} from './contactsSyncFlow.ts';

export {
  ContactsHmacError,
  collectContactIdentifiers,
  contactsEpochFromUserDoc,
  contactsHmacErrorToI18nKey,
  identifiersFingerprint,
  shouldScheduleReevaluate,
  snapshotVersionForUpload,
} from './contactsHmacCore.ts';
export type { ContactsLocalState, ContactsFlowOutcome } from './contactsSyncFlow.ts';

function createFunctionsPort(): ContactsHmacFunctionsPort {
  const functions = getIdentityFunctions();
  return {
    region: getIdentityFunctionsRegion(),
    async call(name, data) {
      const callable = functions.httpsCallable(name);
      try {
        const result = await callable(data ?? {});
        return result.data;
      } catch (err) {
        throw mapContactsCallableError(err);
      }
    },
  };
}

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

function requireUid(): string {
  const uid = firebaseAuth.currentUser?.uid;
  if (!uid) {
    throw new ContactsHmacError(
      'contacts-unauthenticated',
      'Authentication is required. (contacts-unauthenticated)',
    );
  }
  return uid;
}

async function randomSourceBytes(): Promise<Uint8Array> {
  const bytes = await Crypto.getRandomBytesAsync(16);
  return bytes;
}

export async function loadContactsLocalState(
  uid: string,
): Promise<ContactsLocalState> {
  const sourceId = await loadOrCreateSourceId(AsyncStorage, randomSourceBytes);
  return loadState(AsyncStorage, uid, sourceId);
}

export async function persistContactsLocalState(
  uid: string,
  state: ContactsLocalState,
): Promise<void> {
  await persistState(AsyncStorage, uid, state);
}

function maybeReevaluate(outcome: ContactsFlowOutcome): ContactsFlowOutcome {
  if (outcome.scheduleReevaluate) {
    scheduleReevaluateProximityNotices();
  }
  return outcome;
}

export async function enableThenSyncContacts(
  state: ContactsLocalState,
  liveEpochHint?: number,
): Promise<ContactsFlowOutcome> {
  requireUid();
  await ensureAppCheckReady();
  const outcome = await runEnableThenSync({
    functions: createFunctionsPort(),
    book: createAndroidContactsBook(),
    state,
    liveEpochHint,
  });
  const uid = requireUid();
  await persistContactsLocalState(uid, outcome.state);
  return maybeReevaluate(outcome);
}

export async function resyncGrantedContacts(
  state: ContactsLocalState,
  liveEpochHint?: number,
): Promise<ContactsFlowOutcome> {
  requireUid();
  await ensureAppCheckReady();
  const outcome = await runResyncGrantedBook({
    functions: createFunctionsPort(),
    book: createAndroidContactsBook(),
    state,
    liveEpochHint,
  });
  const uid = requireUid();
  await persistContactsLocalState(uid, outcome.state);
  return maybeReevaluate(outcome);
}

export async function disableContactsIntegration(
  state: ContactsLocalState,
): Promise<ContactsFlowOutcome> {
  requireUid();
  await ensureAppCheckReady();
  const outcome = await runDisable({
    functions: createFunctionsPort(),
    state,
  });
  const uid = requireUid();
  await persistContactsLocalState(uid, outcome.state);
  return maybeReevaluate(outcome);
}

export async function refreshContactsActorKeys(
  state: ContactsLocalState,
): Promise<ContactsFlowOutcome> {
  requireUid();
  await ensureAppCheckReady();
  const outcome = await runRefreshKeys({
    functions: createFunctionsPort(),
    state,
  });
  const uid = requireUid();
  await persistContactsLocalState(uid, outcome.state);
  return maybeReevaluate(outcome);
}

export function contactsHmacAvailable(): boolean {
  return true;
}

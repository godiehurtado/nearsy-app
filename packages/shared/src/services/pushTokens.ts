// This-device Expo push token: register under the current UID, release that
// same token under the previous UID before the session is replaced or signed out.
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

import { firebaseAuth, firestoreDb } from '../config/firebaseConfig';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import {
  isAccountClosedByDeletion,
  isAccountDeletionSessionActive,
} from './accountDeletionSession';
import { bindPushTokenAuthReplaceHandlers } from './pushTokenBeforeAuthReplace';
import {
  createPushTokenSession,
  type PushTokenSessionIO,
  type RegisterPushTokenResult,
  type SyncPushTokenAuthResult,
} from './pushTokenSession';
import type {
  PushTokenAuthReplacePreparation,
  PushTokenReleaseOutcome,
} from './pushTokenLifecycle';

function thisDeviceTokenRef(uid: string, token: string) {
  return doc(firestoreDb, 'users', uid, 'pushTokens', token);
}

export function createDefaultPushTokenIO(): PushTokenSessionIO {
  return {
    getCurrentUid: () => firebaseAuth.currentUser?.uid ?? null,
    async getPermissionGranted() {
      const current = await Notifications.getPermissionsAsync();
      return (
        current.granted ||
        current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
      );
    },
    async getExpoPushToken() {
      const projectId =
        Constants?.expoConfig?.extra?.eas?.projectId ||
        Constants?.easConfig?.projectId;
      if (!projectId && __DEV__) {
        console.warn('[PushTokens] Missing EAS projectId');
      }
      const { data: token } = await Notifications.getExpoPushTokenAsync(
        projectId ? { projectId } : undefined,
      );
      return token || null;
    },
    async writeThisDeviceToken(uid, token) {
      await setDoc(
        thisDeviceTokenRef(uid, token),
        {
          token,
          platform: Platform.OS,
          deviceName: Device.deviceName ?? null,
          osName: Device.osName ?? null,
          osVersion: Device.osVersion ?? null,
          updatedAt: Date.now(),
        },
        { merge: true },
      );
    },
    async deleteThisDeviceToken(uid, token) {
      await deleteDoc(thisDeviceTokenRef(uid, token));
    },
    isRegistrationAllowed(uid) {
      if (isAccountDeletionSessionActive()) return false;
      if (isAccountClosedByDeletion(uid)) return false;
      return true;
    },
  };
}

const session = createPushTokenSession(createDefaultPushTokenIO());

bindPushTokenAuthReplaceHandlers({
  prepare: () => session.prepareForIncomingAuth(),
  restore: (prepared) => session.restoreAfterAbortedAuth(prepared),
});

export async function registerPushToken(): Promise<RegisterPushTokenResult> {
  try {
    return await session.register();
  } catch (err) {
    if (__DEV__) {
      console.warn('[PushTokens] registerPushToken error:', err);
    }
    return { ok: false, reason: 'exception' };
  }
}

/**
 * Delete only this device's Expo token under `uid`. Sibling pushTokens docs
 * (other devices) are left intact. Call only while currentUser.uid === uid.
 */
export async function releaseThisDevicePushTokenForUid(
  uid: string,
): Promise<PushTokenReleaseOutcome> {
  try {
    return await session.releaseForUid(uid);
  } catch (err) {
    if (__DEV__) {
      console.warn('[PushTokens] releaseForUid error:', err);
    }
    return { status: 'failed', reason: 'exception', uid };
  }
}

/** Call while currentUser is still the identity that owns the association. */
export async function releaseThisDevicePushTokenForCurrentUser(): Promise<PushTokenReleaseOutcome> {
  try {
    return await session.releaseForCurrentUser();
  } catch (err) {
    if (__DEV__) {
      console.warn('[PushTokens] releaseForCurrentUser error:', err);
    }
    return { status: 'failed', reason: 'exception' };
  }
}

export async function prepareThisDevicePushTokenForIncomingAuth(): Promise<PushTokenAuthReplacePreparation> {
  try {
    return await session.prepareForIncomingAuth();
  } catch (err) {
    if (__DEV__) {
      console.warn('[PushTokens] prepareForIncomingAuth error:', err);
    }
    return { previousUid: firebaseAuth.currentUser?.uid ?? null, released: false };
  }
}

export async function restoreThisDevicePushTokenAfterAbortedAuth(
  prepared: PushTokenAuthReplacePreparation,
): Promise<void> {
  try {
    await session.restoreAfterAbortedAuth(prepared);
  } catch (err) {
    if (__DEV__) {
      console.warn('[PushTokens] restoreAfterAbortedAuth error:', err);
    }
  }
}

/**
 * Auth listener entry. Logout (nextUid null) and A→B only bump generation
 * and, when allowed, register the live uid. Deleting users/A/pushTokens/{token}
 * must already have happened while authenticated as A.
 */
export async function syncPushTokenForAuthUser(
  previousUid: string | null,
  nextUid: string | null,
): Promise<SyncPushTokenAuthResult> {
  try {
    return await session.syncAuth(previousUid, nextUid);
  } catch (err) {
    if (__DEV__) {
      console.warn('[PushTokens] syncPushTokenForAuthUser error:', err);
    }
    return { ok: false, reason: 'exception', registered: false };
  }
}

/**
 * @deprecated Use releaseThisDevicePushTokenForCurrentUser before signOut.
 * Kept as a thin alias so older call sites cannot pass a token after session loss.
 */
export async function unregisterPushToken(token?: string) {
  if (!token) {
    await releaseThisDevicePushTokenForCurrentUser();
    return;
  }
  const uid = firebaseAuth.currentUser?.uid;
  if (!uid) return;
  await releaseThisDevicePushTokenForUid(uid);
}

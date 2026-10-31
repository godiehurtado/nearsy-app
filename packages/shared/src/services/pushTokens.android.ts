// Android push-token persistence backed by RNFirebase Firestore.
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

import { firebaseAuth, firestoreDb } from '../config/firebaseConfig.android';
import {
  createPushTokenSessionStore,
  registerDevicePushToken,
  restoreDevicePushTokenIfSession,
  runWithOutgoingPushRelease as runOutgoingPushReleaseGuard,
  sealDevicePushTokenSession,
  unregisterDevicePushToken,
  type RegisterPushTokenResult,
} from './pushTokenLifecycle';

const session = createPushTokenSessionStore();

type RegisterResult = RegisterPushTokenResult;

function currentUid(): string | null {
  return firebaseAuth.currentUser?.uid ?? null;
}

function assertCurrentUid(uid: string): void {
  if (currentUid() !== uid) {
    throw Object.assign(new Error('push-token-uid-mismatch'), {
      code: 'push/uid-mismatch',
    });
  }
}

async function permissionGranted(): Promise<boolean> {
  // Read existing OS permission only — never prompt here.
  // Native authorization is owned by the dedicated CRJ notifications step.
  const current = await Notifications.getPermissionsAsync();
  return (
    current.granted ||
    current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  );
}

async function mintExpoPushToken(): Promise<string | null> {
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
}

async function persistToken(uid: string, token: string): Promise<void> {
  assertCurrentUid(uid);
  const tokenRef = firestoreDb
    .collection('users')
    .doc(uid)
    .collection('pushTokens')
    .doc(token);

  await tokenRef.set(
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
}

async function deleteToken(uid: string, token: string): Promise<void> {
  assertCurrentUid(uid);
  const tokenRef = firestoreDb
    .collection('users')
    .doc(uid)
    .collection('pushTokens')
    .doc(token);
  await tokenRef.delete();
}

export async function registerPushToken(): Promise<RegisterResult> {
  try {
    const granted = await permissionGranted();
    if (!granted) return { ok: false, reason: 'permission-not-granted' };
    return await registerDevicePushToken({
      store: session,
      getUid: currentUid,
      permissionGranted: granted,
      mintToken: mintExpoPushToken,
      persistToken,
      deleteToken,
    });
  } catch (err) {
    if (__DEV__) {
      console.warn('[PushTokens] registerPushToken error:', err);
    }
    return { ok: false, reason: 'exception' };
  }
}

/**
 * Remove this device's Expo token under the still-authenticated UID.
 * Logout uses this as best-effort (errors never block signOut).
 * Never wipes the pushTokens collection (other devices stay registered).
 */
export async function unregisterCurrentDevicePushToken(): Promise<void> {
  try {
    await unregisterDevicePushToken({
      store: session,
      getUid: currentUid,
      resolveToken: async () => {
        const granted = await permissionGranted();
        if (!granted) return null;
        return mintExpoPushToken();
      },
      deleteToken,
    });
  } catch (err) {
    if (__DEV__) {
      console.warn('[PushTokens] unregisterCurrentDevicePushToken error:', err);
    }
  }
}

/**
 * Account switch: delete this device token while Auth is still the outgoing
 * UID. Errors propagate so the caller does not replace the session.
 */
export async function releaseOutgoingDevicePushToken(): Promise<void> {
  await unregisterDevicePushToken({
    store: session,
    getUid: currentUid,
    resolveToken: async () => {
      const granted = await permissionGranted();
      if (!granted) return null;
      return mintExpoPushToken();
    },
    deleteToken,
  });
}

/**
 * Failed/cancelled login after release: re-register if session A remains.
 * No new permission prompt.
 */
export async function restoreDevicePushTokenIfCurrentUid(
  expectedUid: string | null,
): Promise<void> {
  await restoreDevicePushTokenIfSession({
    store: session,
    expectedUid,
    getUid: currentUid,
    restore: registerPushToken,
  });
}

/**
 * Direct account switch: release first; if the new login fails/cancels and
 * Auth is still the outgoing UID, restore this device's registration.
 * A failed release does not run the sign-in (session A stays).
 */
export async function runWithOutgoingPushRelease<T>(
  operation: () => Promise<T>,
): Promise<T> {
  return runOutgoingPushReleaseGuard({
    getUid: currentUid,
    release: releaseOutgoingDevicePushToken,
    restore: registerPushToken,
    operation,
  });
}

/**
 * Delete Account: abort in-flight register and seal client writes before the
 * callable. No Firestore set/delete — the backend owns account data.
 */
export async function sealPushTokenWritesForAccountDeletion(): Promise<void> {
  await sealDevicePushTokenSession(session);
}

export async function restorePushTokenWritesAfterAbortedDeletion(
  expectedUid: string | null,
): Promise<void> {
  await restoreDevicePushTokenIfCurrentUid(expectedUid);
}

export async function unregisterPushToken(token?: string) {
  if (!token) {
    await unregisterCurrentDevicePushToken();
    return;
  }
  try {
    await unregisterDevicePushToken({
      store: session,
      getUid: currentUid,
      resolveToken: async () => token,
      deleteToken,
    });
  } catch (err) {
    if (__DEV__) {
      console.warn('[PushTokens] unregisterPushToken error:', err);
    }
  }
}

// Android push-token persistence backed by RNFirebase Firestore.
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

import { firebaseAuth, firestoreDb } from '../config/firebaseConfig.android';
import {
  createPushTokenSessionStore,
  registerDevicePushToken,
  unregisterDevicePushToken,
  type RegisterPushTokenResult,
} from './pushTokenLifecycle';

const session = createPushTokenSessionStore();

type RegisterResult = RegisterPushTokenResult;

function currentUid(): string | null {
  return firebaseAuth.currentUser?.uid ?? null;
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
 * Must run before Firebase signOut or a same-process account switch.
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

/** Alias used at Android sign-in sites so a pending register cannot land on the outgoing UID. */
export async function releaseOutgoingDevicePushToken(): Promise<void> {
  await unregisterCurrentDevicePushToken();
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

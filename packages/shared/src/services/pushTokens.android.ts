// Android push-token persistence backed by RNFirebase Firestore.
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

import { firebaseAuth, firestoreDb } from '../config/firebaseConfig.android';

type RegisterResult =
  | { ok: true; token: string }
  | { ok: false; reason: string };

export async function registerPushToken(): Promise<RegisterResult> {
  try {
    const user = firebaseAuth.currentUser;
    if (!user) return { ok: false, reason: 'no-user' };

    // Read existing OS permission only — never prompt here.
    // Native authorization is owned by the dedicated CRJ notifications step.
    // App auth bootstrap / Alerts may still register a token once permission
    // is already granted (Android 13+ POST_NOTIFICATIONS included).
    const current = await Notifications.getPermissionsAsync();
    const granted =
      current.granted ||
      current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;

    if (!granted) return { ok: false, reason: 'permission-not-granted' };

    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ||
      Constants?.easConfig?.projectId;

    if (!projectId && __DEV__) {
      console.warn('[PushTokens] Missing EAS projectId');
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );

    if (!token) return { ok: false, reason: 'no-token' };

    const stillUser = firebaseAuth.currentUser;
    if (!stillUser) return { ok: false, reason: 'user-changed' };

    const userRef = firestoreDb.collection('users').doc(stillUser.uid);
    const tokenRef = userRef.collection('pushTokens').doc(token);

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

    return { ok: true, token };
  } catch (err) {
    if (__DEV__) {
      console.warn('[PushTokens] registerPushToken error:', err);
    }
    return { ok: false, reason: 'exception' };
  }
}

export async function unregisterPushToken(token?: string) {
  try {
    const user = firebaseAuth.currentUser;
    if (!user || !token) return;

    const userRef = firestoreDb.collection('users').doc(user.uid);
    const tokenRef = userRef.collection('pushTokens').doc(token);

    await tokenRef.delete();
  } catch (err) {
    if (__DEV__) {
      console.warn('[PushTokens] unregisterPushToken error:', err);
    }
  }
}

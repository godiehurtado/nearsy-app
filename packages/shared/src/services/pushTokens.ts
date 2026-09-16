// src/services/pushTokens.ts  ✅ Web Firestore + RNFirebase Auth
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

import { firebaseAuth, firestoreDb } from '../config/firebaseConfig';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';

type RegisterResult =
  | { ok: true; token: string }
  | { ok: false; reason: string };

export async function registerPushToken(): Promise<RegisterResult> {
  try {
    const user = firebaseAuth.currentUser;
    if (!user) return { ok: false, reason: 'no-user' };

    // 1) Permisos (iOS + Android 13+)
    const current = await Notifications.getPermissionsAsync();
    let granted =
      current.granted ||
      current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;

    if (!granted) {
      const req = await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowBadge: true, allowSound: true },
      });
      granted =
        req.granted ||
        req.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
    }

    if (!granted) return { ok: false, reason: 'denied' };

    // 2) Obtener Expo push token
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

    // Double-check: el usuario pudo cambiar durante el await
    const stillUser = firebaseAuth.currentUser;
    if (!stillUser) return { ok: false, reason: 'user-changed' };

    // 3) Guardar token como docId (idempotente)
    const ref = doc(firestoreDb, 'users', stillUser.uid, 'pushTokens', token);

    await setDoc(
      ref,
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

/**
 * Llama esto al hacer logout para limpiar el token actual (opcional pero recomendado).
 * Si no tienes el token en memoria, puedes pasar el que devuelve registerPushToken().
 */
export async function unregisterPushToken(token?: string) {
  try {
    const user = firebaseAuth.currentUser;
    if (!user || !token) return;

    const ref = doc(firestoreDb, 'users', user.uid, 'pushTokens', token);
    await deleteDoc(ref);
  } catch (err) {
    if (__DEV__) {
      console.warn('[PushTokens] unregisterPushToken error:', err);
    }
  }
}

// src/services/pushTokens.ts
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { getAuth } from 'firebase/auth';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { firestore } from '../config/firebaseConfig';

type RegisterResult =
  | { ok: true; token: string }
  | { ok: false; reason: string };

export async function registerPushToken(): Promise<RegisterResult> {
  try {
    const user = getAuth().currentUser;
    if (!user) return { ok: false, reason: 'no-user' };

    // 1) Permisos (iOS + Android 13+)
    const current = await Notifications.getPermissionsAsync();
    let granted =
      current.granted ||
      current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;

    if (!granted) {
      const req = await Notifications.requestPermissionsAsync({
        // iOS options; en Android se ignoran de forma segura
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
      // en producción simplemente seguimos intentando sin log
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );

    if (!token) return { ok: false, reason: 'no-token' };

    // Double-check: el usuario pudo cambiar durante el await
    const stillUser = getAuth().currentUser;
    if (!stillUser) return { ok: false, reason: 'user-changed' };

    // 3) Guardar token como docId (idempotente)
    const ref = doc(firestore, 'users', stillUser.uid, 'pushTokens', token);
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
    const user = getAuth().currentUser;
    if (!user || !token) return;

    await deleteDoc(doc(firestore, 'users', user.uid, 'pushTokens', token));
  } catch (err) {
    if (__DEV__) {
      console.warn('[PushTokens] unregisterPushToken error:', err);
    }
  }
}

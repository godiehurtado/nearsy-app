// packages/shared/src/config/firebaseConfig.android.ts
// Hybrid: RNFirebase auth + native Firestore for Android services;
// Web SDK Firestore for shared screens using firebase/firestore doc/onSnapshot.
import Constants from 'expo-constants';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import storage from '@react-native-firebase/storage';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';

type Extra = Record<string, unknown>;

const extra: Extra =
  (Constants.expoConfig?.extra as Extra) ??
  ((Constants as { manifest2?: { extra?: Extra } }).manifest2?.extra as Extra) ??
  {};

function pick(name: string): string | undefined {
  const fromExtra = extra?.[name];
  if (typeof fromExtra === 'string' && fromExtra) return fromExtra;
  const fromEnv = process.env[name];
  return typeof fromEnv === 'string' && fromEnv ? fromEnv : undefined;
}

const firebaseWebConfig = {
  apiKey: pick('EXPO_PUBLIC_FIREBASE_API_KEY'),
  authDomain: pick('EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN'),
  projectId: pick('EXPO_PUBLIC_FIREBASE_PROJECT_ID'),
  storageBucket: pick('EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: pick('EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'),
  appId: pick('EXPO_PUBLIC_FIREBASE_APP_ID'),
};

let cachedFirestoreWeb: Firestore | null = null;

function getFirestoreWebDb(): Firestore {
  if (cachedFirestoreWeb) return cachedFirestoreWeb;
  const { projectId, apiKey, appId } = firebaseWebConfig;
  if (!projectId || !apiKey || !appId) {
    throw new Error(
      '[firebaseConfig.android] Missing EXPO_PUBLIC_FIREBASE_* for Web Firestore.',
    );
  }
  const webApp = getApps().length ? getApp() : initializeApp(firebaseWebConfig);
  cachedFirestoreWeb = getFirestore(webApp);
  return cachedFirestoreWeb;
}

export const firebaseAuth = auth();
/** RNFirebase — used by Android-native services (db.android, firestoreService.android). */
export const firestoreDb = firestore();
/** Web SDK — used by shared screens importing doc/onSnapshot from firebase/firestore. */
export const firestoreWebDb = getFirestoreWebDb();
export const storageWeb = storage();

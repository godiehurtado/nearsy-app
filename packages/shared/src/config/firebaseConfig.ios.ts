// packages/shared/src/config/firebaseConfig.ios.ts
import Constants from 'expo-constants';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// Metro resolves firebase/auth to the RN bundle; tsc uses browser-facing typings, so getReactNativePersistence is missing from types.
// @ts-expect-error TS2305 — RN-only export; runtime matches Firebase v10 + Expo
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';

type Extra = Record<string, any>;

// En Expo moderno: expoConfig.extra
// En algunos casos: manifest2.extra (dependiendo del runtime)
const extra: Extra =
  (Constants.expoConfig?.extra as Extra) ??
  ((Constants as any).manifest2?.extra as Extra) ??
  {};

function pick(name: string) {
  return extra?.[name] ?? process.env[name];
}

function assertEnv(name: string, value: string | undefined) {
  if (!value) throw new Error(`[firebaseConfig.ios] Missing env var: ${name}`);
}

const firebaseWebConfig = {
  apiKey: pick('EXPO_PUBLIC_FIREBASE_API_KEY') as string | undefined,
  authDomain: pick('EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN') as string | undefined,
  projectId: pick('EXPO_PUBLIC_FIREBASE_PROJECT_ID') as string | undefined,
  storageBucket: pick('EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET') as
    | string
    | undefined,
  messagingSenderId: pick('EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID') as
    | string
    | undefined,
  appId: pick('EXPO_PUBLIC_FIREBASE_APP_ID') as string | undefined,
};

assertEnv('EXPO_PUBLIC_FIREBASE_API_KEY', firebaseWebConfig.apiKey);
assertEnv('EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN', firebaseWebConfig.authDomain);
assertEnv('EXPO_PUBLIC_FIREBASE_PROJECT_ID', firebaseWebConfig.projectId);
assertEnv(
  'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET',
  firebaseWebConfig.storageBucket,
);
assertEnv(
  'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  firebaseWebConfig.messagingSenderId,
);
assertEnv('EXPO_PUBLIC_FIREBASE_APP_ID', firebaseWebConfig.appId);

const webApp = getApps().length ? getApp() : initializeApp(firebaseWebConfig);

// ✅ Auth con persistencia RN
export const firebaseAuth = initializeAuth(webApp, {
  persistence: getReactNativePersistence(ReactNativeAsyncStorage as any),
});

export const firestoreDb = getFirestore(webApp);
export const storageWeb = getStorage(webApp);

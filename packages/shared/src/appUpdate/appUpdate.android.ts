/**
 * Android `getAppUpdatePolicy` client.
 * Visibility-discovery Functions, us-central1, App Check on, Auth not required.
 * Errors fail closed (caller skips the notice). Does not enable the server policy.
 */

import { getApp } from '@react-native-firebase/app';
import { getFunctions } from '@react-native-firebase/functions';

import {
  ensureAppCheckInitialized,
  getAppCheckInitStatus,
} from '../config/appCheckBootstrap';
import {
  APP_UPDATE_CALLABLE_NAME,
  APP_UPDATE_FUNCTIONS_REGION,
  type AppUpdatePlatform,
} from './contract.ts';
import {
  ANDROID_APP_UPDATE_POLICY_REQUEST,
  parseStoreVersion,
} from './parsePolicy.ts';

async function ensureAppCheckReady(): Promise<void> {
  const status = await ensureAppCheckInitialized();
  if (status.status === 'ready' || getAppCheckInitStatus().status === 'ready') {
    return;
  }
  throw new Error('App Check is not ready.');
}

export async function fetchAppUpdatePolicy(_request?: {
  platform: AppUpdatePlatform;
}): Promise<unknown> {
  await ensureAppCheckReady();
  const callable = getFunctions(
    getApp(),
    APP_UPDATE_FUNCTIONS_REGION,
  ).httpsCallable(APP_UPDATE_CALLABLE_NAME);
  // Exact contract JSON. Do not forward extra keys, uid, or Auth.
  const result = await callable(ANDROID_APP_UPDATE_POLICY_REQUEST);
  return result.data;
}

export function readNativeStoreVersion(): string | null {
  try {
    const Constants =
      require('expo-constants').default ?? require('expo-constants');
    const raw =
      typeof Constants?.nativeAppVersion === 'string'
        ? Constants.nativeAppVersion
        : '';
    return parseStoreVersion(raw);
  } catch {
    return null;
  }
}

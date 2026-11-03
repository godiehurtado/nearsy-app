/**
 * Android `getAppUpdatePolicy` client (contract v2, Functions PR #43 @
 * 5e524d1cd2cfa7b3d58137bd5d07cda71e927a45).
 * Visibility-discovery Functions, us-central1, App Check on, Auth not required.
 * Errors fail open (caller skips the notice). Does not enable the server policy.
 */

import { getApp } from '@react-native-firebase/app';
import { getFunctions } from '@react-native-firebase/functions';

import {
  ensureAppCheckInitialized,
  getAppCheckInitStatus,
} from '../config/appCheckBootstrap';
import {
  resolveAndroidAppUpdateChannel,
  type AppUpdateChannelExtras,
} from './channel.ts';
import { parseBuild, parseMarketingVersion } from './compareVersions.ts';
import {
  APP_UPDATE_CALLABLE_NAME,
  APP_UPDATE_FUNCTIONS_REGION,
  type AndroidAppUpdateChannel,
  type AppUpdateReleaseTarget,
} from './contract.ts';
import type { AppUpdateFetchRequest } from './noticeSession.ts';

function expoConstants(): any {
  try {
    return require('expo-constants').default ?? require('expo-constants');
  } catch {
    return null;
  }
}

async function ensureAppCheckReady(): Promise<void> {
  const status = await ensureAppCheckInitialized();
  if (status.status === 'ready' || getAppCheckInitStatus().status === 'ready') {
    return;
  }
  throw new Error('App Check is not ready.');
}

/**
 * Forwards the exact request JSON built by the session (v2 `{ platform,
 * channel }`, or the pre-v2 `{ platform }` fallback). No uid, no Auth, no
 * extra keys.
 */
export async function fetchAppUpdatePolicy(
  request: AppUpdateFetchRequest,
): Promise<unknown> {
  await ensureAppCheckReady();
  const callable = getFunctions(
    getApp(),
    APP_UPDATE_FUNCTIONS_REGION,
  ).httpsCallable(APP_UPDATE_CALLABLE_NAME);
  const result = await callable(request);
  return result.data;
}

/**
 * Distribution channel baked into this install. See `channel.ts` for why this
 * is an explicit build-time extra and not inferred from Firebase / EAS profile.
 */
export function readNativeAppUpdateChannel(): AndroidAppUpdateChannel | null {
  try {
    const Constants = expoConstants();
    const extras = (Constants?.expoConfig?.extra ??
      null) as AppUpdateChannelExtras;
    return resolveAndroidAppUpdateChannel(extras);
  } catch {
    return null;
  }
}

/**
 * Installed release identity: Android `versionName` (`nativeAppVersion`) and
 * `versionCode` (`nativeBuildVersion`). `null` if either is unreadable.
 */
export function readNativeInstalledRelease(): AppUpdateReleaseTarget | null {
  try {
    const Constants = expoConstants();
    const marketingVersion = parseMarketingVersion(
      typeof Constants?.nativeAppVersion === 'string'
        ? Constants.nativeAppVersion
        : '',
    );
    const build = parseBuild(
      typeof Constants?.nativeBuildVersion === 'string'
        ? Constants.nativeBuildVersion
        : '',
    );
    return marketingVersion && build ? { marketingVersion, build } : null;
  } catch {
    return null;
  }
}

/**
 * Gated background location start/stop helpers for Android.
 * All FGS starts must pass visibility ∧ bgVisible ∧ permissions.
 */

import { Platform } from 'react-native';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  startBackgroundLocation,
  stopBackgroundLocation as stopBackgroundLocationService,
  BackgroundLocationPermissionError,
  isBackgroundLocationPermissionError,
} from '../services/backgroundLocation';
import {
  decideBackgroundPublication,
  requiresSettingsForBackgroundPermission,
  isAndroidFineLocationGranted,
  shouldStartBackgroundLocationService,
} from './backgroundPublicationGate';
import {
  clearBackgroundRuntimeAuth,
  setBackgroundRuntimeAuth,
} from './backgroundRuntimeAuth';

export {
  BackgroundLocationPermissionError,
  isBackgroundLocationPermissionError,
};

export async function stopBackgroundLocation(): Promise<void> {
  await stopBackgroundLocationService();
  await clearBackgroundRuntimeAuth().catch(() => {});
}

export type LocationPermissionSnapshot = {
  foregroundStatus: string;
  backgroundStatus: string;
  foregroundGranted: boolean;
  backgroundGranted: boolean;
  foregroundCanAskAgain: boolean;
  backgroundCanAskAgain: boolean;
  androidAccuracy: 'fine' | 'coarse' | 'none' | null;
  fineLocationGranted: boolean;
};

export async function getLocationPermissionSnapshot(): Promise<LocationPermissionSnapshot> {
  const fg = await Location.getForegroundPermissionsAsync();
  const bg = await Location.getBackgroundPermissionsAsync();
  const androidAccuracy =
    ((fg as { android?: { accuracy?: string } }).android?.accuracy as
      | 'fine'
      | 'coarse'
      | 'none'
      | undefined) ?? null;
  return {
    foregroundStatus: String(fg.status),
    backgroundStatus: String(bg.status),
    foregroundGranted: fg.status === 'granted' || !!fg.granted,
    backgroundGranted: bg.status === 'granted' || !!bg.granted,
    foregroundCanAskAgain: !!fg.canAskAgain,
    backgroundCanAskAgain: !!bg.canAskAgain,
    androidAccuracy,
    fineLocationGranted: isAndroidFineLocationGranted(androidAccuracy),
  };
}

export type GatedStartResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | 'gate'
        | 'foreground-denied'
        | 'background-denied'
        | 'needs-settings'
        | 'error';
      gateReason?: string;
      canAskAgain?: boolean;
      error?: unknown;
    };

export type GatedStartOpts = {
  uid: string;
  visibility: boolean;
  bgVisible: boolean;
  /** When true, attempt OS background request / Settings path. */
  requestPermissions?: boolean;
  notificationTitle?: string;
  notificationBody?: string;
};

/**
 * Start FGS/task only when authenticated gates + OS permissions allow.
 * Does not persist Firestore bgVisible — caller owns preference writes.
 */
export async function startGatedBackgroundLocation(
  opts: GatedStartOpts,
): Promise<GatedStartResult> {
  if (Platform.OS === 'web') {
    return { ok: false, reason: 'gate', gateReason: 'unsupported' };
  }

  const snap = await getLocationPermissionSnapshot();

  if (opts.requestPermissions && !snap.foregroundGranted) {
    let fg = await Location.getForegroundPermissionsAsync();
    if (fg.status !== 'granted' && (fg.status === 'undetermined' || fg.canAskAgain)) {
      fg = await Location.requestForegroundPermissionsAsync();
    }
    if (fg.status !== 'granted') {
      return {
        ok: false,
        reason: 'foreground-denied',
        canAskAgain: !!fg.canAskAgain,
      };
    }
  }

  let bgSnap = await getLocationPermissionSnapshot();

  if (opts.requestPermissions && !bgSnap.backgroundGranted) {
    const apiLevel = Platform.Version;
    if (requiresSettingsForBackgroundPermission(apiLevel)) {
      // Android 11+: do not pretend a dialog can grant "all the time".
      // Caller should open Settings after disclosure.
      return {
        ok: false,
        reason: 'needs-settings',
        canAskAgain: false,
      };
    }
    let bg = await Location.getBackgroundPermissionsAsync();
    if (bg.status !== 'granted' && (bg.status === 'undetermined' || bg.canAskAgain)) {
      bg = await Location.requestBackgroundPermissionsAsync();
    }
    if (bg.status !== 'granted') {
      return {
        ok: false,
        reason: 'background-denied',
        canAskAgain: false,
      };
    }
    bgSnap = await getLocationPermissionSnapshot();
  }

  if (!bgSnap.fineLocationGranted) {
    await stopBackgroundLocation().catch(() => {});
    return { ok: false, reason: 'gate', gateReason: 'approximate' };
  }

  const decision = decideBackgroundPublication({
    authenticated: true,
    visibility: opts.visibility,
    bgVisible: opts.bgVisible,
    foregroundGranted: bgSnap.foregroundGranted,
    fineLocationGranted: bgSnap.fineLocationGranted,
    backgroundGranted: bgSnap.backgroundGranted,
    storedTaskUid: opts.uid,
    currentUid: opts.uid,
  });

  if (decision.action === 'stop' || decision.action === 'skip') {
    await stopBackgroundLocation().catch(() => {});
    return { ok: false, reason: 'gate', gateReason: decision.reason };
  }

  if (!shouldStartBackgroundLocationService({
    authenticated: true,
    visibility: opts.visibility,
    bgVisible: opts.bgVisible,
    foregroundGranted: bgSnap.foregroundGranted,
    fineLocationGranted: bgSnap.fineLocationGranted,
    backgroundGranted: bgSnap.backgroundGranted,
  })) {
    await stopBackgroundLocation().catch(() => {});
    return { ok: false, reason: 'gate', gateReason: 'blocked' };
  }

  try {
    await startBackgroundLocation({
      uid: opts.uid,
      notificationTitle: opts.notificationTitle,
      notificationBody: opts.notificationBody,
    });
    await setBackgroundRuntimeAuth({
      uid: opts.uid,
      allowedAt: Date.now(),
      visibility: true,
      bgVisible: true,
    });
    return { ok: true };
  } catch (error) {
    await clearBackgroundRuntimeAuth().catch(() => {});
    if (isBackgroundLocationPermissionError(error)) {
      return {
        ok: false,
        reason:
          error.code === 'foreground-denied'
            ? 'foreground-denied'
            : 'background-denied',
        canAskAgain: error.canAskAgain,
        error,
      };
    }
    return { ok: false, reason: 'error', error };
  }
}

/**
 * After Settings return: start only if gates + both permissions granted.
 */
export async function resumeGatedBackgroundLocationAfterSettings(opts: {
  uid: string;
  visibility: boolean;
  bgVisiblePreference: boolean;
  notificationTitle?: string;
  notificationBody?: string;
}): Promise<GatedStartResult> {
  const snap = await getLocationPermissionSnapshot();
  if (!snap.foregroundGranted || !snap.backgroundGranted) {
    await stopBackgroundLocation().catch(() => {});
    return {
      ok: false,
      reason: !snap.foregroundGranted ? 'foreground-denied' : 'background-denied',
      canAskAgain: false,
    };
  }
  return startGatedBackgroundLocation({
    uid: opts.uid,
    visibility: opts.visibility,
    bgVisible: opts.bgVisiblePreference,
    requestPermissions: false,
    notificationTitle: opts.notificationTitle,
    notificationBody: opts.notificationBody,
  });
}

export async function readStoredBackgroundTaskUid(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem('NEARSY_BG_UID');
  } catch {
    return null;
  }
}

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
import {
  getPublicationSessionPhase,
  isPublicationRuntimeOpen,
} from './publicationSession';
import { BG_LOCATION_TASK } from '../background/locationTask.android';
import {
  classifyAndroidStartBlock,
  recordPresenceEvent,
} from '../background/presenceDiagnostics';

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

async function readTaskStarted(): Promise<boolean | undefined> {
  try {
    return await Location.hasStartedLocationUpdatesAsync(BG_LOCATION_TASK);
  } catch {
    return undefined;
  }
}

async function haltBackgroundLocation(): Promise<void> {
  await stopBackgroundLocationService();
  await clearBackgroundRuntimeAuth().catch(() => {});
}

async function noteStartResult(
  result: GatedStartResult,
  alreadyStarted?: boolean,
): Promise<GatedStartResult> {
  if (result.ok === true) {
    if (alreadyStarted !== true) {
      await recordPresenceEvent({
        event: 'start_ok',
        platform: 'android',
        started: true,
      });
    }
    return result;
  }
  const reason = result.reason;
  const gateReason = result.gateReason;
  await recordPresenceEvent({
    event: 'start_blocked',
    platform: 'android',
    block: classifyAndroidStartBlock(reason, gateReason),
    started: false,
  });
  return result;
}

export {
  BackgroundLocationPermissionError,
  isBackgroundLocationPermissionError,
};

export async function stopBackgroundLocation(): Promise<void> {
  const started = await readTaskStarted();
  if (started !== false) {
    await recordPresenceEvent({
      event: 'stop',
      platform: 'android',
      stop: 'other',
      started,
    });
  }
  await haltBackgroundLocation();
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
    return noteStartResult({ ok: false, reason: 'gate', gateReason: 'unsupported' });
  }

  // FGS only after this session's confirmed activate/publish for this uid.
  if (
    getPublicationSessionPhase() !== 'unbound' &&
    !isPublicationRuntimeOpen(opts.uid)
  ) {
    return noteStartResult({ ok: false, reason: 'gate', gateReason: 'session-unconfirmed' });
  }

  const snap = await getLocationPermissionSnapshot();

  if (opts.requestPermissions && !snap.foregroundGranted) {
    let fg = await Location.getForegroundPermissionsAsync();
    if (fg.status !== 'granted' && (fg.status === 'undetermined' || fg.canAskAgain)) {
      fg = await Location.requestForegroundPermissionsAsync();
    }
    if (fg.status !== 'granted') {
      return noteStartResult({
        ok: false,
        reason: 'foreground-denied',
        canAskAgain: !!fg.canAskAgain,
      });
    }
  }

  let bgSnap = await getLocationPermissionSnapshot();

  if (opts.requestPermissions && !bgSnap.backgroundGranted) {
    const apiLevel = Platform.Version;
    if (requiresSettingsForBackgroundPermission(apiLevel)) {
      // Android 11+: do not pretend a dialog can grant "all the time".
      // Caller should open Settings after disclosure.
      return noteStartResult({
        ok: false,
        reason: 'needs-settings',
        canAskAgain: false,
      });
    }
    let bg = await Location.getBackgroundPermissionsAsync();
    if (bg.status !== 'granted' && (bg.status === 'undetermined' || bg.canAskAgain)) {
      bg = await Location.requestBackgroundPermissionsAsync();
    }
    if (bg.status !== 'granted') {
      return noteStartResult({
        ok: false,
        reason: 'background-denied',
        canAskAgain: false,
      });
    }
    bgSnap = await getLocationPermissionSnapshot();
  }

  if (!bgSnap.fineLocationGranted) {
    await haltBackgroundLocation().catch(() => {});
    return noteStartResult({ ok: false, reason: 'gate', gateReason: 'approximate' });
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
    await haltBackgroundLocation().catch(() => {});
    return noteStartResult({ ok: false, reason: 'gate', gateReason: decision.reason });
  }

  if (!shouldStartBackgroundLocationService({
    authenticated: true,
    visibility: opts.visibility,
    bgVisible: opts.bgVisible,
    foregroundGranted: bgSnap.foregroundGranted,
    fineLocationGranted: bgSnap.fineLocationGranted,
    backgroundGranted: bgSnap.backgroundGranted,
  })) {
    await haltBackgroundLocation().catch(() => {});
    return noteStartResult({ ok: false, reason: 'gate', gateReason: 'blocked' });
  }

  try {
    const alreadyStarted = await readTaskStarted();
    await startBackgroundLocation({
      uid: opts.uid,
      notificationTitle: opts.notificationTitle,
      notificationBody: opts.notificationBody,
    });
    if (
      getPublicationSessionPhase() !== 'unbound' &&
      !isPublicationRuntimeOpen(opts.uid)
    ) {
      // Session closed (logout / uid change) while the service was starting.
      await haltBackgroundLocation().catch(() => {});
      return noteStartResult({ ok: false, reason: 'gate', gateReason: 'session-unconfirmed' });
    }
    await setBackgroundRuntimeAuth({
      uid: opts.uid,
      allowedAt: Date.now(),
      visibility: true,
      bgVisible: true,
    });
    return noteStartResult({ ok: true }, alreadyStarted === true);
  } catch (error) {
    await clearBackgroundRuntimeAuth().catch(() => {});
    if (isBackgroundLocationPermissionError(error)) {
      return noteStartResult({
        ok: false,
        reason:
          error.code === 'foreground-denied'
            ? 'foreground-denied'
            : 'background-denied',
        canAskAgain: error.canAskAgain,
        error,
      });
    }
    return noteStartResult({ ok: false, reason: 'error', error });
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
    await haltBackgroundLocation().catch(() => {});
    return noteStartResult({
      ok: false,
      reason: !snap.foregroundGranted ? 'foreground-denied' : 'background-denied',
      canAskAgain: false,
    });
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

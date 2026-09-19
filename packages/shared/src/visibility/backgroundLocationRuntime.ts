/**
 * ENH-LOC-01 — permission helpers and background runtime gates.
 *
 * Runtime publication requires:
 *   authenticated uid
 *   AND visibility === true
 *   AND bgVisible === true
 *   AND valid foreground + background permissions
 */

import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  BackgroundLocationPermissionError,
  isBackgroundLocationPermissionError,
  startBackgroundLocation,
  stopBackgroundLocation,
} from '../services/backgroundLocation';

export { BackgroundLocationPermissionError, isBackgroundLocationPermissionError };

/** Set only while a gated background runtime is actively allowed. */
export const BG_RUNTIME_ALLOWED_KEY = 'NEARSY_BG_RUNTIME_ALLOWED' as const;

export type LocationPermissionSnapshot = {
  status: string;
  granted: boolean;
  canAskAgain: boolean;
  /** iOS Allow Once / session grant when expires !== 'never'. */
  sessionOnly: boolean;
  iosScope: 'whenInUse' | 'always' | 'none' | null;
};

export function isSessionOnlyGrant(expires: unknown): boolean {
  return expires !== 'never';
}

export function snapshotFromPermissionResponse(perm: {
  status: string;
  granted?: boolean;
  canAskAgain?: boolean;
  expires?: unknown;
  ios?: { scope?: string };
}): LocationPermissionSnapshot {
  const scope = perm.ios?.scope;
  const iosScope =
    scope === 'whenInUse' || scope === 'always' || scope === 'none'
      ? scope
      : null;
  return {
    status: String(perm.status),
    granted: !!perm.granted || perm.status === 'granted',
    canAskAgain: !!perm.canAskAgain,
    sessionOnly: isSessionOnlyGrant(perm.expires),
    iosScope,
  };
}

export async function readForegroundPermissionSnapshot(): Promise<LocationPermissionSnapshot> {
  const perm = await Location.getForegroundPermissionsAsync();
  return snapshotFromPermissionResponse(perm);
}

export async function readBackgroundPermissionSnapshot(): Promise<LocationPermissionSnapshot> {
  const perm = await Location.getBackgroundPermissionsAsync();
  return snapshotFromPermissionResponse(perm);
}

export async function locationServicesEnabled(): Promise<boolean> {
  try {
    return await Location.hasServicesEnabledAsync();
  } catch {
    return true;
  }
}

export type BackgroundRuntimeGates = {
  uid: string | null | undefined;
  visibilityOn: boolean;
  bgVisible: boolean;
};

export function shouldRunBackgroundLocationRuntime(
  gates: BackgroundRuntimeGates,
): gates is BackgroundRuntimeGates & { uid: string } {
  return (
    typeof gates.uid === 'string' &&
    gates.uid.length > 0 &&
    gates.visibilityOn === true &&
    gates.bgVisible === true
  );
}

async function markRuntimeAllowed(uid: string): Promise<void> {
  await AsyncStorage.setItem(BG_RUNTIME_ALLOWED_KEY, uid);
}

async function clearRuntimeAllowed(): Promise<void> {
  await AsyncStorage.removeItem(BG_RUNTIME_ALLOWED_KEY);
}

export async function readBackgroundRuntimeAllowedUid(): Promise<string | null> {
  const raw = await AsyncStorage.getItem(BG_RUNTIME_ALLOWED_KEY);
  return raw && raw.trim() ? raw.trim() : null;
}

/**
 * Start or stop the background task according to hard gates + live permissions.
 * Never requests permissions (callers educate + request first).
 */
export async function syncBackgroundLocationRuntime(
  gates: BackgroundRuntimeGates,
): Promise<'started' | 'stopped'> {
  if (!shouldRunBackgroundLocationRuntime(gates)) {
    await stopBackgroundLocation().catch(() => {});
    await clearRuntimeAllowed();
    return 'stopped';
  }

  const fg = await readForegroundPermissionSnapshot();
  const bg = await readBackgroundPermissionSnapshot();
  if (!fg.granted || !bg.granted) {
    await stopBackgroundLocation().catch(() => {});
    await clearRuntimeAllowed();
    return 'stopped';
  }

  // Allow Once / session FG is fine for foreground Visibility, but Always is
  // required for durable background. If BG status is granted, proceed.
  try {
    await startBackgroundLocation({
      uid: gates.uid,
      requestPermissions: false,
    });
    await markRuntimeAllowed(gates.uid);
    return 'started';
  } catch {
    await stopBackgroundLocation().catch(() => {});
    await clearRuntimeAllowed();
    return 'stopped';
  }
}

export type BackgroundLocationApplyResult = {
  ok: boolean;
  code?: 'foreground-denied' | 'background-denied' | 'services-off';
  canAskAgain?: boolean;
};

/**
 * Request Always after education. Persists nothing — caller writes bgVisible.
 * Does not start the task unless visibilityOn is true (via sync).
 */
export async function requestAndApplyBackgroundLocation(input: {
  uid: string;
  visibilityOn: boolean;
}): Promise<BackgroundLocationApplyResult> {
  const servicesOn = await locationServicesEnabled();
  if (!servicesOn) {
    return { ok: false, code: 'services-off', canAskAgain: false };
  }

  try {
    await startBackgroundLocation({
      uid: input.uid,
      requestPermissions: true,
    });
  } catch (err) {
    if (isBackgroundLocationPermissionError(err)) {
      return {
        ok: false,
        code: err.code,
        canAskAgain: err.canAskAgain,
      };
    }
    return { ok: false, code: 'background-denied', canAskAgain: true };
  }

  await syncBackgroundLocationRuntime({
    uid: input.uid,
    visibilityOn: input.visibilityOn,
    bgVisible: true,
  });
  return { ok: true };
}

/** True when BG task may publish for this uid (task-side gate). */
export async function isBackgroundPublishAllowedForUid(
  uid: string | null | undefined,
): Promise<boolean> {
  if (!uid) return false;
  const allowed = await readBackgroundRuntimeAllowedUid();
  if (allowed !== uid) return false;
  const storedUid = await AsyncStorage.getItem('NEARSY_BG_UID');
  return storedUid === uid;
}

export async function stopBackgroundLocationRuntime(): Promise<void> {
  await stopBackgroundLocation().catch(() => {});
  await clearRuntimeAllowed();
}

/**
 * Pure helper: first-time FG grant during an activate attempt.
 */
export function wasForegroundNewlyGranted(input: {
  beforeGranted: boolean;
  afterGranted: boolean;
}): boolean {
  return !input.beforeGranted && input.afterGranted;
}

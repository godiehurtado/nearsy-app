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
  ensureBackgroundLocationPermissions,
  startBackgroundLocation,
  stopBackgroundLocation,
} from '../services/backgroundLocation';
import {
  BG_RUNTIME_ALLOWED_KEY,
  isBackgroundPermissionEffectivelyGranted,
  isPublishAllowedByRuntimeFlags,
  shouldRunBackgroundLocationRuntime,
  snapshotFromPermissionResponse,
  type BackgroundRuntimeGates,
  type LocationPermissionSnapshot,
  wasForegroundNewlyGranted,
  reconcileBgVisibleWithBackgroundPermission,
} from './backgroundLocationRuntimeGates';

export {
  BackgroundLocationPermissionError,
  isBackgroundLocationPermissionError,
};
export {
  BG_RUNTIME_ALLOWED_KEY,
  isBackgroundPermissionEffectivelyGranted,
  isPublishAllowedByRuntimeFlags,
  isSessionOnlyGrant,
  shouldRunBackgroundLocationRuntime,
  snapshotFromPermissionResponse,
  wasForegroundNewlyGranted,
  reconcileBgVisibleWithBackgroundPermission,
  LOGOUT_CLEANUP_ORDER,
  type BackgroundRuntimeGates,
  type LocationPermissionSnapshot,
} from './backgroundLocationRuntimeGates';

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
  if (!fg.granted || !isBackgroundPermissionEffectivelyGranted(bg)) {
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
 * Re-reads effective background status after the OS prompt (deferred/denied → fail).
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
    await ensureBackgroundLocationPermissions(true);
  } catch (err) {
    // Re-read before failing — iOS may already reflect Always via scope.
    const afterErr = await readBackgroundPermissionSnapshot();
    if (isBackgroundPermissionEffectivelyGranted(afterErr)) {
      await syncBackgroundLocationRuntime({
        uid: input.uid,
        visibilityOn: input.visibilityOn,
        bgVisible: true,
      });
      return { ok: true };
    }
    if (isBackgroundLocationPermissionError(err)) {
      return {
        ok: false,
        code: err.code,
        canAskAgain: err.canAskAgain,
      };
    }
    return { ok: false, code: 'background-denied', canAskAgain: true };
  }

  // Effective status after prompt — scope `always` counts even if status lags.
  const bg = await readBackgroundPermissionSnapshot();
  if (!isBackgroundPermissionEffectivelyGranted(bg)) {
    return {
      ok: false,
      code: 'background-denied',
      canAskAgain: bg.canAskAgain,
    };
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
  const storedUid = await AsyncStorage.getItem('NEARSY_BG_UID');
  return isPublishAllowedByRuntimeFlags({
    expectedUid: uid,
    taskUid: storedUid,
    allowedUid: allowed,
  });
}

export async function stopBackgroundLocationRuntime(): Promise<void> {
  await stopBackgroundLocation().catch(() => {});
  await clearRuntimeAllowed();
}

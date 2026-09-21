// src/background/locationTask.ts  ✅ RNFirebase-only — gated publication
//
// PUBLICATION CHANNEL (ENH-LOC-01 audit):
// This task still performs a *legacy direct Firestore merge* via
// buildLocationPayload (users/{uid}.location). It does NOT call the
// contractual publishLocation callable. Migrating the BG rail to the
// callable is intentionally out of scope for this PR (wide refactor).
//
// PERFORMANCE: no users/{uid}.get() per location callback. Profile/visibility
// are validated at start/reconcile and stored in NEARSY_BG_RUNTIME_AUTH.
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { firestoreDb, firebaseAuth } from '../config/firebaseConfig';
import { buildLocationPayload } from '../utils/locationPayload';
import {
  clearBackgroundRuntimeAuth,
  decideCallbackPublication,
  readBackgroundRuntimeAuth,
} from '../location/backgroundRuntimeAuth';

export const BG_LOCATION_TASK = 'nearsy-bg-location';

type LocationTaskData = {
  locations?: Location.LocationObject[];
};

async function stopTaskCleanly(): Promise<void> {
  try {
    const hasStarted =
      await Location.hasStartedLocationUpdatesAsync(BG_LOCATION_TASK);
    if (hasStarted) {
      await Location.stopLocationUpdatesAsync(BG_LOCATION_TASK);
    }
  } catch {
    // ignore
  } finally {
    try {
      await AsyncStorage.removeItem('NEARSY_BG_UID');
    } catch {
      // ignore
    }
    await clearBackgroundRuntimeAuth().catch(() => {});
  }
}

TaskManager.defineTask(BG_LOCATION_TASK, async ({ data, error }) => {
  try {
    if (error) {
      if (__DEV__) console.warn('[BG Task] error:', error);
      const message = String((error as { message?: string })?.message ?? error);
      if (
        /visibility-inactive|permission|denied|unauthorized/i.test(message)
      ) {
        await stopTaskCleanly();
      }
      return;
    }

    const { locations } = (data as LocationTaskData) ?? {};
    if (!locations?.length) return;

    const storedUid = await AsyncStorage.getItem('NEARSY_BG_UID');
    const authUid = firebaseAuth.currentUser?.uid ?? null;
    const runtimeAuth = await readBackgroundRuntimeAuth();

    const fg = await Location.getForegroundPermissionsAsync();
    const bg = await Location.getBackgroundPermissionsAsync();
    const foregroundGranted = fg.status === 'granted' || !!fg.granted;
    const backgroundGranted = bg.status === 'granted' || !!bg.granted;
    const androidAccuracy =
      ((fg as { android?: { accuracy?: string } }).android?.accuracy as
        | 'fine'
        | 'coarse'
        | 'none'
        | undefined) ?? null;
    const fineLocationGranted =
      androidAccuracy == null || androidAccuracy === 'fine';

    const decision = decideCallbackPublication({
      authUid,
      storedTaskUid: storedUid,
      runtimeAuth,
      foregroundGranted,
      fineLocationGranted,
      backgroundGranted,
    });

    if (decision === 'stop') {
      await stopTaskCleanly();
      return;
    }
    if (decision === 'skip' || !storedUid) return;

    // Last fix in batch only — avoid multi-write storms.
    const fix = locations[locations.length - 1];
    const { latitude, longitude } = fix.coords;

    try {
      const db = firestoreDb as any;
      const payload = buildLocationPayload(latitude, longitude, fix.coords);
      await db
        .collection('users')
        .doc(storedUid)
        .set({ ...payload, lastBgUpdateAt: Date.now() }, { merge: true });
    } catch (writeErr) {
      if (__DEV__) console.warn('[BG Task] persist error:', writeErr);
      const message = String(
        (writeErr as { message?: string; code?: string })?.message ?? writeErr,
      );
      const code = String((writeErr as { code?: string })?.code ?? '');
      if (
        /visibility-inactive/i.test(message) ||
        /visibility-inactive/i.test(code)
      ) {
        await stopTaskCleanly();
        return;
      }
      // Transient network / unknown: do not clear bgVisible; skip tick (no tight loop).
    }
  } catch (e) {
    if (__DEV__) console.warn('[BG Task] handler error:', e);
  }
});

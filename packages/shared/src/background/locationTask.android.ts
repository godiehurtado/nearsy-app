// src/background/locationTask.ts  ✅ RNFirebase-only — gated publication
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { firestoreDb, firebaseAuth } from '../config/firebaseConfig';
import { buildLocationPayload } from '../utils/locationPayload';
import { decideBackgroundPublication } from '../location/backgroundPublicationGate';

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
  }
}

TaskManager.defineTask(BG_LOCATION_TASK, async ({ data, error }) => {
  try {
    if (error) {
      if (__DEV__) console.warn('[BG Task] error:', error);
      // Backend / permission failures must not spin forever.
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
    if (!storedUid) {
      await stopTaskCleanly();
      return;
    }

    // Auth null / account switch: NEARSY_BG_UID alone must never publish.
    const authUid = firebaseAuth.currentUser?.uid ?? null;
    if (!authUid || authUid !== storedUid) {
      await stopTaskCleanly();
      return;
    }

    const fg = await Location.getForegroundPermissionsAsync();
    const bg = await Location.getBackgroundPermissionsAsync();
    const foregroundGranted = fg.status === 'granted' || !!fg.granted;
    const backgroundGranted = bg.status === 'granted' || !!bg.granted;

    // Re-validate Firestore preference + Visibility. NEARSY_BG_UID alone is not enough.
    let visibility = false;
    let bgVisible = false;
    try {
      const db = firestoreDb as any;
      const snap = await db.collection('users').doc(storedUid).get();
      const profile = snap?.exists ? snap.data() : null;
      visibility = !!profile?.visibility;
      bgVisible = !!profile?.bgVisible;
    } catch (e) {
      // Transient profile read failure: do not publish, do not clear preference.
      if (__DEV__) console.warn('[BG Task] profile read error:', e);
      return;
    }

    const decision = decideBackgroundPublication({
      authenticated: true,
      visibility,
      bgVisible,
      foregroundGranted,
      backgroundGranted,
      storedTaskUid: storedUid,
      currentUid: authUid,
    });

    if (decision.action !== 'publish' && decision.action !== 'start') {
      await stopTaskCleanly();
      return;
    }

    const fix = locations[locations.length - 1];
    const { latitude, longitude } = fix.coords;

    const db = firestoreDb as any;
    const payload = buildLocationPayload(latitude, longitude, fix.coords);
    await db
      .collection('users')
      .doc(storedUid)
      .set({ ...payload, lastBgUpdateAt: Date.now() }, { merge: true });
  } catch (e) {
    if (__DEV__) console.warn('[BG Task] persist error:', e);
    const message = String((e as { message?: string; code?: string })?.message ?? e);
    const code = String((e as { code?: string })?.code ?? '');
    if (
      /visibility-inactive/i.test(message) ||
      /visibility-inactive/i.test(code)
    ) {
      await stopTaskCleanly();
    }
  }
});

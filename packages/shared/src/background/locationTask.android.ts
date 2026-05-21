// src/background/locationTask.ts  ✅ RNFirebase-only
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { firestoreDb } from '../config/firebaseConfig';
import { buildLocationPayload } from '../utils/locationPayload';

export const BG_LOCATION_TASK = 'nearsy-bg-location';

type LocationTaskData = {
  locations?: Location.LocationObject[];
};

TaskManager.defineTask(BG_LOCATION_TASK, async ({ data, error }) => {
  try {
    if (error) {
      if (__DEV__) console.warn('[BG Task] error:', error);
      return;
    }

    const { locations } = (data as LocationTaskData) ?? {};
    if (!locations?.length) return;

    const uid = await AsyncStorage.getItem('NEARSY_BG_UID');
    if (!uid) return;

    const fix = locations[locations.length - 1];
    const { latitude, longitude } = fix.coords;

    const db = firestoreDb as any;
    const payload = buildLocationPayload(latitude, longitude, fix.coords);
    await db
      .collection('users')
      .doc(uid)
      .set({ ...payload, lastBgUpdateAt: Date.now() }, { merge: true });
  } catch (e) {
    if (__DEV__) console.warn('[BG Task] persist error:', e);
  }
});

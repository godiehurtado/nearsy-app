// src/background/locationTask.ts  ✅ RNFirebase-only
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { firestoreDb } from '../config/firebaseConfig';

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

    const now = Date.now();

    await firestoreDb
      .collection('users')
      .doc(uid)
      .set(
        {
          location: { lat: latitude, lng: longitude, updatedAt: now },
          updatedAt: now,
          lastBgUpdateAt: now,
        },
        { merge: true },
      );
  } catch (e) {
    if (__DEV__) console.warn('[BG Task] persist error:', e);
  }
});

// src/background/locationTask.ios.ts — Firebase Web SDK
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { dbSetUserMerge } from '../services/db';

export const BG_LOCATION_TASK = 'nearsy-bg-location';

type LocationTaskData = {
  locations?: Location.LocationObject[];
};

TaskManager.defineTask(BG_LOCATION_TASK, async ({ data, error }) => {
  try {
    if (error) {
      if (__DEV__) console.warn('[BG Task iOS] error:', error);
      return;
    }

    const { locations } = (data as LocationTaskData) ?? {};
    if (!locations?.length) return;

    const uid = await AsyncStorage.getItem('NEARSY_BG_UID');
    if (!uid) {
      if (__DEV__) console.warn('[BG Task iOS] missing uid');
      return;
    }

    const fix = locations[locations.length - 1];
    const { latitude, longitude, accuracy } = fix.coords;
    const now = Date.now();

    await dbSetUserMerge(uid, {
      location: {
        lat: latitude,
        lng: longitude,
        updatedAt: now,
        accuracy: accuracy ?? null,
      },
      updatedAt: now,
      lastBgUpdateAt: now,
    });
  } catch (e) {
    if (__DEV__) console.warn('[BG Task iOS] persist error:', e);
  }
});

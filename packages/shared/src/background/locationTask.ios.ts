// src/background/locationTask.ios.ts — publishLocation via Visibility callables
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
    const accuracyMeters =
      typeof accuracy === 'number' && Number.isFinite(accuracy) ? accuracy : 999;

    try {
      const { getVisibilityDiscoveryClient } = await import(
        '../visibility/iosVisibilityFoundation'
      );
      const { publishLocationFlow } = await import(
        '../visibility/orchestration'
      );
      const client = await getVisibilityDiscoveryClient();
      await publishLocationFlow(client, {
        latitude,
        longitude,
        accuracyMeters,
        observedAt: Date.now(),
      });
    } catch (e) {
      if (__DEV__) console.warn('[BG Task iOS] publishLocation error:', e);
    }
  } catch (e) {
    if (__DEV__) console.warn('[BG Task iOS] persist error:', e);
  }
});

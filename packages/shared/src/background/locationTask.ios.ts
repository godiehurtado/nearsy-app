// src/background/locationTask.ios.ts — publishLocation via Visibility callables
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { recordPresenceEvent } from './presenceDiagnostics';

export const BG_LOCATION_TASK = 'nearsy-bg-location';

/** Must stay in sync with BG_RUNTIME_ALLOWED_KEY in backgroundLocationRuntime.ts */
const BG_RUNTIME_ALLOWED_KEY = 'NEARSY_BG_RUNTIME_ALLOWED';

type LocationTaskData = {
  locations?: Location.LocationObject[];
};

TaskManager.defineTask(BG_LOCATION_TASK, async ({ data, error }) => {
  try {
    if (error) {
      if (__DEV__) console.warn('[BG Task iOS] error:', error);
      await recordPresenceEvent({
        event: 'skip',
        platform: 'ios',
        skip: 'runtime_gate',
      });
      return;
    }

    const { locations } = (data as LocationTaskData) ?? {};
    if (!locations?.length) {
      await recordPresenceEvent({
        event: 'skip',
        platform: 'ios',
        skip: 'empty_batch',
      });
      return;
    }

    const uid = await AsyncStorage.getItem('NEARSY_BG_UID');
    if (!uid) {
      if (__DEV__) console.warn('[BG Task iOS] missing uid');
      await recordPresenceEvent({
        event: 'skip',
        platform: 'ios',
        skip: 'runtime_gate',
      });
      return;
    }

    // Hard gate: never publish when Visibility runtime is not allowed.
    const allowedUid = await AsyncStorage.getItem(BG_RUNTIME_ALLOWED_KEY);
    if (allowedUid !== uid) {
      if (__DEV__) {
        console.warn('[BG Task iOS] publish blocked — runtime gate');
      }
      await recordPresenceEvent({
        event: 'skip',
        platform: 'ios',
        skip: 'runtime_gate',
      });
      return;
    }

    const fix = locations[locations.length - 1];
    const { latitude, longitude, accuracy } = fix.coords;
    const accuracyMeters =
      typeof accuracy === 'number' && Number.isFinite(accuracy) ? accuracy : 999;

    await recordPresenceEvent({
      event: 'callback',
      platform: 'ios',
      accuracyMeters,
    });

    try {
      const { getVisibilityDiscoveryClient } = await import(
        '../visibility/iosVisibilityFoundation'
      );
      const { publishLocationFlow } = await import(
        '../visibility/orchestration'
      );
      const client = await getVisibilityDiscoveryClient();
      const outcome = await publishLocationFlow(client, {
        latitude,
        longitude,
        accuracyMeters,
        observedAt: Date.now(),
      });
      if (outcome.ok === true) {
        if (__DEV__) {
          const confirmedAt =
            typeof outcome.response?.confirmedAt === 'number'
              ? outcome.response.confirmedAt
              : null;
          console.log('[BG Task iOS] publishLocation ok', {
            confirmedAt,
          });
        }
        await recordPresenceEvent({
          event: 'publish_ok',
          platform: 'ios',
          accuracyMeters,
        });
      } else if (outcome.ok === false) {
        if (__DEV__) {
          console.warn('[BG Task iOS] publishLocation soft-fail', outcome.kind);
        }
        if (outcome.kind === 'invalid-accuracy') {
          await recordPresenceEvent({
            event: 'skip',
            platform: 'ios',
            skip: 'invalid_accuracy',
            accuracyMeters,
          });
        } else {
          await recordPresenceEvent({
            event: 'publish_fail',
            platform: 'ios',
            skip: 'callable_retryable',
            accuracyMeters,
          });
        }
      }
    } catch (e) {
      if (__DEV__) console.warn('[BG Task iOS] publishLocation error:', e);
      await recordPresenceEvent({
        event: 'publish_fail',
        platform: 'ios',
        skip: 'callable_retryable',
        accuracyMeters,
      });
    }
  } catch (e) {
    if (__DEV__) console.warn('[BG Task iOS] persist error:', e);
  }
});

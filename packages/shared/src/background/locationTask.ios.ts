// src/background/locationTask.ios.ts — publishLocation via Visibility callables
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  applyBgPublishProbeAttempt,
  BG_PUBLISH_PROBE_KEY,
  parseBgPublishProbe,
} from '../visibility/backgroundPublishProbe';

export const BG_LOCATION_TASK = 'nearsy-bg-location';

/** Must stay in sync with BG_RUNTIME_ALLOWED_KEY in backgroundLocationRuntime.ts */
const BG_RUNTIME_ALLOWED_KEY = 'NEARSY_BG_RUNTIME_ALLOWED';

type LocationTaskData = {
  locations?: Location.LocationObject[];
};

async function recordBgPublishProbe(input: {
  ok: boolean;
  kind: string | null;
  confirmedAt?: number | null;
}): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(BG_PUBLISH_PROBE_KEY);
    const prev = parseBgPublishProbe(raw);
    const next = applyBgPublishProbeAttempt(prev, {
      nowMs: Date.now(),
      ok: input.ok,
      kind: input.kind,
      confirmedAt: input.confirmedAt ?? null,
    });
    await AsyncStorage.setItem(BG_PUBLISH_PROBE_KEY, JSON.stringify(next));
  } catch {
    // probe must never break the task
  }
}

TaskManager.defineTask(BG_LOCATION_TASK, async ({ data, error }) => {
  try {
    if (error) {
      if (__DEV__) console.warn('[BG Task iOS] error:', error);
      await recordBgPublishProbe({ ok: false, kind: 'task-error' });
      return;
    }

    const { locations } = (data as LocationTaskData) ?? {};
    if (!locations?.length) return;

    const uid = await AsyncStorage.getItem('NEARSY_BG_UID');
    if (!uid) {
      if (__DEV__) console.warn('[BG Task iOS] missing uid');
      await recordBgPublishProbe({ ok: false, kind: 'missing-uid' });
      return;
    }

    // Hard gate: never publish when Visibility runtime is not allowed.
    const allowedUid = await AsyncStorage.getItem(BG_RUNTIME_ALLOWED_KEY);
    if (allowedUid !== uid) {
      if (__DEV__) {
        console.warn('[BG Task iOS] publish blocked — runtime gate');
      }
      await recordBgPublishProbe({ ok: false, kind: 'runtime-gate' });
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
      const outcome = await publishLocationFlow(client, {
        latitude,
        longitude,
        accuracyMeters,
        observedAt: Date.now(),
      });
      if (outcome.ok) {
        const confirmedAt =
          typeof outcome.response?.confirmedAt === 'number'
            ? outcome.response.confirmedAt
            : null;
        await recordBgPublishProbe({
          ok: true,
          kind: 'ok',
          confirmedAt,
        });
        if (__DEV__) {
          console.log('[BG Task iOS] publishLocation ok', {
            confirmedAt,
          });
        }
      } else {
        await recordBgPublishProbe({
          ok: false,
          kind: outcome.kind,
        });
        if (__DEV__) {
          console.warn('[BG Task iOS] publishLocation soft-fail', outcome.kind);
        }
      }
    } catch (e) {
      await recordBgPublishProbe({ ok: false, kind: 'exception' });
      if (__DEV__) console.warn('[BG Task iOS] publishLocation error:', e);
    }
  } catch (e) {
    if (__DEV__) console.warn('[BG Task iOS] persist error:', e);
  }
});

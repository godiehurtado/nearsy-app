// src/background/locationTask.ios.ts — publishLocation via Visibility callables
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  BG_LAST_PUBLISH_KEY,
  createBgPublishThrottle,
  type BgFix,
} from './bgPublishThrottle';

export const BG_LOCATION_TASK = 'nearsy-bg-location';

/** Must stay in sync with BG_RUNTIME_ALLOWED_KEY in backgroundLocationRuntime.ts */
const BG_RUNTIME_ALLOWED_KEY = 'NEARSY_BG_RUNTIME_ALLOWED';

type LocationTaskData = {
  locations?: Location.LocationObject[];
};

const BG_UID_KEY = 'NEARSY_BG_UID';

/** Session + Visibility runtime gate: the uid allowed to publish, or null. */
async function readGateUid(): Promise<string | null> {
  const uid = await AsyncStorage.getItem(BG_UID_KEY);
  if (!uid) return null;
  const allowedUid = await AsyncStorage.getItem(BG_RUNTIME_ALLOWED_KEY);
  return allowedUid === uid ? uid : null;
}

async function publishFix(_uid: string, fix: BgFix): Promise<boolean> {
  try {
    const { getVisibilityDiscoveryClient } = await import(
      '../visibility/iosVisibilityFoundation'
    );
    const { publishLocationFlow } = await import('../visibility/orchestration');
    const client = await getVisibilityDiscoveryClient();
    const outcome = await publishLocationFlow(client, {
      latitude: fix.latitude,
      longitude: fix.longitude,
      accuracyMeters: fix.accuracyMeters,
      // Unchanged: publish time, as before the throttle (validity rules intact).
      observedAt: Date.now(),
    });
    if (outcome.ok === false && __DEV__) {
      console.warn('[BG Task iOS] publishLocation soft-fail', outcome.kind);
    }
    return outcome.ok === true;
  } catch (e) {
    if (__DEV__) console.warn('[BG Task iOS] publishLocation error:', e);
    return false;
  }
}

/** QA 2.1.0: at most one background publish every 15 s (bgPublishThrottle). */
export const bgPublishThrottle = createBgPublishThrottle({
  now: () => Date.now(),
  readGateUid,
  readLastPublish: async () => {
    const raw = await AsyncStorage.getItem(BG_LAST_PUBLISH_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as { uid?: unknown; atMs?: unknown };
      return typeof parsed.uid === 'string' && typeof parsed.atMs === 'number'
        ? { uid: parsed.uid, atMs: parsed.atMs }
        : null;
    } catch {
      return null;
    }
  },
  writeLastPublish: (value) =>
    AsyncStorage.setItem(BG_LAST_PUBLISH_KEY, JSON.stringify(value)),
  publish: publishFix,
  schedule: (delayMs, run) => {
    setTimeout(run, delayMs);
  },
});

/** Sends a kept fix whose interval is over (foreground, contractual cadence). */
export function flushPendingBackgroundLocation(): void {
  void bgPublishThrottle.flush().catch(() => {});
}

/** Stop / sign-out: never send a kept fix later. */
export function clearPendingBackgroundLocation(): void {
  bgPublishThrottle.clear();
}

TaskManager.defineTask(BG_LOCATION_TASK, async ({ data, error }) => {
  try {
    if (error) {
      if (__DEV__) console.warn('[BG Task iOS] error:', error);
      return;
    }
    const { locations } = (data as LocationTaskData) ?? {};
    if (!locations?.length) return;
    // Gate, batch handling, 15 s spacing and the single publish in flight
    // live in bgPublishThrottle.
    await bgPublishThrottle.handleDelivery(locations);
  } catch (e) {
    if (__DEV__) console.warn('[BG Task iOS] persist error:', e);
  }
});

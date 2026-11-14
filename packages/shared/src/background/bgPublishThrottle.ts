/**
 * Minimum interval between background location publishes (QA 2.1.0, Owner
 * approved for candidate 82).
 *
 * iOS delivers a fix about every second while background location runs
 * (distanceInterval 0, no deferral; timeInterval is Android-only), and each
 * delivery used to call publishLocation, i.e. one users/{uid}.location write
 * per second per device. This keeps the same permissions, accuracy, radius,
 * 5-minute validity and encounter rules; it only spaces the publishes.
 *
 * Rules:
 * - The first valid fix for an account is sent at once.
 * - Inside the interval the most recent valid fix is kept (batches included)
 *   and sent when the interval ends: on the next delivery, on an explicit
 *   flush (app foreground / contractual cadence), or by a best-effort timer.
 *   No single trigger is required, so a suspended timer cannot strand it.
 * - One publish at a time; a failed publish keeps its fix unless a newer one
 *   arrived, and does not reset the interval (no hammering).
 * - A pending fix belongs to one uid. It is dropped when the gate (signed-in,
 *   Visibility runtime allowed) no longer names that uid, and the gate is
 *   checked again right before sending.
 *
 * Pure apart from the injected dependencies.
 */

export const BG_PUBLISH_MIN_INTERVAL_MS = 15_000;
export const BG_LAST_PUBLISH_KEY = 'NEARSY_BG_LAST_PUBLISH';

export type BgFix = {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  /** Device time of the fix (ms). */
  timestamp: number;
};

export type LastPublish = { uid: string; atMs: number };

export type BgPublishThrottleDeps = {
  now: () => number;
  /** The uid allowed to publish now (session + Visibility runtime), or null. */
  readGateUid: () => Promise<string | null>;
  readLastPublish: () => Promise<LastPublish | null>;
  writeLastPublish: (value: LastPublish) => Promise<void>;
  /** True when the server accepted it. */
  publish: (uid: string, fix: BgFix) => Promise<boolean>;
  /** Best effort; iOS may suspend it. */
  schedule?: (delayMs: number, run: () => void) => void;
  minIntervalMs?: number;
};

export type BgFlushResult = 'sent' | 'failed' | 'throttled' | 'in-flight' | 'idle' | 'blocked';

type RawLocation = {
  coords?: { latitude?: unknown; longitude?: unknown; accuracy?: unknown } | null;
  timestamp?: unknown;
};

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Most recent valid fix of a delivery (iOS can deliver several at once). */
export function pickLatestValidFix(
  locations: ReadonlyArray<RawLocation> | null | undefined,
  fallbackTime: number,
): BgFix | null {
  let best: BgFix | null = null;
  for (const location of locations ?? []) {
    const lat = location?.coords?.latitude;
    const lng = location?.coords?.longitude;
    if (!finite(lat) || !finite(lng)) continue;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    const accuracy = location?.coords?.accuracy;
    const fix: BgFix = {
      latitude: lat,
      longitude: lng,
      accuracyMeters: finite(accuracy) && accuracy >= 0 ? accuracy : 999,
      timestamp: finite(location?.timestamp) ? (location.timestamp as number) : fallbackTime,
    };
    if (!best || fix.timestamp >= best.timestamp) best = fix;
  }
  return best;
}

export function createBgPublishThrottle(deps: BgPublishThrottleDeps) {
  const minInterval = deps.minIntervalMs ?? BG_PUBLISH_MIN_INTERVAL_MS;
  let pending: { uid: string; fix: BgFix } | null = null;
  let inFlight = false;
  let lastMem: LastPublish | null = null;
  let timerArmed = false;

  function keepNewest(uid: string, fix: BgFix): void {
    if (!pending || pending.uid !== uid || fix.timestamp >= pending.fix.timestamp) {
      pending = { uid, fix };
    }
  }

  async function lastPublishFor(uid: string): Promise<number | null> {
    if (lastMem?.uid === uid) return lastMem.atMs;
    let stored: LastPublish | null = null;
    try {
      stored = await deps.readLastPublish();
    } catch {
      stored = null;
    }
    if (stored?.uid === uid && finite(stored.atMs)) {
      lastMem = stored;
      return stored.atMs;
    }
    return null;
  }

  function arm(delayMs: number): void {
    if (!deps.schedule || timerArmed) return;
    timerArmed = true;
    deps.schedule(Math.max(0, delayMs), () => {
      timerArmed = false;
      void flush();
    });
  }

  async function flush(): Promise<BgFlushResult> {
    if (inFlight) return 'in-flight';
    const uid = await deps.readGateUid();
    if (!uid) {
      pending = null;
      return 'blocked';
    }
    if (pending && pending.uid !== uid) pending = null;
    if (!pending) return 'idle';

    const last = await lastPublishFor(uid);
    const now = deps.now();
    if (last !== null && now < last + minInterval) {
      arm(last + minInterval - now);
      return 'throttled';
    }

    inFlight = true;
    const toSend = pending;
    pending = null;
    try {
      // The gate may have changed while reading storage.
      if ((await deps.readGateUid()) !== toSend.uid) return 'blocked';
      lastMem = { uid: toSend.uid, atMs: now };
      try {
        await deps.writeLastPublish(lastMem);
      } catch {
        // The in-memory mark still spaces publishes in this process.
      }
      let ok = false;
      try {
        ok = await deps.publish(toSend.uid, toSend.fix);
      } catch {
        ok = false;
      }
      if (!ok && !pending) pending = toSend;
      return ok ? 'sent' : 'failed';
    } finally {
      inFlight = false;
      if (pending) arm(minInterval);
    }
  }

  return {
    /** A delivery from the location task. */
    async handleDelivery(
      locations: ReadonlyArray<RawLocation> | null | undefined,
    ): Promise<BgFlushResult> {
      const uid = await deps.readGateUid();
      if (!uid) {
        pending = null;
        return 'blocked';
      }
      const fix = pickLatestValidFix(locations, deps.now());
      if (fix) keepNewest(uid, fix);
      return flush();
    },
    /** Sends the kept fix if its interval is over (foreground, cadence). */
    flush,
    /** Sign-out / stop: forget the kept fix. */
    clear(): void {
      pending = null;
    },
    /** Test helper. */
    pendingFix(): { uid: string; fix: BgFix } | null {
      return pending;
    },
  };
}

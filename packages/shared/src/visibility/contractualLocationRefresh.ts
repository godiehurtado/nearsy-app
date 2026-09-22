/**
 * Contractual location publish cadence / debounce (BUG-DISC-02 / BUG-DISC-05).
 * Discovery freshness uses backend confirmedAt via publishLocation / activateVisibility —
 * never legacy location.updatedAt.
 */

/** Skip resume/cadence republish if a successful publish happened within this window. */
export const CONTRACTUAL_PUBLISH_MIN_INTERVAL_MS = 60_000;

/**
 * Foreground cadence while Visibility is ON.
 * Sized under a 5-minute Discovery TTL (~half TTL; aligned with iOS DISC-05).
 * Nearby open / Retry always publish regardless of this cadence.
 */
export const FOREGROUND_CONTRACTUAL_CADENCE_MS = 2 * 60_000;

/**
 * While Nearby is focused and the app is active, re-run publish→discover
 * on this cadence (same half-TTL band as FOREGROUND_CONTRACTUAL_CADENCE_MS / iOS).
 */
export const NEARBY_FOCUSED_REDISCOVER_INTERVAL_MS =
  FOREGROUND_CONTRACTUAL_CADENCE_MS;

/**
 * Coalesce focus / AppState / timer rediscover triggers that fire close together.
 */
export const NEARBY_REDISCOVER_DEBOUNCE_MS = 5_000;

let lastSuccessfulPublishAtMs = 0;

export function getLastContractualPublishAtMs(): number {
  return lastSuccessfulPublishAtMs;
}

export function noteContractualPublishSuccess(nowMs: number = Date.now()): void {
  if (Number.isFinite(nowMs) && nowMs > lastSuccessfulPublishAtMs) {
    lastSuccessfulPublishAtMs = nowMs;
  }
}

export function resetContractualPublishGuardForTests(): void {
  lastSuccessfulPublishAtMs = 0;
}

export function shouldAttemptContractualPublish(
  nowMs: number,
  minIntervalMs: number = CONTRACTUAL_PUBLISH_MIN_INTERVAL_MS,
  lastAtMs: number = lastSuccessfulPublishAtMs,
): boolean {
  if (!Number.isFinite(nowMs) || !Number.isFinite(minIntervalMs)) return true;
  if (minIntervalMs <= 0) return true;
  if (!Number.isFinite(lastAtMs) || lastAtMs <= 0) return true;
  return nowMs - lastAtMs >= minIntervalMs;
}

/**
 * Shared gate for Nearby focus / AppState / periodic rediscover (BUG-DISC-05).
 * Prevents duplicate publish→discover when several triggers fire near-simultaneously.
 */
export function shouldAttemptNearbyRediscover(
  nowMs: number,
  lastAttemptAtMs: number,
  minIntervalMs: number = NEARBY_REDISCOVER_DEBOUNCE_MS,
): boolean {
  return shouldAttemptContractualPublish(nowMs, minIntervalMs, lastAttemptAtMs);
}

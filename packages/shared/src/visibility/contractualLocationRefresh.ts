/**
 * Contractual location publish cadence / debounce (BUG-DISC-02 / BUG-DISC-05).
 * Discovery freshness uses backend confirmedAt via publishLocation / activateVisibility —
 * never legacy location.updatedAt.
 *
 * Aligned with Android #66 (2cd0292):
 *   FOREGROUND_CONTRACTUAL_CADENCE_MS === NEARBY_FOCUSED_REDISCOVER_MS === 2 min
 *   LOCATION_TTL_MS === 5 min
 */

/** Skip resume/cadence republish if a successful publish happened within this window. */
export const CONTRACTUAL_PUBLISH_MIN_INTERVAL_MS = 60_000;

/**
 * Foreground cadence while Visibility is ON.
 * Sized under a 5-minute Discovery TTL (comfortably ≤ ~half TTL).
 * Nearby open / Retry / PTR always force-publish regardless of this cadence.
 */
export const FOREGROUND_CONTRACTUAL_CADENCE_MS = 2 * 60_000;

/**
 * While Nearby is focused (and app active), re-run discover (and publish if due)
 * at this interval. Same value as Android `NEARBY_FOCUSED_REDISCOVER_INTERVAL_MS`.
 */
export const NEARBY_FOCUSED_REDISCOVER_MS = FOREGROUND_CONTRACTUAL_CADENCE_MS;

/** Android #66 alias — keep exports discoverable across platforms. */
export const NEARBY_FOCUSED_REDISCOVER_INTERVAL_MS = NEARBY_FOCUSED_REDISCOVER_MS;

/**
 * Collapse focus + app-foreground (and interval edge) into one in-flight window
 * so resume-while-focused does not double-query.
 */
export const NEARBY_REDISCOVER_DEDUP_MS = 15_000;

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
 * Soft dedupe for focus / app_foreground / interval rediscovers.
 * effect, retry, and ptr always proceed.
 */
export function shouldSkipDuplicateNearbyRediscover(input: {
  reason: string;
  nowMs: number;
  lastStartedAtMs: number;
  dedupeMs?: number;
}): boolean {
  const dedupeMs = input.dedupeMs ?? NEARBY_REDISCOVER_DEDUP_MS;
  if (
    input.reason === 'effect' ||
    input.reason === 'retry' ||
    input.reason === 'ptr'
  ) {
    return false;
  }
  if (
    input.reason !== 'focus' &&
    input.reason !== 'app_foreground' &&
    input.reason !== 'interval'
  ) {
    return false;
  }
  if (!Number.isFinite(input.lastStartedAtMs) || input.lastStartedAtMs <= 0) {
    return false;
  }
  if (!Number.isFinite(input.nowMs) || !Number.isFinite(dedupeMs) || dedupeMs <= 0) {
    return false;
  }
  return input.nowMs - input.lastStartedAtMs < dedupeMs;
}

/**
 * Initial open / Retry / PTR must always publishLocation before discover.
 * Silent rediscovers (focus / app_foreground / interval) publish only when due,
 * sharing the guard with ContractualLocationPublisher so both 2-min timers
 * do not double-call publishLocation.
 */
export function shouldForceNearbyContractualPublish(reason: string): boolean {
  return reason === 'effect' || reason === 'retry' || reason === 'ptr';
}

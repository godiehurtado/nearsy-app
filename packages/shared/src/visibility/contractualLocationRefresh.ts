/**
 * Contractual location publish cadence / debounce (BUG-DISC-02).
 * Discovery freshness uses backend confirmedAt via publishLocation / activateVisibility —
 * never legacy location.updatedAt.
 */

/** Skip resume/cadence republish if a successful publish happened within this window. */
export const CONTRACTUAL_PUBLISH_MIN_INTERVAL_MS = 60_000;

/**
 * Foreground cadence while Visibility is ON (comfortably under 60-minute TTL).
 * Nearby open / Retry always publish regardless of this cadence.
 */
export const FOREGROUND_CONTRACTUAL_CADENCE_MS = 12 * 60_000;

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

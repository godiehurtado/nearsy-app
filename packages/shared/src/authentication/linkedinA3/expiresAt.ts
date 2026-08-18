/**
 * LinkedIn A3 transaction expiry helpers.
 * Start may return epoch milliseconds or seconds; both are accepted.
 */

const MS_EPOCH_THRESHOLD = 1e12;

export function normalizeLinkedInExpiresAtMs(expiresAt: number): number {
  if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt) || expiresAt <= 0) {
    return Number.NaN;
  }
  return expiresAt >= MS_EPOCH_THRESHOLD ? expiresAt : expiresAt * 1000;
}

export function isLinkedInTransactionExpired(
  expiresAt: number,
  nowMs: number = Date.now(),
): boolean {
  const expiresAtMs = normalizeLinkedInExpiresAtMs(expiresAt);
  if (!Number.isFinite(expiresAtMs)) return true;
  return nowMs >= expiresAtMs;
}

/**
 * Client poll cadence. Identity/Functions do not specify an interval.
 * Poll only while a pending challenge is live and the editor is on-screen.
 */
export const INSTAGRAM_OWNERSHIP_POLL_INTERVAL_MS = 5_000;

export function shouldPollInstagramOwnership(input: {
  screenActive: boolean;
  pending: boolean;
  nowMs: number;
  expiresAtMs: number | null;
}): boolean {
  if (!input.screenActive || !input.pending) return false;
  if (input.expiresAtMs == null || !Number.isFinite(input.expiresAtMs)) {
    return false;
  }
  return input.expiresAtMs > input.nowMs;
}

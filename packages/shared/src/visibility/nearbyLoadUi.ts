/**
 * Nearby list UI phase helpers (BUG-DISC-02 initial-load flicker).
 * Pure decisions — no React / Expo imports.
 */

export type NearbyLoadReason = 'effect' | 'retry' | 'ptr';

export type NearbyUiPhaseInput = {
  /** True until the first Visibility-ON publish→discover cycle finishes (or inactive resolved). */
  initialDiscoveryPending: boolean;
  loading: boolean;
  itemCount: number;
  /**
   * When true, profile doc has been observed at least once so visibility
   * false means intentional OFF (not “snapshot not yet arrived”).
   */
  profileReady: boolean;
  visibility: boolean | undefined;
};

/**
 * Empty / Retry chrome must not appear before the first discovery attempt
 * has resolved. While pending, callers should keep the loading treatment.
 */
export function shouldShowNearbyEmptyChrome(input: {
  initialDiscoveryPending: boolean;
  loading: boolean;
  itemCount: number;
}): boolean {
  if (input.loading) return false;
  if (input.initialDiscoveryPending) return false;
  return input.itemCount === 0;
}

/**
 * Full-screen loading for first entry / Retry. Never for pull-to-refresh or
 * silent re-runs after the first resolve.
 */
export function shouldUseNearbyFullScreenLoader(input: {
  reason: NearbyLoadReason;
  initialDiscoveryPending: boolean;
}): boolean {
  if (input.reason === 'ptr') return false;
  if (input.reason === 'retry') return true;
  return input.initialDiscoveryPending;
}

/**
 * Preserve on-screen profiles during background / PTR refresh.
 * Initial + Retry may clear.
 */
export function shouldPreserveNearbyResultsDuringLoad(input: {
  reason: NearbyLoadReason;
  initialDiscoveryPending: boolean;
  itemCount: number;
}): boolean {
  if (input.reason === 'retry') return false;
  if (input.initialDiscoveryPending) return false;
  return input.itemCount > 0;
}

/**
 * Profile bootstrap: wait for first snapshot before treating missing
 * visibility as intentional OFF.
 */
export function shouldWaitForNearbyProfile(input: {
  profileReady: boolean;
}): boolean {
  return !input.profileReady;
}

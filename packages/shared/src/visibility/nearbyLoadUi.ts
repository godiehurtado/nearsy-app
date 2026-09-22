/**
 * Nearby list UI phase helpers (BUG-DISC-02 initial-load flicker / BUG-DISC-05 rediscover).
 * Pure decisions — no React / Expo imports.
 */

export type NearbyLoadReason =
  | 'effect'
  | 'retry'
  | 'ptr'
  | 'focus'
  | 'app_foreground'
  | 'interval';

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
 * Full-screen loading for first entry / Retry. Never for pull-to-refresh,
 * focus / app-foreground / interval rediscover after the first resolve.
 */
export function shouldUseNearbyFullScreenLoader(input: {
  reason: NearbyLoadReason;
  initialDiscoveryPending: boolean;
}): boolean {
  if (
    input.reason === 'ptr' ||
    input.reason === 'focus' ||
    input.reason === 'app_foreground' ||
    input.reason === 'interval'
  ) {
    return false;
  }
  if (input.reason === 'retry') return true;
  return input.initialDiscoveryPending;
}

/**
 * Preserve on-screen profiles during background / PTR / focus / foreground / interval refresh.
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
 * Drop stale async completions when a newer load has already started.
 */
export function shouldApplyNearbyLoadResult(input: {
  requestId: number;
  latestRequestId: number;
}): boolean {
  return input.requestId === input.latestRequestId;
}

/**
 * Soft rediscover (focus / app_foreground / interval) must not start while the
 * first Visibility-ON cycle is still unresolved. Otherwise a silent request can
 * supersede the fullscreen owner and leave loading stuck (BUG-DISC-05).
 */
export function shouldAllowNearbySilentRediscover(input: {
  reason: NearbyLoadReason;
  initialDiscoveryPending: boolean;
}): boolean {
  if (
    input.reason === 'focus' ||
    input.reason === 'app_foreground' ||
    input.reason === 'interval'
  ) {
    return !input.initialDiscoveryPending;
  }
  return true;
}

/**
 * Clear the fullscreen loader when this request still owns the claim:
 * current fullscreen completion, or a stale fullscreen owner superseded by a
 * silent load that never took the claim.
 */
export function shouldClearNearbyFullScreenLoader(input: {
  ownedFullscreen: boolean;
  isCurrent: boolean;
  claimMatchesRequest: boolean;
}): boolean {
  if (!input.ownedFullscreen) return false;
  if (input.isCurrent) return true;
  return input.claimMatchesRequest;
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

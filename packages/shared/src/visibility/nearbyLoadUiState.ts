/**
 * BUG-DISC-04 — Nearby list load UI derivation (no timers).
 * Empty state means a resolved Discovery outcome with zero profiles (or
 * inactive/error), never "items empty while the first request is unresolved".
 */

export type NearbyListErrorKind =
  | 'none'
  | 'inactive'
  | 'empty'
  | 'retry'
  | 'generic';

/**
 * Full-screen loader until the first fetch completes, or while an initial load
 * runs. Also while the viewer profile snapshot has not hydrated — otherwise
 * `visibility` defaults to undefined and falsely shows "Visibility is off".
 */
export function shouldShowNearbyFullScreenLoading(input: {
  loading: boolean;
  initialFetchCompleted: boolean;
  profileHydrated?: boolean;
}): boolean {
  if (input.profileHydrated === false) return true;
  return input.loading || !input.initialFetchCompleted;
}

/**
 * Empty / inactive / error placeholder in the list.
 * Requires a resolved errorKind — never `none` with zero items.
 */
export function shouldShowNearbyEmptyState(input: {
  fullScreenLoading: boolean;
  itemCount: number;
  errorKind: NearbyListErrorKind;
}): boolean {
  if (input.fullScreenLoading) return false;
  if (input.itemCount > 0) return false;
  return input.errorKind !== 'none';
}

/** Silent / pull refresh must keep prior rows while waiting. */
export function shouldClearNearbyItemsOnOutcomeFailure(input: {
  showFullScreenLoader: boolean;
}): boolean {
  return input.showFullScreenLoader === true;
}

/**
 * Viewer visibility is known only after the profile snapshot hydrates.
 * Until then, do not treat missing `visibility` as confirmed off.
 */
export function isNearbyViewerVisibilityConfirmedOff(input: {
  profileHydrated: boolean;
  visibility: boolean | undefined;
}): boolean {
  return input.profileHydrated === true && input.visibility !== true;
}

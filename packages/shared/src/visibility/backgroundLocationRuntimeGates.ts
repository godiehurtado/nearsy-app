/**
 * Pure ENH-LOC-01 runtime/education gate helpers (no RN/Expo imports).
 */

export const BG_RUNTIME_ALLOWED_KEY = 'NEARSY_BG_RUNTIME_ALLOWED' as const;

export type LocationPermissionSnapshot = {
  status: string;
  granted: boolean;
  canAskAgain: boolean;
  /** iOS Allow Once / session grant when expires !== 'never'. */
  sessionOnly: boolean;
  iosScope: 'whenInUse' | 'always' | 'none' | null;
};

export function isSessionOnlyGrant(expires: unknown): boolean {
  return expires !== 'never';
}

export function snapshotFromPermissionResponse(perm: {
  status: string;
  granted?: boolean;
  canAskAgain?: boolean;
  expires?: unknown;
  ios?: { scope?: string };
}): LocationPermissionSnapshot {
  const scope = perm.ios?.scope;
  const iosScope =
    scope === 'whenInUse' || scope === 'always' || scope === 'none'
      ? scope
      : null;
  return {
    status: String(perm.status),
    granted: !!perm.granted || perm.status === 'granted',
    canAskAgain: !!perm.canAskAgain,
    sessionOnly: isSessionOnlyGrant(perm.expires),
    iosScope,
  };
}

export type BackgroundRuntimeGates = {
  uid: string | null | undefined;
  visibilityOn: boolean;
  bgVisible: boolean;
};

export function shouldRunBackgroundLocationRuntime(
  gates: BackgroundRuntimeGates,
): gates is BackgroundRuntimeGates & { uid: string } {
  return (
    typeof gates.uid === 'string' &&
    gates.uid.length > 0 &&
    gates.visibilityOn === true &&
    gates.bgVisible === true
  );
}

/**
 * Headless publish gate: task UID and runtime-allowed UID must both match
 * the expected authenticated account. A stale allowed flag alone is not enough.
 */
export function isPublishAllowedByRuntimeFlags(input: {
  expectedUid: string | null | undefined;
  taskUid: string | null | undefined;
  allowedUid: string | null | undefined;
}): boolean {
  const expected = input.expectedUid?.trim();
  const taskUid = input.taskUid?.trim();
  const allowedUid = input.allowedUid?.trim();
  if (!expected || !taskUid || !allowedUid) return false;
  return taskUid === expected && allowedUid === expected;
}

/**
 * When OS Always is revoked, reflect effective OFF (not a false ON toggle).
 * Does not imply Visibility should be turned off.
 */
export function reconcileBgVisibleWithBackgroundPermission(input: {
  preferenceBgVisible: boolean;
  backgroundGranted: boolean;
}): {
  toggleOn: boolean;
  clearPreference: boolean;
  stopRuntime: boolean;
} {
  if (!input.preferenceBgVisible) {
    return { toggleOn: false, clearPreference: false, stopRuntime: true };
  }
  if (!input.backgroundGranted) {
    return { toggleOn: false, clearPreference: true, stopRuntime: true };
  }
  return { toggleOn: true, clearPreference: false, stopRuntime: false };
}

/** Pure helper: first-time FG grant during an activate attempt. */
export function wasForegroundNewlyGranted(input: {
  beforeGranted: boolean;
  afterGranted: boolean;
}): boolean {
  return !input.beforeGranted && input.afterGranted;
}

/**
 * Contractual logout cleanup order for MoreScreen (source-enforced).
 * stop → deactivate Visibility → signOut → navigation reset.
 */
export const LOGOUT_CLEANUP_ORDER = [
  'stopBackgroundLocationRuntime',
  'deactivateVisibilityFlow',
  'firebaseAuth.signOut',
] as const;

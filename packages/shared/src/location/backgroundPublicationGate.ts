/**
 * Pure gate for background location publication / FGS start.
 * NEARSY_BG_UID alone never authorizes a write.
 */

export type BackgroundPublicationInputs = {
  /** Authenticated session present. */
  authenticated: boolean;
  /** users.visibility */
  visibility: boolean;
  /** users.bgVisible preference */
  bgVisible: boolean;
  /** OS foreground location granted */
  foregroundGranted: boolean;
  /** OS Precise / fine location (not Approximate/coarse). */
  fineLocationGranted?: boolean;
  /** OS background location granted */
  backgroundGranted: boolean;
  /** UID stored for the background task (may be stale). */
  storedTaskUid: string | null | undefined;
  /** Current authenticated UID (when authenticated). */
  currentUid: string | null | undefined;
};

export type BackgroundPublicationDecision =
  | { action: 'publish' | 'start'; uid: string }
  | {
      action: 'stop' | 'skip';
      reason:
        | 'unauthenticated'
        | 'visibility-off'
        | 'bg-preference-off'
        | 'foreground-denied'
        | 'background-denied'
        | 'uid-mismatch'
        | 'missing-uid';
    };

/**
 * Decide whether background publication / FGS may run.
 */
export function decideBackgroundPublication(
  input: BackgroundPublicationInputs,
): BackgroundPublicationDecision {
  if (!input.authenticated || !input.currentUid) {
    return { action: 'stop', reason: 'unauthenticated' };
  }
  if (!input.visibility) {
    return { action: 'stop', reason: 'visibility-off' };
  }
  if (!input.bgVisible) {
    return { action: 'stop', reason: 'bg-preference-off' };
  }
  if (!input.foregroundGranted) {
    return { action: 'stop', reason: 'foreground-denied' };
  }
  if (input.fineLocationGranted === false) {
    return { action: 'stop', reason: 'foreground-denied' };
  }
  if (!input.backgroundGranted) {
    return { action: 'stop', reason: 'background-denied' };
  }
  if (!input.storedTaskUid) {
    // Start path may not have stored UID yet — currentUid is authoritative.
    return { action: 'start', uid: input.currentUid };
  }
  if (input.storedTaskUid !== input.currentUid) {
    return { action: 'stop', reason: 'uid-mismatch' };
  }
  return { action: 'publish', uid: input.currentUid };
}

/**
 * Whether More/Home should attempt to start the FGS after preference + perms.
 */
export function shouldStartBackgroundLocationService(input: {
  authenticated: boolean;
  visibility: boolean;
  bgVisible: boolean;
  foregroundGranted: boolean;
  backgroundGranted: boolean;
  fineLocationGranted?: boolean;
}): boolean {
  const decision = decideBackgroundPublication({
    ...input,
    storedTaskUid: input.authenticated ? 'same' : null,
    currentUid: input.authenticated ? 'same' : null,
  });
  return decision.action === 'publish' || decision.action === 'start';
}

/** Android 11 (API 30) requires Settings for "Allow all the time". */
export const ANDROID_BACKGROUND_SETTINGS_API_LEVEL = 30;

export function requiresSettingsForBackgroundPermission(
  androidApiLevel: number | string | undefined,
): boolean {
  const n =
    typeof androidApiLevel === 'string'
      ? Number.parseInt(androidApiLevel, 10)
      : androidApiLevel;
  if (!Number.isFinite(n as number)) return true;
  return (n as number) >= ANDROID_BACKGROUND_SETTINGS_API_LEVEL;
}

/**
 * Approximate / coarse samples cannot honor ~200 ft nearby promise.
 */
export function isLocationSampleAdequateForNearby(
  accuracyMeters: number | null | undefined,
  maxAccuracyMeters: number,
): boolean {
  if (
    accuracyMeters == null ||
    !Number.isFinite(accuracyMeters) ||
    accuracyMeters < 0
  ) {
    return false;
  }
  return accuracyMeters <= maxAccuracyMeters;
}

export function isAndroidFineLocationGranted(
  androidAccuracy: 'fine' | 'coarse' | 'none' | string | null | undefined,
): boolean {
  if (androidAccuracy == null) {
    // Older Expo / missing android field — treat as fine when status granted.
    return true;
  }
  return androidAccuracy === 'fine';
}

/**
 * Decision helpers for returning from OS Settings.
 * Evaluates whether explicit user intent was previously captured,
 * whether newly refreshed OS permissions allow auto-continuation,
 * and whether the pending intent should be cleared.
 */

export type SettingsRecoveryDecision = {
  /** True when permission is sufficient to auto-continue the user's prior action. */
  shouldActivate: boolean;
  /** True when the pending intent must be cleared (either fulfilled or aborted). */
  clearIntent: boolean;
};

/**
 * Evaluates Visibility auto-continue when returning to foreground.
 *
 * Rules:
 * - If no pending intent existed, do nothing (clearIntent: false, shouldActivate: false).
 * - If user explicitly requested activation and was routed to Settings:
 *   - Foreground permission granted -> shouldActivate: true, clearIntent: true.
 *   - Foreground permission still not granted -> shouldActivate: false, clearIntent: true.
 *   (Intent is cleared to prevent repeated / stale activations or looping alerts).
 */
export function evaluateVisibilitySettingsReturn(
  hasPendingIntent: boolean,
  foregroundStatus: string | null | undefined,
): SettingsRecoveryDecision {
  if (!hasPendingIntent) {
    return { shouldActivate: false, clearIntent: false };
  }
  if (foregroundStatus === 'granted') {
    return { shouldActivate: true, clearIntent: true };
  }
  return { shouldActivate: false, clearIntent: true };
}

/**
 * Evaluates Background Location auto-continue when returning to foreground.
 *
 * Rules:
 * - If no pending intent existed, do nothing (clearIntent: false, shouldActivate: false).
 * - If user explicitly enabled background location and was routed to Settings:
 *   - Both foreground AND background permissions granted -> shouldActivate: true, clearIntent: true.
 *   - Either foreground or background not granted -> shouldActivate: false, clearIntent: true.
 */
export function evaluateBackgroundLocationSettingsReturn(
  hasPendingIntent: boolean,
  foregroundStatus: string | null | undefined,
  backgroundStatus: string | null | undefined,
): SettingsRecoveryDecision {
  if (!hasPendingIntent) {
    return { shouldActivate: false, clearIntent: false };
  }
  if (foregroundStatus === 'granted' && backgroundStatus === 'granted') {
    return { shouldActivate: true, clearIntent: true };
  }
  return { shouldActivate: false, clearIntent: true };
}

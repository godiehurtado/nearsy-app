/**
 * Push-token registration for onboarding-recovery pushes (Functions PR #49,
 * Owner requirement 2026-11-23).
 *
 * - On sign-in the device token is registered whatever the CRJ state. The
 *   registration itself reads the OS permission and never prompts, so a denied
 *   or undecided permission writes nothing.
 * - Right after the CRJ Notifications step grants the permission (or finds it
 *   already granted), the token is registered at once.
 * - The proximity-notice re-evaluation that follows a registration is kept for
 *   completed profiles only, as before.
 * - Account binding is unchanged: the session lifecycle (pushTokenLifecycle.ts)
 *   writes only under the signed-in UID, drops a write whose UID changed, and
 *   logout / account switch release this device's token first.
 *
 * Pure: Node tests never import Expo or RNFirebase.
 */

export type RegisterPushTokenOptions = {
  /** Schedule reevaluateProximityNotices after a successful write. */
  reevaluateNotices?: boolean;
};

export type RegisterPushToken = (
  options?: RegisterPushTokenOptions,
) => Promise<unknown>;

/** Sign-in: always try; re-evaluate notices only for a completed profile. */
export function signInPushTokenOptions(
  profileSetupCompleted: boolean,
): RegisterPushTokenOptions {
  return { reevaluateNotices: profileSetupCompleted };
}

/**
 * CRJ Notifications step: register only when the permission is granted.
 * Never throws and never blocks the step.
 */
export async function registerAfterNotificationsStep(
  granted: boolean,
  register: RegisterPushToken,
): Promise<void> {
  if (!granted) return;
  try {
    await register({ reevaluateNotices: false });
  } catch {
    // Registration is best effort; the next sign-in retries it.
  }
}

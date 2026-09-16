import type { PhoneOtpController } from './phoneOtpController.ts';

export type PerformPhoneOtpOnboardingLogoutInput = {
  controller: PhoneOtpController | null;
  signOut: () => Promise<void>;
  clearSensitiveLocalState?: () => void;
};

export type PhoneOtpOnboardingLogoutResult =
  | { ok: true }
  | { ok: false; messageKey: 'phoneOtp.signOut.failed' };

/**
 * Best-effort OTP challenge cancel + Firebase sign-out for onboarding OTP gate.
 * Controller memory is cleared only after signOut succeeds.
 */
export async function performPhoneOtpOnboardingLogout(
  input: PerformPhoneOtpOnboardingLogoutInput,
): Promise<PhoneOtpOnboardingLogoutResult> {
  if (input.controller) {
    await input.controller.prepareLogout();
  }

  try {
    await input.signOut();
  } catch {
    return { ok: false, messageKey: 'phoneOtp.signOut.failed' };
  }

  if (input.controller) {
    input.controller.resetSensitiveSessionState();
    input.controller.dispose();
  }
  input.clearSensitiveLocalState?.();
  return { ok: true };
}

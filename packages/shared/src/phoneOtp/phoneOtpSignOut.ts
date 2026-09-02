import type { PhoneOtpController } from './phoneOtpController';
import {
  performPhoneOtpOnboardingLogout,
  type PhoneOtpOnboardingLogoutResult,
} from './onboardingLogout';

export type AuthNavigationResetTarget = {
  getParent?: () =>
    | { reset?: (state: { index: number; routes: { name: string }[] }) => void }
    | undefined;
  reset: (state: { index: number; routes: { name: string }[] }) => void;
};

/** Same guest reset pattern as MoreScreen after Firebase sign-out. */
export function resetAuthNavigationToLogin(
  navigation: AuthNavigationResetTarget,
): void {
  const parent = navigation.getParent?.();
  if (parent?.reset) {
    parent.reset({ index: 0, routes: [{ name: 'Login' }] });
    return;
  }
  navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
}

export type RunPhoneOtpScreenSignOutInput = {
  controller: PhoneOtpController | null;
  signOut: () => Promise<void>;
  clearSensitiveLocalState?: () => void;
  resetNavigationToLogin: () => void;
  clearSocialPrefill?: () => void | Promise<void>;
};

export async function runPhoneOtpScreenSignOut(
  input: RunPhoneOtpScreenSignOutInput,
): Promise<PhoneOtpOnboardingLogoutResult> {
  if (input.clearSocialPrefill) {
    await input.clearSocialPrefill();
  }

  const result = await performPhoneOtpOnboardingLogout({
    controller: input.controller,
    signOut: input.signOut,
    clearSensitiveLocalState: input.clearSensitiveLocalState,
  });

  if (result.ok) {
    input.resetNavigationToLogin();
  }

  return result;
}

export type CreatePhoneOtpSignOutPressHandlerInput = {
  isSigningOut: () => boolean;
  setSigningOut: (next: boolean) => void;
  setSignOutError: (message: string | null) => void;
  translate: (key: 'phoneOtp.signOut.failed') => string;
  isMounted: () => boolean;
  runSignOut: () => Promise<PhoneOtpOnboardingLogoutResult>;
};

/** Wired by PhoneVerificationScreen — testable sign-out press handler. */
export function createPhoneOtpSignOutPressHandler(
  input: CreatePhoneOtpSignOutPressHandlerInput,
): () => Promise<void> {
  return async function handlePhoneOtpSignOutPress() {
    if (input.isSigningOut()) return;
    input.setSigningOut(true);
    input.setSignOutError(null);
    const result = await input.runSignOut();
    if (!input.isMounted()) return;
    if (result.ok === false) {
      input.setSignOutError(input.translate(result.messageKey));
      input.setSigningOut(false);
      return;
    }
    input.setSigningOut(false);
  };
}

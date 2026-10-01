/**
 * Facebook Login journey decisions (Android Welcome / Login).
 * Pure module: the hook performs navigation and alerts from the outcome.
 *
 * Routing mirrors the Google flow: complete profile → MainTabs; new or
 * incomplete → ProfileCompletion. Failures never route and never read or
 * create a Nearsy profile.
 */
import {
  FACEBOOK_ACCOUNT_EXISTS_TITLE_KEY,
  FacebookAuthenticationError,
  type FacebookAuthenticationResult,
} from './facebookAuthCore.ts';

const FACEBOOK_TITLE_KEY = 'authentication.login.social.facebook';
const FACEBOOK_GENERIC_KEY = 'authentication.social.facebook.errors.generic';

export type FacebookSignInAlert = { titleKey: string; messageKey: string };

export type FacebookSignInOutcome =
  | { kind: 'mainTabs' }
  | { kind: 'profileCompletion'; uid: string; email: string }
  | { kind: 'alert'; alert: FacebookSignInAlert }
  | { kind: 'ignored' };

export type FacebookSignInFlowDeps = {
  authenticate: () => Promise<FacebookAuthenticationResult>;
  getUserProfile: (uid: string) => Promise<unknown>;
  isProfileComplete: (uid: string) => Promise<boolean>;
};

/** Alert copy for a failed attempt; null when the failure stays silent. */
export function resolveFacebookSignInAlert(
  err: unknown,
): FacebookSignInAlert | null {
  if (!(err instanceof FacebookAuthenticationError)) {
    return { titleKey: FACEBOOK_TITLE_KEY, messageKey: FACEBOOK_GENERIC_KEY };
  }
  if (err.code === 'OPERATION_IN_PROGRESS') return null;
  if (err.code === 'ACCOUNT_EXISTS') {
    return {
      titleKey: FACEBOOK_ACCOUNT_EXISTS_TITLE_KEY,
      messageKey: err.messageKey,
    };
  }
  return { titleKey: FACEBOOK_TITLE_KEY, messageKey: err.messageKey };
}

function logDev(err: unknown): void {
  if (
    typeof __DEV__ !== 'undefined' &&
    __DEV__ &&
    err instanceof FacebookAuthenticationError
  ) {
    console.log('[useFacebookSignInFlow]', {
      code: err.code,
      diagnosticCode: err.diagnosticCode,
    });
  }
}

export async function runFacebookSignIn(
  deps: FacebookSignInFlowDeps,
): Promise<FacebookSignInOutcome> {
  try {
    const result = await deps.authenticate();
    const profileCompletion: FacebookSignInOutcome = {
      kind: 'profileCompletion',
      uid: result.uid,
      email: result.email ?? '',
    };

    const profile = await deps.getUserProfile(result.uid);
    if (!profile) return profileCompletion;

    const complete = await deps.isProfileComplete(result.uid);
    return complete ? { kind: 'mainTabs' } : profileCompletion;
  } catch (err) {
    logDev(err);
    const alert = resolveFacebookSignInAlert(err);
    return alert ? { kind: 'alert', alert } : { kind: 'ignored' };
  }
}

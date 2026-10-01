import type {
  SocialAuthenticationError,
  SocialAuthenticationErrorCode,
} from '../domain/socialAuthenticationError';

export const FACEBOOK_SIGN_IN_FAILED_MESSAGE_KEY =
  'authentication.social.facebook.failed';

export const SIGN_IN_ERROR_TITLE_KEY = 'authentication.login.alerts.loginErrorTitle';

export const FIREBASE_ACCOUNT_EXISTS_CODE =
  'auth/account-exists-with-different-credential';

export const FACEBOOK_ACCOUNT_EXISTS_TITLE_KEY =
  'authentication.social.facebook.accountExistsTitle';

export const FACEBOOK_ACCOUNT_EXISTS_MESSAGE_KEY =
  'authentication.social.facebook.accountExistsMessage';

/** Cancel and double-tap are silent, same as Google / Apple. */
export function shouldSuppressFacebookSignInAlert(
  code: SocialAuthenticationErrorCode,
): boolean {
  return code === 'CANCELLED' || code === 'IN_PROGRESS';
}

/**
 * Network, account-conflict and configuration errors keep the shared social
 * copy; every other Facebook failure uses the Facebook-specific retry copy.
 */
export function resolveFacebookSignInAlertMessageKey(
  error: Pick<SocialAuthenticationError, 'code' | 'messageKey'>,
): string {
  switch (error.code) {
    case 'NETWORK_ERROR':
    case 'ACCOUNT_CONFLICT':
    case 'CONFIGURATION_ERROR':
      return error.messageKey;
    default:
      return FACEBOOK_SIGN_IN_FAILED_MESSAGE_KEY;
  }
}

export type FacebookSignInAlertKeys = { titleKey: string; messageKey: string };

/**
 * Title + message for a failed Facebook sign-in. The existing-account copy must
 * never name or hint at the provider the existing account uses.
 */
export function resolveFacebookSignInAlert(
  error: Pick<SocialAuthenticationError, 'code' | 'messageKey' | 'diagnosticCode'>,
): FacebookSignInAlertKeys {
  if (
    error.code === 'ACCOUNT_CONFLICT' &&
    error.diagnosticCode === FIREBASE_ACCOUNT_EXISTS_CODE
  ) {
    return {
      titleKey: FACEBOOK_ACCOUNT_EXISTS_TITLE_KEY,
      messageKey: FACEBOOK_ACCOUNT_EXISTS_MESSAGE_KEY,
    };
  }
  return {
    titleKey: SIGN_IN_ERROR_TITLE_KEY,
    messageKey: resolveFacebookSignInAlertMessageKey(error),
  };
}

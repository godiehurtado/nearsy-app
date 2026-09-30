import type {
  SocialAuthenticationError,
  SocialAuthenticationErrorCode,
} from '../domain/socialAuthenticationError';

export const FACEBOOK_SIGN_IN_FAILED_MESSAGE_KEY =
  'authentication.social.facebook.failed';

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

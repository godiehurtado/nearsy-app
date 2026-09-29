/**
 * Non-Android stub — Facebook Login is Android-only (ENH-AUTH-FB-01).
 * The type-only import keeps signatures in parity and is erased at runtime.
 */
import type * as FacebookSessionAndroid from './facebookSession.android';
import { FacebookAuthenticationError } from '../authentication/facebook/facebookAuthCore';

type FacebookSessionApi = typeof FacebookSessionAndroid;

function unsupported(): FacebookAuthenticationError {
  return new FacebookAuthenticationError(
    'NOT_CONFIGURED',
    'Facebook Login is not available on this platform.',
    'UNSUPPORTED_PLATFORM',
  );
}

export const authenticateWithFacebook: FacebookSessionApi['authenticateWithFacebook'] =
  async () => {
    throw unsupported();
  };

export const reauthenticateWithFacebook: FacebookSessionApi['reauthenticateWithFacebook'] =
  async () => {
    throw unsupported();
  };

export const logOutFacebookSession: FacebookSessionApi['logOutFacebookSession'] =
  () => {};

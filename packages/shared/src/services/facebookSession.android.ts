/**
 * Android Facebook session entry points (ENH-AUTH-FB-01): sign-in with CRJ
 * prefill, Delete Account reauthentication and native session logout.
 */
import {
  createAuthenticateWithFacebook,
  createReauthenticateWithFacebook,
} from '../authentication/facebook/facebookAuthCore';
import { setPendingSocialProfilePrefill } from '../authentication/social';
import { isNearsyFacebookAuthConfigured } from '../config/facebookAuthConfig';
import {
  logOutFacebookSession,
  requestFacebookAccessToken,
} from './facebookLogin.android';
import {
  reauthenticateWithFacebookAccessToken,
  signInWithFacebookAccessToken,
} from './firebaseFacebookAuth.android';

export { logOutFacebookSession };

export const authenticateWithFacebook = createAuthenticateWithFacebook({
  isConfigured: isNearsyFacebookAuthConfigured,
  requestAccessToken: requestFacebookAccessToken,
  signInWithAccessToken: signInWithFacebookAccessToken,
  discardProviderSession: logOutFacebookSession,
  commitPrefill: setPendingSocialProfilePrefill,
});

export const reauthenticateWithFacebook = createReauthenticateWithFacebook({
  isConfigured: isNearsyFacebookAuthConfigured,
  requestAccessToken: requestFacebookAccessToken,
  reauthenticateWithAccessToken: reauthenticateWithFacebookAccessToken,
  discardProviderSession: logOutFacebookSession,
});

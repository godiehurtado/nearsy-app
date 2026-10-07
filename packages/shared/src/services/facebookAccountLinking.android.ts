/**
 * Android Facebook account linking entry point (ENH-AUTH-LINK-01).
 * Reuses the native Facebook Login adapter (fresh token, public_profile +
 * email) and its idempotent session logout; links through the shared
 * RNFirebase link adapter. Only More → Sign-in methods may use it.
 */
import { createLinkFacebookToCurrentUser } from '../authentication/facebook/facebookAccountLinking';
import { isNearsyFacebookAuthConfigured } from '../config/facebookAuthConfig';
import {
  logOutFacebookSession,
  requestFacebookAccessToken,
} from './facebookLogin.android';
import {
  getAccountLinkUserSnapshot,
  linkFacebookAccessTokenToCurrentUser,
  reloadAccountLinkUser,
} from './firebaseAccountLink.android';
export function createFacebookAccountLinker(confirm: () => Promise<boolean>) {
  return createLinkFacebookToCurrentUser({
    getCurrentUser: getAccountLinkUserSnapshot,
    confirm,
    isConfigured: isNearsyFacebookAuthConfigured,
    requestAccessToken: requestFacebookAccessToken,
    linkWithAccessToken: linkFacebookAccessTokenToCurrentUser,
    reloadCurrentUser: reloadAccountLinkUser,
    discardProviderSession: logOutFacebookSession,
  });
}

/**
 * Android Google account linking entry point (ENH-AUTH-LINK-01).
 * Reuses the native Google Sign-In adapter (account picker → ID token) after
 * dropping any previous Google session, and links through the shared
 * RNFirebase link adapter. Only More → Sign-in methods may use it.
 */
import { createLinkGoogleToCurrentUser } from '../authentication/google/googleAccountLinking';
import {
  discardGoogleSignInSession,
  getGoogleWebClientId,
  isGoogleSignInNativeModuleAvailable,
  requestGoogleIdToken,
} from './googleAuth.android';
import {
  getAccountLinkUserSnapshot,
  linkGoogleIdTokenToCurrentUser,
  reloadAccountLinkUser,
} from './firebaseAccountLink.android';

export function isGoogleAccountLinkingConfigured(): boolean {
  return Boolean(getGoogleWebClientId()) && isGoogleSignInNativeModuleAvailable();
}

export function createGoogleAccountLinker(confirm: () => Promise<boolean>) {
  return createLinkGoogleToCurrentUser({
    getCurrentUser: getAccountLinkUserSnapshot,
    confirm,
    isConfigured: isGoogleAccountLinkingConfigured,
    requestIdToken: async () => {
      await discardGoogleSignInSession();
      const { idToken } = await requestGoogleIdToken();
      return { idToken };
    },
    linkWithIdToken: linkGoogleIdTokenToCurrentUser,
    reloadCurrentUser: reloadAccountLinkUser,
    discardProviderSession: discardGoogleSignInSession,
  });
}

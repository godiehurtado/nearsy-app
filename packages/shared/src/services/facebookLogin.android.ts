/**
 * Android native Facebook Login adapter (react-native-fbsdk-next).
 *
 * Requests only public_profile + email and returns the classic access token
 * to the caller in memory. Never logs the token. App Events, auto-init and
 * advertiser ID collection stay disabled via app.config.js.
 */
import { AccessToken, LoginManager, Settings } from 'react-native-fbsdk-next';
import {
  FACEBOOK_LOGIN_PERMISSIONS,
  FacebookAuthenticationError,
  type FacebookAccessTokenResult,
} from '../authentication/facebook/facebookAuthCore';
import { isNearsyFacebookAuthConfigured } from '../config/facebookAuthConfig';

let sdkInitialized = false;

function ensureSdkInitialized(): void {
  if (sdkInitialized) return;
  Settings.initializeSDK();
  sdkInitialized = true;
}

/**
 * Interactive login. Any previous native session is dropped first so the
 * returned token always comes from this interaction (fresh for reauth).
 */
export async function requestFacebookAccessToken(): Promise<FacebookAccessTokenResult> {
  ensureSdkInitialized();
  LoginManager.logOut();
  const result = await LoginManager.logInWithPermissions([
    ...FACEBOOK_LOGIN_PERMISSIONS,
  ]);
  if (result.isCancelled) {
    throw new FacebookAuthenticationError(
      'CANCELLED',
      'Facebook sign-in was cancelled.',
      'SDK_LOGIN_CANCELLED',
    );
  }
  const token = await AccessToken.getCurrentAccessToken();
  return { accessToken: token?.accessToken ?? null };
}

/** Idempotent: safe when there is no native session or the SDK is off. */
export function logOutFacebookSession(): void {
  if (!isNearsyFacebookAuthConfigured()) return;
  try {
    ensureSdkInitialized();
    LoginManager.logOut();
  } catch {
    // Native session cleanup is best effort; Firebase signOut still runs.
  }
}

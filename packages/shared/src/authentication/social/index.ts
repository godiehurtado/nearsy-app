import { createSocialProviderRegistry } from './application/providerRegistry';
import {
  validateGoogleAuthenticationConfiguration,
  type GoogleConfigurationValidationResult,
} from './application/configurationValidator';
import {
  createAuthenticateWithGoogle,
  type AuthenticateWithGoogleDependencies,
} from './application/authenticateWithGoogle';
import {
  createAuthenticateWithApple,
  type AuthenticateWithAppleDependencies,
} from './application/authenticateWithApple';
import {
  createAuthenticateWithFacebook,
  type AuthenticateWithFacebookDependencies,
} from './application/authenticateWithFacebook';
import { createFacebookProviderAdapter } from './infrastructure/facebook/facebookProviderAdapter';
import { resolveGoogleAuthenticationConfiguration } from './infrastructure/google/googleConfiguration';
import { GOOGLE_IOS_NATIVE_CONFIG } from './infrastructure/google/googleIosNativeConfig';
import { createGoogleProviderAdapter } from './infrastructure/google/googleProviderAdapter';
import { createAppleProviderAdapter } from './infrastructure/apple/appleProviderAdapter';
import { createFirebaseJsAuthenticationAdapter } from './infrastructure/firebase/firebaseJsAuthenticationAdapter';
import { createFirebaseJsAccountLinkingAdapter } from './infrastructure/firebase/firebaseJsAccountLinkingAdapter';
import {
  createLinkFacebookToCurrentUser,
  type LinkFacebookToCurrentUserDependencies,
} from './application/linkFacebookToCurrentUser';
import {
  getUserProfile,
  isProfileComplete,
  updateUserProfilePartial,
} from '../../services/firestoreService';

export type { SocialAuthProvider, SocialAuthenticationRequest } from './domain/socialAuthProvider';
export type { ProviderAuthenticationResult } from './domain/providerAuthenticationResult';
export type {
  SocialAuthenticationError,
  SocialAuthenticationErrorCode,
} from './domain/socialAuthenticationError';
export {
  SocialAuthError,
  createSocialAuthError,
  mapUnknownProviderError,
  sanitizeSocialErrorForLog,
  messageKeyForCode,
} from './domain/socialAuthenticationError';

export type { SocialAuthenticationProviderAdapter } from './application/socialAuthenticationPort';
export type { SocialProviderRegistry } from './application/providerRegistry';
export { createSocialProviderRegistry } from './application/providerRegistry';
export {
  validateGoogleAuthenticationConfiguration,
  CANONICAL_IOS_BUNDLE_ID,
  CANONICAL_FIREBASE_PROJECT_ID,
  FIREBASE_PROJECT_ID_DEVELOPMENT,
  FIREBASE_PROJECT_ID_PRODUCTION,
  OPS_GOOGLE_OAUTH_PROJECT_NUMBER,
  GOOGLE_DEFAULT_SCOPES,
  expectedReversedClientIdFromIosClientId,
} from './application/configurationValidator';
export type {
  GoogleAuthenticationConfiguration,
  GoogleConfigurationIssue,
  GoogleConfigurationValidationResult,
} from './application/configurationValidator';

export type {
  FirebaseAuthenticationPort,
  FirebaseAuthenticationSession,
  FirebaseSocialCredentialInput,
} from './infrastructure/firebase/firebaseAuthenticationPort';
export { createFirebaseJsAuthenticationAdapter } from './infrastructure/firebase/firebaseJsAuthenticationAdapter';
export { createGoogleProviderAdapter } from './infrastructure/google/googleProviderAdapter';
export { resolveGoogleAuthenticationConfiguration } from './infrastructure/google/googleConfiguration';
export { GOOGLE_IOS_NATIVE_CONFIG } from './infrastructure/google/googleIosNativeConfig';
export { createAppleProviderAdapter } from './infrastructure/apple/appleProviderAdapter';
export type {
  AppleAuthenticationClient,
  AppleCryptoClient,
  AppleProviderAdapterDeps,
} from './infrastructure/apple/appleProviderAdapter';

export type {
  AuthenticateWithGoogleDependencies,
  GoogleSignInSuccess,
  GoogleSignInProfileRoute,
} from './application/authenticateWithGoogle';
export { createAuthenticateWithGoogle } from './application/authenticateWithGoogle';

export type {
  AuthenticateWithAppleDependencies,
  AppleSignInSuccess,
  AppleSignInProfileRoute,
} from './application/authenticateWithApple';
export { createAuthenticateWithApple } from './application/authenticateWithApple';
export {
  resolveAppleAuthNavigationTarget,
  shouldSuppressAppleSignInAlert,
} from './application/appleSignInUiPolicy';

export type {
  AuthenticateWithFacebookDependencies,
  FacebookSignInSuccess,
  FacebookSignInProfileRoute,
} from './application/authenticateWithFacebook';
export { createAuthenticateWithFacebook } from './application/authenticateWithFacebook';
export {
  FACEBOOK_SIGN_IN_FAILED_MESSAGE_KEY,
  resolveFacebookSignInAlert,
  resolveFacebookSignInAlertMessageKey,
  shouldSuppressFacebookSignInAlert,
} from './application/facebookSignInUiPolicy';
export {
  beginFacebookAuthTrace,
  describeErrorForTrace,
  flushFacebookAuthTrace,
  summarizeFacebookAuthTrace,
  traceFacebookAuth,
} from './application/facebookAuthTrace';
export {
  createFacebookProviderAdapter,
  FACEBOOK_LOGIN_PERMISSIONS,
} from './infrastructure/facebook/facebookProviderAdapter';

export type {
  FacebookLinkOutcome,
  LinkFacebookToCurrentUser,
  LinkFacebookToCurrentUserDependencies,
  LinkFacebookToCurrentUserRequest,
} from './application/linkFacebookToCurrentUser';
export {
  createLinkFacebookToCurrentUser,
  FACEBOOK_PROVIDER_ID,
} from './application/linkFacebookToCurrentUser';
export type { FacebookLinkErrorCode } from './domain/facebookLinkError';
export {
  FacebookLinkError,
  resolveFacebookLinkAlert,
  shouldSuppressFacebookLinkAlert,
} from './domain/facebookLinkError';
export type {
  FirebaseAccountLinkingPort,
  LinkedAccountSnapshot,
} from './infrastructure/firebase/firebaseAccountLinkingPort';
export { createFirebaseJsAccountLinkingAdapter } from './infrastructure/firebase/firebaseJsAccountLinkingAdapter';
export type { SignInMethodId, SignInMethodRow } from './application/signInMethodsPresentation';
export { buildSignInMethodRows } from './application/signInMethodsPresentation';

export type { SocialProfileData } from './domain/socialProfileData';
export { normalizeSocialProfileData } from './application/normalizeSocialProfileData';
export {
  mapSocialProfileToNamePrefill,
} from './application/mapSocialNamePrefill';
export type { SocialNamePrefill } from './application/mapSocialNamePrefill';
export {
  mergeCompleteProfilePrefill,
  mapSocialNameToRealName,
  sanitizeSocialPhotoUrl,
  isEmptyPrefillValue,
  type CompleteProfilePrefillSeed,
} from './application/mergeCompleteProfilePrefill';
export {
  setPendingSocialProfilePrefill,
  consumePendingSocialProfilePrefill,
  commitPendingSocialNamePrefill,
  clearPendingSocialProfilePrefill,
  peekPendingSocialProfilePrefill,
  peekAppliedSocialNamePrefill,
} from './application/socialProfilePrefillStore';
export {
  resolveCrjNamePrefill,
  type ResolveCrjNamePrefillInput,
  type ResolveCrjNamePrefillResult,
  type AppliedSocialNamePrefill,
} from './application/resolveCrjNamePrefill';

/**
 * Default registry: Google + Apple + Facebook (iOS social credential providers).
 * LinkedIn uses the separate A3 custom-token flow.
 */
export function createDefaultSocialProviderRegistry() {
  return createSocialProviderRegistry({
    google: createGoogleProviderAdapter(),
    apple: createAppleProviderAdapter(),
    facebook: createFacebookProviderAdapter(),
  });
}

export function createDefaultFirebaseAuthenticationPort() {
  return createFirebaseJsAuthenticationAdapter();
}

/**
 * Production Google Sign-In orchestrator for Login / Welcome.
 */
export function createDefaultAuthenticateWithGoogle(
  overrides?: Partial<AuthenticateWithGoogleDependencies>,
) {
  return createAuthenticateWithGoogle({
    registry: createDefaultSocialProviderRegistry(),
    firebaseAuth: createDefaultFirebaseAuthenticationPort(),
    getUserProfile,
    isProfileComplete,
    ...overrides,
  });
}

/**
 * Production Apple Sign-In orchestrator for Login / Welcome.
 */
export function createDefaultAuthenticateWithApple(
  overrides?: Partial<AuthenticateWithAppleDependencies>,
) {
  return createAuthenticateWithApple({
    registry: createDefaultSocialProviderRegistry(),
    firebaseAuth: createDefaultFirebaseAuthenticationPort(),
    getUserProfile,
    isProfileComplete,
    // Fill-empty-only durable capture. Never sets profileSetupCompleted.
    persistEmptyRealName: async (uid, realName) => {
      await updateUserProfilePartial(uid, { realName });
    },
    syncAuthDisplayName: async (displayName) => {
      const { updateProfile } = await import('firebase/auth');
      const { firebaseAuth } = await import('../../config/firebaseConfig');
      const user = firebaseAuth.currentUser;
      if (!user) return;
      await updateProfile(user, { displayName });
    },
    readAuthDisplayName: async () => {
      const { firebaseAuth } = await import('../../config/firebaseConfig');
      const user = firebaseAuth.currentUser;
      if (!user) return null;
      try {
        await user.reload();
      } catch {
        // keep cached snapshot
      }
      const name = firebaseAuth.currentUser?.displayName;
      return typeof name === 'string' && name.trim() ? name.trim() : null;
    },
    ...overrides,
  });
}

/**
 * Production Facebook Login orchestrator for Login / Welcome.
 */
export function createDefaultAuthenticateWithFacebook(
  overrides?: Partial<AuthenticateWithFacebookDependencies>,
) {
  return createAuthenticateWithFacebook({
    registry: createDefaultSocialProviderRegistry(),
    firebaseAuth: createDefaultFirebaseAuthenticationPort(),
    getUserProfile,
    isProfileComplete,
    ...overrides,
  });
}

/**
 * Production "Connect Facebook" orchestrator for Settings → Sign-in methods.
 * Links to the current user only; never part of the Login / Welcome flow.
 */
export function createDefaultLinkFacebookToCurrentUser(
  overrides?: Partial<LinkFacebookToCurrentUserDependencies>,
) {
  return createLinkFacebookToCurrentUser({
    registry: createDefaultSocialProviderRegistry(),
    accountLinking: createFirebaseJsAccountLinkingAdapter(),
    ...overrides,
  });
}

/**
 * Best-effort, idempotent Facebook SDK logout (LoginManager.logOut).
 * Never throws; safe when the user never used Facebook.
 */
export async function clearFacebookProviderSession(): Promise<void> {
  try {
    await createFacebookProviderAdapter().clearProviderSession?.();
  } catch {
    // Best-effort.
  }
}

/**
 * Validate Google foundation readiness without starting a sign-in flow.
 */
export function validateGoogleAuthenticationFoundation(
  options?: { nativeModulePresent?: boolean },
): GoogleConfigurationValidationResult {
  const config = resolveGoogleAuthenticationConfiguration({
    plistBundleId: GOOGLE_IOS_NATIVE_CONFIG.bundleId,
  });

  return validateGoogleAuthenticationConfiguration(config, {
    nativeModulePresent: options?.nativeModulePresent,
  });
}

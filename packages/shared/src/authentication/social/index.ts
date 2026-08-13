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
import { resolveGoogleAuthenticationConfiguration } from './infrastructure/google/googleConfiguration';
import { GOOGLE_IOS_NATIVE_CONFIG } from './infrastructure/google/googleIosNativeConfig';
import { createGoogleProviderAdapter } from './infrastructure/google/googleProviderAdapter';
import { createAppleProviderAdapter } from './infrastructure/apple/appleProviderAdapter';
import { createFirebaseJsAuthenticationAdapter } from './infrastructure/firebase/firebaseJsAuthenticationAdapter';
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
  GOOGLE_DEFAULT_SCOPES,
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
  clearPendingSocialProfilePrefill,
  peekPendingSocialProfilePrefill,
} from './application/socialProfilePrefillStore';

/**
 * Default registry: Google + Apple (iOS social providers).
 */
export function createDefaultSocialProviderRegistry() {
  return createSocialProviderRegistry({
    google: createGoogleProviderAdapter(),
    apple: createAppleProviderAdapter(),
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
    ...overrides,
  });
}

/**
 * Validate Google foundation readiness without starting a sign-in flow.
 */
export function validateGoogleAuthenticationFoundation(
  options?: { nativeModulePresent?: boolean },
): GoogleConfigurationValidationResult {
  const config = resolveGoogleAuthenticationConfiguration({
    plistBundleId: GOOGLE_IOS_NATIVE_CONFIG.bundleId,
    plistProjectId: GOOGLE_IOS_NATIVE_CONFIG.projectId,
    iosClientIdFromPlist: GOOGLE_IOS_NATIVE_CONFIG.iosClientId,
    iosUrlSchemeFromPlist: GOOGLE_IOS_NATIVE_CONFIG.iosUrlScheme,
  });

  return validateGoogleAuthenticationConfiguration(config, {
    nativeModulePresent: options?.nativeModulePresent,
  });
}

import { createSocialProviderRegistry } from './application/providerRegistry';
import {
  validateGoogleAuthenticationConfiguration,
  type GoogleConfigurationValidationResult,
} from './application/configurationValidator';
import {
  createAuthenticateWithGoogle,
  type AuthenticateWithGoogleDependencies,
} from './application/authenticateWithGoogle';
import { resolveGoogleAuthenticationConfiguration } from './infrastructure/google/googleConfiguration';
import { GOOGLE_IOS_NATIVE_CONFIG } from './infrastructure/google/googleIosNativeConfig';
import { createGoogleProviderAdapter } from './infrastructure/google/googleProviderAdapter';
import { createFirebaseJsAuthenticationAdapter } from './infrastructure/firebase/firebaseJsAuthenticationAdapter';
import {
  getUserProfile,
  isProfileComplete,
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

export type {
  AuthenticateWithGoogleDependencies,
  GoogleSignInSuccess,
  GoogleSignInProfileRoute,
} from './application/authenticateWithGoogle';
export { createAuthenticateWithGoogle } from './application/authenticateWithGoogle';

/**
 * Default registry: Google only (TS-006 / TS-007).
 */
export function createDefaultSocialProviderRegistry() {
  return createSocialProviderRegistry({
    google: createGoogleProviderAdapter(),
  });
}

export function createDefaultFirebaseAuthenticationPort() {
  return createFirebaseJsAuthenticationAdapter();
}

/**
 * Production Google Sign-In orchestrator for Login (TS-007).
 * Reuses existing Firestore profile resolution for MainTabs / CompleteProfile routing.
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

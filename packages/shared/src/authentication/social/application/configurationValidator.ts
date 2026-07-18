/**
 * Google authentication configuration model (TS-006).
 * Client IDs are public identifiers, not secrets, but must stay environment-consistent.
 */
export interface GoogleAuthenticationConfiguration {
  enabled: boolean;
  webClientId?: string;
  iosClientId?: string;
  iosUrlScheme?: string;
  /** Expected iOS bundle identifier for the active Firebase/Google registration. */
  expectedIosBundleId: string;
  /** Bundle ID declared inside GoogleService-Info.plist when available. */
  plistBundleId?: string;
  /** Project ID declared inside GoogleService-Info.plist when available. */
  plistProjectId?: string;
  scopes: readonly string[];
}

export const GOOGLE_DEFAULT_SCOPES = ['openid', 'email', 'profile'] as const;

export const CANONICAL_IOS_BUNDLE_ID = 'com.nearsy.app.client';
export const CANONICAL_FIREBASE_PROJECT_ID = 'nearsy-pj';

export type GoogleConfigurationIssueCode =
  | 'GOOGLE_CONFIG_MISSING'
  | 'GOOGLE_IOS_BUNDLE_MISMATCH'
  | 'GOOGLE_URL_SCHEME_MISSING'
  | 'GOOGLE_PROVIDER_UNAVAILABLE'
  | 'GOOGLE_NATIVE_MODULE_MISSING'
  | 'GOOGLE_PROJECT_MISMATCH';

export interface GoogleConfigurationIssue {
  code: GoogleConfigurationIssueCode;
  message: string;
}

export interface GoogleConfigurationValidationResult {
  ok: boolean;
  issues: GoogleConfigurationIssue[];
}

export function validateGoogleAuthenticationConfiguration(
  config: GoogleAuthenticationConfiguration,
  options?: {
    nativeModulePresent?: boolean;
  },
): GoogleConfigurationValidationResult {
  const issues: GoogleConfigurationIssue[] = [];

  if (!config.enabled) {
    issues.push({
      code: 'GOOGLE_CONFIG_MISSING',
      message: 'Google authentication is disabled in configuration.',
    });
  }

  if (!config.webClientId?.trim()) {
    issues.push({
      code: 'GOOGLE_CONFIG_MISSING',
      message: 'Missing Google webClientId required for Firebase ID token exchange.',
    });
  }

  if (!config.iosClientId?.trim()) {
    issues.push({
      code: 'GOOGLE_CONFIG_MISSING',
      message: 'Missing Google iosClientId.',
    });
  }

  if (!config.iosUrlScheme?.trim()) {
    issues.push({
      code: 'GOOGLE_URL_SCHEME_MISSING',
      message: 'Missing iOS reversed client URL scheme.',
    });
  } else if (
    config.iosClientId &&
    !config.iosUrlScheme.startsWith('com.googleusercontent.apps.')
  ) {
    issues.push({
      code: 'GOOGLE_URL_SCHEME_MISSING',
      message: 'iOS URL scheme is not a Google reversed client ID.',
    });
  }

  if (config.expectedIosBundleId !== CANONICAL_IOS_BUNDLE_ID) {
    issues.push({
      code: 'GOOGLE_IOS_BUNDLE_MISMATCH',
      message: `Expected iOS bundle ${CANONICAL_IOS_BUNDLE_ID}.`,
    });
  }

  if (
    config.plistBundleId &&
    config.plistBundleId !== CANONICAL_IOS_BUNDLE_ID
  ) {
    issues.push({
      code: 'GOOGLE_IOS_BUNDLE_MISMATCH',
      message: `GoogleService-Info.plist BUNDLE_ID must be ${CANONICAL_IOS_BUNDLE_ID}.`,
    });
  }

  if (
    config.plistProjectId &&
    config.plistProjectId !== CANONICAL_FIREBASE_PROJECT_ID
  ) {
    issues.push({
      code: 'GOOGLE_PROJECT_MISMATCH',
      message: `GoogleService-Info.plist PROJECT_ID must be ${CANONICAL_FIREBASE_PROJECT_ID}.`,
    });
  }

  if (options?.nativeModulePresent === false) {
    issues.push({
      code: 'GOOGLE_NATIVE_MODULE_MISSING',
      message:
        'Native Google Sign-In module is missing. Rebuild the iOS development client.',
    });
  }

  return { ok: issues.length === 0, issues };
}

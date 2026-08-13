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
  /**
   * Active Firebase project for this build (`nearsy-dev` | `nearsy-pj`).
   * When set, plist PROJECT_ID and OAuth clients must align with it.
   */
  firebaseEnvironmentProjectId?: string;
  scopes: readonly string[];
}

export const GOOGLE_DEFAULT_SCOPES = ['openid', 'email', 'profile'] as const;

export const CANONICAL_IOS_BUNDLE_ID = 'com.nearsy.app.client';
/** Production / Ops Firebase project (legacy export name). */
export const CANONICAL_FIREBASE_PROJECT_ID = 'nearsy-pj';
export const FIREBASE_PROJECT_ID_DEVELOPMENT = 'nearsy-dev';
export const FIREBASE_PROJECT_ID_PRODUCTION = 'nearsy-pj';
/** OAuth numeric prefix for nearsy-pj — rejected in Development builds. */
export const OPS_GOOGLE_OAUTH_PROJECT_NUMBER = '557470198780';

export type GoogleConfigurationIssueCode =
  | 'GOOGLE_CONFIG_MISSING'
  | 'GOOGLE_IOS_BUNDLE_MISMATCH'
  | 'GOOGLE_URL_SCHEME_MISSING'
  | 'GOOGLE_PROVIDER_UNAVAILABLE'
  | 'GOOGLE_NATIVE_MODULE_MISSING'
  | 'GOOGLE_PROJECT_MISMATCH'
  | 'GOOGLE_OPS_CREDENTIALS_IN_DEV'
  | 'GOOGLE_CLIENT_SCHEME_MISMATCH';

export interface GoogleConfigurationIssue {
  code: GoogleConfigurationIssueCode;
  message: string;
}

export interface GoogleConfigurationValidationResult {
  ok: boolean;
  issues: GoogleConfigurationIssue[];
}

function oauthProjectNumber(clientOrScheme: string | undefined): string | null {
  if (!clientOrScheme?.trim()) return null;
  const value = clientOrScheme.trim();
  if (value.startsWith('com.googleusercontent.apps.')) {
    const rest = value.slice('com.googleusercontent.apps.'.length);
    const prefix = rest.split('-')[0];
    return prefix || null;
  }
  if (value.includes('.apps.googleusercontent.com')) {
    const prefix = value.split('-')[0];
    return prefix || null;
  }
  return null;
}

export function expectedReversedClientIdFromIosClientId(
  iosClientId: string,
): string {
  return (
    'com.googleusercontent.apps.' +
    iosClientId.trim().replace(/\.apps\.googleusercontent\.com$/i, '')
  );
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
    !config.iosUrlScheme.startsWith('com.googleusercontent.apps.')
  ) {
    issues.push({
      code: 'GOOGLE_URL_SCHEME_MISSING',
      message: 'iOS URL scheme is not a Google reversed client ID.',
    });
  }

  if (
    config.iosClientId?.trim() &&
    config.iosUrlScheme?.trim() &&
    config.iosUrlScheme.startsWith('com.googleusercontent.apps.')
  ) {
    const expected = expectedReversedClientIdFromIosClientId(config.iosClientId);
    if (expected !== config.iosUrlScheme.trim()) {
      issues.push({
        code: 'GOOGLE_CLIENT_SCHEME_MISMATCH',
        message:
          'EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME must match CLIENT_ID / REVERSED_CLIENT_ID.',
      });
    }
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

  const expectedProject =
    config.firebaseEnvironmentProjectId?.trim() ||
    config.plistProjectId?.trim() ||
    FIREBASE_PROJECT_ID_PRODUCTION;

  if (config.plistProjectId && config.plistProjectId !== expectedProject) {
    issues.push({
      code: 'GOOGLE_PROJECT_MISMATCH',
      message: `GoogleService-Info.plist PROJECT_ID must be ${expectedProject}.`,
    });
  }

  if (expectedProject === FIREBASE_PROJECT_ID_DEVELOPMENT) {
    const candidates = [
      config.webClientId,
      config.iosClientId,
      config.iosUrlScheme,
    ];
    if (
      candidates.some(
        (value) =>
          oauthProjectNumber(value) === OPS_GOOGLE_OAUTH_PROJECT_NUMBER,
      )
    ) {
      issues.push({
        code: 'GOOGLE_OPS_CREDENTIALS_IN_DEV',
        message:
          'Development Google config must not use nearsy-pj OAuth client credentials.',
      });
    }
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

/**
 * Build-time Firebase environment selection for Nearsy iOS LinkedIn A3 (I1).
 * Pure module — no Firebase SDK imports (unit-testable).
 */

export type NearsyFirebaseEnvironmentName = 'development' | 'production';

export type AppCheckProviderKind = 'debug' | 'production_pending';

export type NearsyFirebaseEnvironmentConfig = {
  environment: NearsyFirebaseEnvironmentName;
  firebaseProjectId: 'nearsy-dev' | 'nearsy-pj';
  functionsRegion: 'us-central1';
  appCheckProvider: AppCheckProviderKind;
  linkedInAuthEnabled: boolean;
  linkedInAppReturnUrl: 'nearsy://linkedin-auth';
  googleServicesFile: string;
  bundleIdentifier: 'com.nearsy.app.client';
};

export const FUNCTIONS_REGION = 'us-central1' as const;
export const LINKEDIN_APP_RETURN_URL = 'nearsy://linkedin-auth' as const;
export const IOS_BUNDLE_IDENTIFIER = 'com.nearsy.app.client' as const;

export const DEVELOPMENT_GOOGLE_SERVICES_FILE =
  './GoogleService-Info.development.plist' as const;
export const PRODUCTION_GOOGLE_SERVICES_FILE =
  './GoogleService-Info.plist' as const;

const ENVIRONMENT_TABLE: Record<
  NearsyFirebaseEnvironmentName,
  NearsyFirebaseEnvironmentConfig
> = {
  development: {
    environment: 'development',
    firebaseProjectId: 'nearsy-dev',
    functionsRegion: FUNCTIONS_REGION,
    appCheckProvider: 'debug',
    linkedInAuthEnabled: true,
    linkedInAppReturnUrl: LINKEDIN_APP_RETURN_URL,
    googleServicesFile: DEVELOPMENT_GOOGLE_SERVICES_FILE,
    bundleIdentifier: IOS_BUNDLE_IDENTIFIER,
  },
  production: {
    environment: 'production',
    firebaseProjectId: 'nearsy-pj',
    functionsRegion: FUNCTIONS_REGION,
    appCheckProvider: 'production_pending',
    linkedInAuthEnabled: true,
    linkedInAppReturnUrl: LINKEDIN_APP_RETURN_URL,
    googleServicesFile: PRODUCTION_GOOGLE_SERVICES_FILE,
    bundleIdentifier: IOS_BUNDLE_IDENTIFIER,
  },
};

export function parseNearsyFirebaseEnvironmentName(
  raw: string | null | undefined,
): NearsyFirebaseEnvironmentName {
  const value = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (value === 'development' || value === 'dev') {
    return 'development';
  }
  if (value === 'production' || value === 'prod' || value === '') {
    // Empty defaults to production so existing Ops builds stay on nearsy-pj.
    return 'production';
  }
  throw new Error(
    `[nearsyFirebaseEnvironment] Unsupported EXPO_PUBLIC_NEARSY_FIREBASE_ENV: ${value}`,
  );
}

export function resolveNearsyFirebaseEnvironment(
  raw: string | null | undefined,
): NearsyFirebaseEnvironmentConfig {
  return ENVIRONMENT_TABLE[parseNearsyFirebaseEnvironmentName(raw)];
}

export function isDebugAppCheckAllowed(
  environment: NearsyFirebaseEnvironmentName,
): boolean {
  return environment === 'development';
}

/**
 * Canonical Android Firebase / App Check environment resolution (J01).
 *
 * Single source of truth for development vs production pairing.
 * Pure module — no Firebase / Expo SDK imports (unit-testable).
 *
 * Valid pairs only:
 *   development ↔ nearsy-dev  → App Check Debug
 *   production  ↔ nearsy-pj   → App Check Play Integrity
 *
 * Any other combination is invalid (fail closed).
 */

export type NearsyAndroidEnvironmentName = 'development' | 'production';

export type NearsyAndroidFirebaseProjectId = 'nearsy-dev' | 'nearsy-pj';

/** Logical App Check kind (platform provider resolved separately). */
export type AndroidAppCheckProviderKind = 'debug' | 'production';

export type NearsyAndroidEnvironmentConfig = {
  environment: NearsyAndroidEnvironmentName;
  firebaseProjectId: NearsyAndroidFirebaseProjectId;
  functionsRegion: 'us-central1';
  appCheckProvider: AndroidAppCheckProviderKind;
  /** Environment allows LinkedIn A3; product UX may still gate separately. */
  linkedInAuthEnabled: boolean;
  linkedInAppReturnUrl: 'nearsy://linkedin-auth';
  googleServicesFile: string;
  androidPackage: 'com.nearsy.app';
};

export const ANDROID_FUNCTIONS_REGION = 'us-central1' as const;
export const ANDROID_LINKEDIN_APP_RETURN_URL = 'nearsy://linkedin-auth' as const;
export const ANDROID_APPLICATION_ID = 'com.nearsy.app' as const;

export const ANDROID_DEVELOPMENT_GOOGLE_SERVICES_FILE =
  './google-services.nearsy-dev.json' as const;
export const ANDROID_PRODUCTION_GOOGLE_SERVICES_FILE =
  './google-services.json' as const;

const ENVIRONMENT_TABLE: Record<
  NearsyAndroidEnvironmentName,
  NearsyAndroidEnvironmentConfig
> = {
  development: {
    environment: 'development',
    firebaseProjectId: 'nearsy-dev',
    functionsRegion: ANDROID_FUNCTIONS_REGION,
    appCheckProvider: 'debug',
    linkedInAuthEnabled: true,
    linkedInAppReturnUrl: ANDROID_LINKEDIN_APP_RETURN_URL,
    googleServicesFile: ANDROID_DEVELOPMENT_GOOGLE_SERVICES_FILE,
    androidPackage: ANDROID_APPLICATION_ID,
  },
  production: {
    environment: 'production',
    firebaseProjectId: 'nearsy-pj',
    functionsRegion: ANDROID_FUNCTIONS_REGION,
    appCheckProvider: 'production',
    linkedInAuthEnabled: true,
    linkedInAppReturnUrl: ANDROID_LINKEDIN_APP_RETURN_URL,
    googleServicesFile: ANDROID_PRODUCTION_GOOGLE_SERVICES_FILE,
    androidPackage: ANDROID_APPLICATION_ID,
  },
};

/**
 * Expo / EAS extras shape written by apps/nearsy-android/app.config.js.
 * All consumers should read through this module — not ad-hoc process.env.
 */
export type NearsyAndroidEnvExtras = {
  nearsyFirebaseEnv?: unknown;
  nearsyFirebaseProjectId?: unknown;
  nearsyDevClient?: unknown;
  nearsyFunctionsRegion?: unknown;
};

export type ParsedAndroidEnvironmentLabel =
  | NearsyAndroidEnvironmentName
  | 'unknown';

export type ParsedAndroidProjectId =
  | NearsyAndroidFirebaseProjectId
  | 'unknown';

/** Normalize build-time env labels. Empty / default / prod → production. */
export function parseNearsyAndroidEnvironmentLabel(
  raw: unknown,
): ParsedAndroidEnvironmentLabel {
  const value = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (value === 'development' || value === 'dev') return 'development';
  if (
    value === 'production' ||
    value === 'prod' ||
    value === 'default' ||
    value === ''
  ) {
    return 'production';
  }
  return 'unknown';
}

export function parseNearsyAndroidProjectId(
  raw: unknown,
): ParsedAndroidProjectId {
  const value = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (value === 'nearsy-dev') return 'nearsy-dev';
  if (value === 'nearsy-pj') return 'nearsy-pj';
  return 'unknown';
}

export function resolveNearsyDevClientFlag(
  extras: NearsyAndroidEnvExtras | null | undefined,
): boolean {
  return extras?.nearsyDevClient === true;
}

export function isDebugAppCheckAllowed(
  environment: NearsyAndroidEnvironmentName,
): boolean {
  return environment === 'development';
}

export type AndroidEnvironmentResolution =
  | {
      ok: true;
      config: NearsyAndroidEnvironmentConfig;
      isDevBuild: boolean;
    }
  | {
      ok: false;
      reason:
        | 'unknown_environment'
        | 'unknown_project'
        | 'env_project_mismatch'
        | 'functions_region_invalid';
      environment: ParsedAndroidEnvironmentLabel;
      projectId: ParsedAndroidProjectId;
    };

/**
 * Resolve the canonical Android environment from Expo extras (+ build flags).
 * Fail closed on unknown labels or development≠nearsy-dev / production≠nearsy-pj.
 */
export function resolveNearsyAndroidEnvironment(input: {
  extras: NearsyAndroidEnvExtras | null | undefined;
  isJsDev: boolean;
}): AndroidEnvironmentResolution {
  const environment = parseNearsyAndroidEnvironmentLabel(
    input.extras?.nearsyFirebaseEnv,
  );
  const projectId = parseNearsyAndroidProjectId(
    input.extras?.nearsyFirebaseProjectId,
  );

  if (environment === 'unknown') {
    return {
      ok: false,
      reason: 'unknown_environment',
      environment,
      projectId,
    };
  }

  if (projectId === 'unknown') {
    return {
      ok: false,
      reason: 'unknown_project',
      environment,
      projectId,
    };
  }

  const config = ENVIRONMENT_TABLE[environment];
  if (config.firebaseProjectId !== projectId) {
    return {
      ok: false,
      reason: 'env_project_mismatch',
      environment,
      projectId,
    };
  }

  const regionRaw = input.extras?.nearsyFunctionsRegion;
  if (
    regionRaw !== undefined &&
    regionRaw !== null &&
    String(regionRaw).trim() !== '' &&
    String(regionRaw).trim() !== ANDROID_FUNCTIONS_REGION
  ) {
    return {
      ok: false,
      reason: 'functions_region_invalid',
      environment,
      projectId,
    };
  }

  const isDevBuild =
    input.isJsDev === true || resolveNearsyDevClientFlag(input.extras) === true;

  return { ok: true, config, isDevBuild };
}

/** Table lookup when environment name is already trusted. */
export function getNearsyAndroidEnvironmentConfig(
  environment: NearsyAndroidEnvironmentName,
): NearsyAndroidEnvironmentConfig {
  return ENVIRONMENT_TABLE[environment];
}

/** Sanitized snapshot for logs / diagnostics — never includes secrets. */
export type AndroidRuntimeConfigSnapshot = {
  environment: NearsyAndroidEnvironmentName | 'invalid';
  firebaseProjectId: NearsyAndroidFirebaseProjectId | 'invalid';
  functionsRegion: string;
  appCheckProvider: AndroidAppCheckProviderKind | 'none';
  debugTokenPresent: false;
  linkedInAuthEnabled: boolean;
  isDevBuild: boolean;
};

export function buildAndroidRuntimeConfigSnapshot(
  resolution: AndroidEnvironmentResolution,
): AndroidRuntimeConfigSnapshot {
  if (!resolution.ok) {
    return {
      environment: 'invalid',
      firebaseProjectId: 'invalid',
      functionsRegion: ANDROID_FUNCTIONS_REGION,
      appCheckProvider: 'none',
      debugTokenPresent: false,
      linkedInAuthEnabled: false,
      isDevBuild: false,
    };
  }
  return {
    environment: resolution.config.environment,
    firebaseProjectId: resolution.config.firebaseProjectId,
    functionsRegion: resolution.config.functionsRegion,
    appCheckProvider: resolution.config.appCheckProvider,
    debugTokenPresent: false,
    linkedInAuthEnabled: resolution.config.linkedInAuthEnabled,
    isDevBuild: resolution.isDevBuild,
  };
}

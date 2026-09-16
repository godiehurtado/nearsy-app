/**
 * Android App Check provider policy (J01).
 *
 * Development + nearsy-dev + development build → Debug
 * Production + nearsy-pj → Play Integrity
 * Mismatched / unknown → reject (fail closed — never skip, never Debug in prod)
 */

import {
  resolveNearsyAndroidEnvironment,
  type NearsyAndroidEnvExtras,
  type AndroidEnvironmentResolution,
} from './nearsyAndroidEnvironment.ts';
import {
  resolveAndroidAppCheckProviderConfig,
  type AndroidAppCheckProviderConfig,
} from './androidAppCheckProviderConfig.ts';

/** @deprecated Prefer NearsyAndroidEnvExtras — kept for call-site compatibility. */
export type NearsyFirebaseEnvExtras = NearsyAndroidEnvExtras;

/** @deprecated Use parse/resolve via nearsyAndroidEnvironment. */
export type NearsyFirebaseEnvLabel = 'development' | 'default' | 'production';

export {
  resolveNearsyDevClientFlag,
  type NearsyAndroidEnvExtras,
} from './nearsyAndroidEnvironment.ts';

/** Legacy helper: maps extras to development | default (production). */
export function resolveNearsyFirebaseEnvLabel(
  extras: NearsyFirebaseEnvExtras | null | undefined,
): NearsyFirebaseEnvLabel {
  const raw = extras?.nearsyFirebaseEnv;
  if (raw === 'development' || raw === 'dev') return 'development';
  if (raw === 'production' || raw === 'prod') return 'production';
  if (raw === 'default' || raw === undefined || raw === null) return 'default';
  return 'default';
}

export type AppCheckRejectReason =
  | 'unknown_environment'
  | 'unknown_project'
  | 'env_project_mismatch'
  | 'functions_region_invalid'
  | 'development_requires_dev_build'
  | 'debug_forbidden_outside_development'
  | 'provider_config_invalid';

export type AppCheckProviderDecision =
  | { action: 'use_debug'; reason: 'development_nearsy_dev' }
  | { action: 'use_play_integrity'; reason: 'production_nearsy_pj' }
  | { action: 'reject'; reason: AppCheckRejectReason };

export type AppCheckPolicyInput = {
  extras: NearsyAndroidEnvExtras | null | undefined;
  /** Metro / debug JS bundle. Alone is insufficient without Development Firebase env. */
  isJsDev: boolean;
};

export function decideAppCheckProvider(
  input: AppCheckPolicyInput,
): AppCheckProviderDecision {
  const resolution = resolveNearsyAndroidEnvironment({
    extras: input.extras,
    isJsDev: input.isJsDev,
  });
  return decideAppCheckProviderFromResolution(resolution);
}

export function decideAppCheckProviderFromResolution(
  resolution: AndroidEnvironmentResolution,
): AppCheckProviderDecision {
  if (resolution.ok === false) {
    return { action: 'reject', reason: resolution.reason };
  }

  const { config, isDevBuild } = resolution;

  if (config.appCheckProvider === 'debug') {
    if (config.environment !== 'development') {
      return {
        action: 'reject',
        reason: 'debug_forbidden_outside_development',
      };
    }
    if (!isDevBuild) {
      return {
        action: 'reject',
        reason: 'development_requires_dev_build',
      };
    }
    return { action: 'use_debug', reason: 'development_nearsy_dev' };
  }

  if (config.appCheckProvider === 'production') {
    if (config.environment !== 'production') {
      return {
        action: 'reject',
        reason: 'debug_forbidden_outside_development',
      };
    }
    return { action: 'use_play_integrity', reason: 'production_nearsy_pj' };
  }

  return { action: 'reject', reason: 'provider_config_invalid' };
}

/**
 * Build RNFB Android provider options from a policy decision.
 * Throws AndroidAppCheckProviderConfigError when production would get a debug token.
 */
export function materializeAndroidAppCheckProviderConfig(
  decision: AppCheckProviderDecision,
  debugToken?: string | null,
): AndroidAppCheckProviderConfig {
  if (decision.action === 'use_debug') {
    return resolveAndroidAppCheckProviderConfig({
      appCheckProvider: 'debug',
      debugToken,
    });
  }
  if (decision.action === 'use_play_integrity') {
    return resolveAndroidAppCheckProviderConfig({
      appCheckProvider: 'production',
      debugToken,
    });
  }
  throw new Error(`Cannot materialize App Check config for ${decision.action}`);
}

// --- Injectable bootstrap (no native SDK imports; Node-test friendly) ---

export type AppCheckInitStatus =
  | { status: 'idle' }
  | { status: 'pending' }
  | { status: 'ready'; decision: AppCheckProviderDecision }
  | {
      status: 'error';
      message: string;
      decision?: AppCheckProviderDecision;
    };

type AppCheckModule = {
  newReactNativeFirebaseAppCheckProvider: () => {
    configure: (opts: {
      android: { provider: 'debug' | 'playIntegrity'; debugToken?: string };
    }) => void;
  };
  initializeAppCheck: (opts: {
    provider: unknown;
    isTokenAutoRefreshEnabled?: boolean;
  }) => Promise<void>;
  getToken?: (forceRefresh?: boolean) => Promise<{ token: string }>;
};

export type AppCheckBootstrapDeps = {
  readExtras: () => NearsyAndroidEnvExtras;
  isJsDev: boolean;
  getAppCheck: () => AppCheckModule;
  /** Optional embedded debug token — never used in production. */
  readDebugToken?: () => string | null | undefined;
};

let initPromise: Promise<AppCheckInitStatus> | null = null;
let lastStatus: AppCheckInitStatus = { status: 'idle' };
let lastAppCheckModule: AppCheckModule | null = null;

export function getAppCheckInitStatus(): AppCheckInitStatus {
  return lastStatus;
}

/** Test-only: reset idempotent latch. */
export function __resetAppCheckBootstrapForTests(): void {
  initPromise = null;
  lastStatus = { status: 'idle' };
  lastAppCheckModule = null;
}

function sanitizeMessage(message: string): string {
  return message.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    '[redacted]',
  );
}

async function runInit(
  deps: AppCheckBootstrapDeps,
): Promise<AppCheckInitStatus> {
  lastStatus = { status: 'pending' };
  const extras = deps.readExtras();
  const decision = decideAppCheckProvider({
    extras,
    isJsDev: deps.isJsDev,
  });

  if (decision.action === 'reject') {
    const errorStatus: AppCheckInitStatus = {
      status: 'error',
      message: `App Check rejected: ${decision.reason}`,
      decision,
    };
    lastStatus = errorStatus;
    return errorStatus;
  }

  try {
    const providerConfig = materializeAndroidAppCheckProviderConfig(
      decision,
      deps.readDebugToken?.(),
    );
    const ac = deps.getAppCheck();
    lastAppCheckModule = ac;
    const provider = ac.newReactNativeFirebaseAppCheckProvider();
    provider.configure({
      android: providerConfig.debugToken
        ? {
            provider: providerConfig.provider,
            debugToken: providerConfig.debugToken,
          }
        : { provider: providerConfig.provider },
    });
    await ac.initializeAppCheck({
      provider,
      isTokenAutoRefreshEnabled: true,
    });
    const ready: AppCheckInitStatus = { status: 'ready', decision };
    lastStatus = ready;
    return ready;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'App Check initialization failed.';
    const errorStatus: AppCheckInitStatus = {
      status: 'error',
      message: sanitizeMessage(message),
      decision,
    };
    lastStatus = errorStatus;
    return errorStatus;
  }
}

export function ensureAppCheckInitializedWithDeps(
  deps: AppCheckBootstrapDeps,
): Promise<AppCheckInitStatus> {
  if (!initPromise) {
    initPromise = runInit(deps);
  }
  return initPromise;
}

/**
 * Foundation for future callables (OTP, Affiliations, Visibility, LinkedIn).
 * After ready, RNFB httpsCallable attaches App Check automatically; getToken
 * is available when the native module exposes it.
 */
export type AppCheckTokenFoundation =
  | { status: 'ready'; canGetToken: boolean }
  | { status: 'not_ready'; reason: string };

export async function ensureAppCheckTokenFoundationWithDeps(
  deps: AppCheckBootstrapDeps,
): Promise<AppCheckTokenFoundation> {
  const status = await ensureAppCheckInitializedWithDeps(deps);
  if (status.status !== 'ready') {
    return {
      status: 'not_ready',
      reason:
        status.status === 'error'
          ? status.message
          : `App Check status: ${status.status}`,
    };
  }
  return {
    status: 'ready',
    canGetToken: typeof lastAppCheckModule?.getToken === 'function',
  };
}

/**
 * iOS native App Check port — RNFB only (no Firebase JS App Check bridge).
 *
 * Uses modular initializeAppCheck + getToken. Preserves sanitized native
 * failure diagnostics (I1-I). Never logs token material.
 */

import Constants from 'expo-constants';

import {
  resolveNearsyFirebaseEnvironment,
  type NearsyFirebaseEnvironmentConfig,
} from '../environment/nearsyFirebaseEnvironment';
import { LinkedInA3ClientError } from '../sanitize';
import type { AppCheckBootstrapPort } from './appCheckBootstrap';
import {
  buildAppCheckFailureDiagnostic,
  formatAppCheckDiagnosticLine,
  type AppCheckFailureDiagnostic,
  type AppCheckFailureStage,
} from './appCheckDiagnostics';

type Extra = Record<string, unknown>;

function readExtra(): Extra {
  return (
    (Constants.expoConfig?.extra as Extra) ??
    ((Constants as { manifest2?: { extra?: Extra } }).manifest2?.extra as Extra) ??
    {}
  );
}

function pickEnv(name: string): string | undefined {
  const extra = readExtra();
  const fromExtra = extra?.[name];
  if (typeof fromExtra === 'string' && fromExtra.length > 0) {
    return fromExtra;
  }
  const fromProcess = process.env[name];
  if (typeof fromProcess === 'string' && fromProcess.length > 0) {
    return fromProcess;
  }
  return undefined;
}

export function resolveRuntimeFirebaseEnvironment(): NearsyFirebaseEnvironmentConfig {
  return resolveNearsyFirebaseEnvironment(
    pickEnv('EXPO_PUBLIC_NEARSY_FIREBASE_ENV'),
  );
}

function readDebugToken(): string | undefined {
  const extra = readExtra();
  const fromExtra = extra?.NEARSY_APP_CHECK_DEBUG_TOKEN;
  if (typeof fromExtra === 'string' && fromExtra.length > 0) {
    return fromExtra;
  }
  const fromProcess = process.env.FIREBASE_APP_CHECK_DEBUG_TOKEN;
  if (typeof fromProcess === 'string' && fromProcess.length > 0) {
    return fromProcess;
  }
  return undefined;
}

type AppCheckInstance = {
  getToken?: (force: boolean) => Promise<{ token: string }>;
};

/** Process-wide singleton — RNFB App Check must not be initialized twice. */
let sharedAppCheckInstance: AppCheckInstance | null = null;
let sharedInitializePromise: Promise<AppCheckInstance> | null = null;
let modularGetToken:
  | ((instance: AppCheckInstance, force?: boolean) => Promise<{ token: string }>)
  | null = null;

/** Test/dev observability (counts only — no secrets). */
export const appCheckPortTelemetry = {
  createPortCalls: 0,
  initializeAppCheckCalls: 0,
  getTokenCalls: 0,
  lastDiagnostic: null as AppCheckFailureDiagnostic | null,
};

export function resetAppCheckPortTelemetryForTests(): void {
  appCheckPortTelemetry.createPortCalls = 0;
  appCheckPortTelemetry.initializeAppCheckCalls = 0;
  appCheckPortTelemetry.getTokenCalls = 0;
  appCheckPortTelemetry.lastDiagnostic = null;
}

export function getSharedAppCheckInitState():
  | 'none'
  | 'initializing'
  | 'ready' {
  if (sharedAppCheckInstance) return 'ready';
  if (sharedInitializePromise) return 'initializing';
  return 'none';
}

function throwDiagnosed(
  err: unknown,
  stage: AppCheckFailureStage,
  retryNumber: number,
): never {
  const diagnostic = buildAppCheckFailureDiagnostic(err, stage, retryNumber);
  appCheckPortTelemetry.lastDiagnostic = diagnostic;
  if (__DEV__) {
    // Structured sanitized fields only — never dump err objects or tokens.
    console.warn(
      `[LinkedInA3][AppCheck]\n${formatAppCheckDiagnosticLine(diagnostic)}`,
    );
  }
  const wrapped = new LinkedInA3ClientError(
    'APP_CHECK_FAILED',
    diagnostic.safeMessage,
    diagnostic.nativeCode ?? diagnostic.normalizedCode,
  );
  (wrapped as LinkedInA3ClientError & { diagnostic?: AppCheckFailureDiagnostic }).diagnostic =
    diagnostic;
  throw wrapped;
}

export async function createNativeAppCheckPort(options?: {
  retryNumber?: number;
}): Promise<{
  port: AppCheckBootstrapPort;
  getNativeProjectId: () => string;
  getInitState: () => 'none' | 'initializing' | 'ready';
}> {
  appCheckPortTelemetry.createPortCalls += 1;
  const retryNumber = options?.retryNumber ?? 1;

  const appMod = await import('@react-native-firebase/app');
  const appCheckMod = await import('@react-native-firebase/app-check');

  const getApp = appMod.getApp as () => { options?: { projectId?: string } };
  const ReactNativeFirebaseAppCheckProvider =
    appCheckMod.ReactNativeFirebaseAppCheckProvider as new () => {
      configure: (options: unknown) => void;
      providerOptions?: unknown;
    };
  const initializeAppCheck = appCheckMod.initializeAppCheck as (
    app: unknown,
    options: unknown,
  ) => Promise<AppCheckInstance>;
  modularGetToken = appCheckMod.getToken as (
    instance: AppCheckInstance,
    force?: boolean,
  ) => Promise<{ token: string }>;

  const env = resolveRuntimeFirebaseEnvironment();

  const port: AppCheckBootstrapPort = {
    async initialize() {
      if (sharedAppCheckInstance) {
        return;
      }
      if (!sharedInitializePromise) {
        sharedInitializePromise = (async () => {
          if (env.appCheckProvider !== 'debug') {
            throw new LinkedInA3ClientError(
              'LINKEDIN_DISABLED',
              'LinkedIn App Check is not enabled for this environment.',
            );
          }

          const debugToken = readDebugToken();
          if (!debugToken) {
            throwDiagnosed(
              new Error('Debug provider token missing from runtime config'),
              'read_debug_token',
              retryNumber,
            );
          }

          let provider: InstanceType<typeof ReactNativeFirebaseAppCheckProvider>;
          try {
            provider = new ReactNativeFirebaseAppCheckProvider();
            provider.configure({
              apple: {
                provider: 'debug',
                debugToken,
              },
            });
          } catch (err) {
            throwDiagnosed(err, 'configure_provider', retryNumber);
          }

          try {
            appCheckPortTelemetry.initializeAppCheckCalls += 1;
            sharedAppCheckInstance = await initializeAppCheck(getApp(), {
              provider,
              isTokenAutoRefreshEnabled: true,
            });
            return sharedAppCheckInstance;
          } catch (err) {
            throwDiagnosed(err, 'initialize_app_check', retryNumber);
          }
        })().catch((err) => {
          sharedInitializePromise = null;
          throw err;
        });
      }
      await sharedInitializePromise;
    },
    async ensureToken() {
      if (!sharedAppCheckInstance) {
        throw new LinkedInA3ClientError(
          'NOT_INITIALIZED',
          'App Check is not initialized.',
        );
      }
      try {
        appCheckPortTelemetry.getTokenCalls += 1;
        const result = modularGetToken
          ? await modularGetToken(sharedAppCheckInstance, true)
          : await sharedAppCheckInstance.getToken?.(true);
        if (!result?.token || typeof result.token !== 'string') {
          throwDiagnosed(
            new Error('App Check token was empty'),
            'get_token',
            retryNumber,
          );
        }
        // Discard token — never return or log it.
      } catch (err) {
        if (
          err instanceof LinkedInA3ClientError &&
          (err as { diagnostic?: AppCheckFailureDiagnostic }).diagnostic
        ) {
          throw err;
        }
        throwDiagnosed(err, 'get_token', retryNumber);
      }
    },
    async withToken(fn) {
      if (!sharedAppCheckInstance) {
        throw new LinkedInA3ClientError(
          'NOT_INITIALIZED',
          'App Check is not initialized.',
        );
      }
      let token: string;
      try {
        appCheckPortTelemetry.getTokenCalls += 1;
        const result = modularGetToken
          ? await modularGetToken(sharedAppCheckInstance, false)
          : await sharedAppCheckInstance.getToken?.(false);
        if (!result?.token || typeof result.token !== 'string') {
          throwDiagnosed(
            new Error('App Check token was empty'),
            'get_token',
            retryNumber,
          );
        }
        token = result.token;
      } catch (err) {
        if (
          err instanceof LinkedInA3ClientError &&
          (err as { diagnostic?: AppCheckFailureDiagnostic }).diagnostic
        ) {
          throw err;
        }
        if (err instanceof LinkedInA3ClientError) throw err;
        throwDiagnosed(err, 'get_token', retryNumber);
      }
      return fn(token);
    },
  };

  return {
    port,
    getInitState: getSharedAppCheckInitState,
    getNativeProjectId() {
      const projectId = getApp()?.options?.projectId;
      return typeof projectId === 'string' ? projectId : '';
    },
  };
}

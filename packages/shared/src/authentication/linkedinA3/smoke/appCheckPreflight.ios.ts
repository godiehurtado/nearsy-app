/**
 * Development-only App Check preflight (I1-F / I1-I / I1-J).
 * Never logs or returns token material.
 *
 * Single attempt only — no automatic second retry (I1-J).
 * Debug-token fingerprints are intentionally omitted from the UI report.
 */

import { createAppCheckBootstrap } from '../appCheck/appCheckBootstrap';
import {
  appCheckPortTelemetry,
  createNativeAppCheckPort,
  getSharedAppCheckInitState,
} from '../appCheck/nativeAppCheckPort';
import type { AppCheckFailureDiagnostic } from '../appCheck/appCheckDiagnostics';
import { resolveNearsyFirebaseEnvironment } from '../environment/nearsyFirebaseEnvironment';
import { LinkedInA3ClientError } from '../sanitize';
import Constants from 'expo-constants';
import type {
  AppCheckPreflightAttempt,
  AppCheckPreflightReport,
} from './appCheckPreflightTypes';

export type { AppCheckPreflightAttempt, AppCheckPreflightReport };

function readExtra(): Record<string, unknown> {
  return (
    (Constants.expoConfig?.extra as Record<string, unknown>) ??
    ((Constants as { manifest2?: { extra?: Record<string, unknown> } }).manifest2
      ?.extra as Record<string, unknown>) ??
    {}
  );
}

function hasDebugTokenConfigured(): boolean {
  const extra = readExtra();
  const fromExtra = extra.NEARSY_APP_CHECK_DEBUG_TOKEN;
  if (typeof fromExtra === 'string' && fromExtra.trim().length > 0) {
    return true;
  }
  const fromProcess = process.env.FIREBASE_APP_CHECK_DEBUG_TOKEN;
  return typeof fromProcess === 'string' && fromProcess.trim().length > 0;
}

function readDiagnostic(
  err: unknown,
): AppCheckFailureDiagnostic | undefined {
  if (
    err &&
    typeof err === 'object' &&
    'diagnostic' in err &&
    (err as { diagnostic?: AppCheckFailureDiagnostic }).diagnostic
  ) {
    return (err as { diagnostic: AppCheckFailureDiagnostic }).diagnostic;
  }
  return appCheckPortTelemetry.lastDiagnostic ?? undefined;
}

async function singleAttempt(): Promise<AppCheckPreflightAttempt> {
  try {
    const { port, getNativeProjectId } = await createNativeAppCheckPort({
      retryNumber: 1,
    });

    const bootstrap = createAppCheckBootstrap({
      port,
      maxAttempts: 1,
      timeoutMs: 20_000,
    });
    await bootstrap.initialize();
    await port.ensureToken();

    void getNativeProjectId();
    return {
      attempt: 1,
      initialization: 'ready',
      tokenObtained: true,
    };
  } catch (err) {
    const diagnostic = readDiagnostic(err);
    const initReady =
      getSharedAppCheckInitState() === 'ready' ||
      appCheckPortTelemetry.initializeAppCheckCalls >= 1;
    const code =
      err instanceof LinkedInA3ClientError
        ? err.code
        : err && typeof err === 'object' && 'code' in err
          ? String((err as { code: string }).code)
          : 'APP_CHECK_FAILED';
    const causeCode =
      err instanceof LinkedInA3ClientError
        ? err.causeCode
        : diagnostic?.nativeCode ?? diagnostic?.normalizedCode;
    return {
      attempt: 1,
      // Module init succeeded if shared state is ready even when getToken failed.
      initialization: initReady ? 'ready' : 'failed',
      tokenObtained: false,
      errorCode: code,
      causeCode,
      diagnostic,
    };
  }
}

export async function runLinkedInA3AppCheckPreflight(): Promise<AppCheckPreflightReport> {
  const environment = resolveNearsyFirebaseEnvironment(
    (readExtra().EXPO_PUBLIC_NEARSY_FIREBASE_ENV as string | undefined) ??
      process.env.EXPO_PUBLIC_NEARSY_FIREBASE_ENV,
  );

  const jsProjectId =
    (readExtra().EXPO_PUBLIC_FIREBASE_PROJECT_ID as string | undefined) ??
    process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ??
    null;

  let nativeProjectId: string | null = null;
  try {
    const appMod = await import('@react-native-firebase/app');
    const getApp = appMod.getApp as () => { options?: { projectId?: string } };
    nativeProjectId = getApp()?.options?.projectId ?? null;
  } catch {
    nativeProjectId = null;
  }

  const bundleId =
    Constants.expoConfig?.ios?.bundleIdentifier ??
    (Constants as { expoConfig?: { ios?: { bundleIdentifier?: string } } })
      .expoConfig?.ios?.bundleIdentifier ??
    null;

  const attempt = await singleAttempt();
  const attempts: AppCheckPreflightAttempt[] = [attempt];

  const tokenObtained = attempt.tokenObtained === true;
  const appCheckInitialized =
    attempt.initialization === 'ready' ||
    getSharedAppCheckInitState() === 'ready';
  const overall = tokenObtained ? 'ready' : 'failed';
  const phase = tokenObtained ? 'ready' : 'blocked';

  return {
    environment: environment.environment,
    firebaseProjectIdExpected: environment.firebaseProjectId,
    jsProjectId,
    nativeProjectId,
    bundleId,
    appCheckProvider: environment.appCheckProvider,
    linkedInEnabled: environment.linkedInAuthEnabled,
    debugTokenConfigured: hasDebugTokenConfigured(),
    attempts,
    firstInitDefectObserved: false,
    overall,
    appCheckInitialized,
    tokenObtained,
    phase,
    telemetry: {
      createPortCalls: appCheckPortTelemetry.createPortCalls,
      initializeAppCheckCalls: appCheckPortTelemetry.initializeAppCheckCalls,
      getTokenCalls: appCheckPortTelemetry.getTokenCalls,
      sharedInitState: getSharedAppCheckInitState(),
    },
  };
}

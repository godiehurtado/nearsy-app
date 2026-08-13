import type { AppCheckFailureDiagnostic } from '../appCheck/appCheckDiagnostics';
import type { DebugTokenFingerprint } from '../appCheck/debugTokenFingerprint';

export type AppCheckPreflightAttempt = {
  attempt: 1 | 2;
  /**
   * Result of native/JS App Check *module* initialization (configureProvider /
   * initializeAppCheck), not token exchange success.
   */
  initialization: 'ready' | 'failed';
  tokenObtained: boolean;
  errorCode?: string;
  causeCode?: string;
  diagnostic?: AppCheckFailureDiagnostic;
};

export type AppCheckPreflightReport = {
  environment: string;
  firebaseProjectIdExpected: string;
  jsProjectId: string | null;
  nativeProjectId: string | null;
  bundleId: string | null;
  appCheckProvider: string;
  linkedInEnabled: boolean;
  debugTokenConfigured: boolean;
  attempts: AppCheckPreflightAttempt[];
  firstInitDefectObserved: boolean;
  /**
   * Overall token readiness for Start smoke.
   * Distinct from App Check module initialization.
   */
  overall: 'ready' | 'failed';
  /** True when initializeAppCheck succeeded even if getToken failed. */
  appCheckInitialized: boolean;
  tokenObtained: boolean;
  phase: 'ready' | 'blocked';
  /**
   * Optional ops-only fingerprint. Must never be rendered in Login/UI.
   * Prefer scripts under apps/nearsy-ios/scripts for comparison.
   */
  debugTokenFingerprint?: DebugTokenFingerprint | null;
  telemetry?: {
    createPortCalls: number;
    initializeAppCheckCalls: number;
    getTokenCalls: number;
    sharedInitState: 'none' | 'initializing' | 'ready';
  };
};

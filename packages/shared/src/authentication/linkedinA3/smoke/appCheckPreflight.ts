import type { AppCheckPreflightReport } from './appCheckPreflightTypes';

export type { AppCheckPreflightReport };

export async function runLinkedInA3AppCheckPreflight(): Promise<AppCheckPreflightReport> {
  return {
    environment: 'unknown',
    firebaseProjectIdExpected: 'nearsy-dev',
    jsProjectId: null,
    nativeProjectId: null,
    bundleId: null,
    appCheckProvider: 'debug',
    linkedInEnabled: false,
    debugTokenConfigured: false,
    attempts: [
      {
        attempt: 1,
        initialization: 'failed',
        tokenObtained: false,
        errorCode: 'LINKEDIN_DISABLED',
      },
    ],
    firstInitDefectObserved: false,
    overall: 'failed',
    appCheckInitialized: false,
    tokenObtained: false,
    phase: 'blocked',
  };
}

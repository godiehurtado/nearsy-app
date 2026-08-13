/**
 * Non-iOS stub — LinkedIn A3 App Check is iOS-only in this package layout.
 */

import { LinkedInA3ClientError } from '../sanitize';
import type { AppCheckBootstrapPort } from './appCheckBootstrap';
import type { AppCheckFailureDiagnostic } from './appCheckDiagnostics';

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

export function getSharedAppCheckInitState(): 'none' | 'initializing' | 'ready' {
  return 'none';
}

export function resolveRuntimeFirebaseEnvironment() {
  throw new LinkedInA3ClientError(
    'LINKEDIN_DISABLED',
    'LinkedIn A3 is only configured for iOS in this package.',
  );
}

export async function createNativeAppCheckPort(_options?: {
  retryNumber?: number;
}): Promise<{
  port: AppCheckBootstrapPort;
  getNativeProjectId: () => string;
  getInitState: () => 'none' | 'initializing' | 'ready';
}> {
  throw new LinkedInA3ClientError(
    'LINKEDIN_DISABLED',
    'LinkedIn A3 is only configured for iOS in this package.',
  );
}

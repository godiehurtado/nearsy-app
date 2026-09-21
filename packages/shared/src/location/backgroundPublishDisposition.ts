/**
 * Classify background publishLocation outcomes for the Android FGS task.
 * Permanent auth / App Check / authorization failures stop the task.
 * Transient sample/network failures skip the tick only.
 */

export type BackgroundPublishFailureKind =
  | 'permission-denied'
  | 'unavailable'
  | 'invalid-accuracy'
  | 'callable';

export type BackgroundPublishDisposition = 'stop' | 'skip';

/**
 * Permanent failures: stop FGS + clear runtime auth (no indefinite retry loop).
 * Transient: skip tick; OS cadence unchanged.
 */
export function disposeBackgroundPublishFailure(input: {
  kind?: BackgroundPublishFailureKind | string;
  code?: string;
  reason?: string;
  message?: string;
  retryable?: boolean;
}): BackgroundPublishDisposition {
  const kind = String(input.kind ?? '').toLowerCase();
  const code = String(input.code ?? '')
    .replace(/^functions\//i, '')
    .toLowerCase();
  const reason = String(input.reason ?? '').toLowerCase();
  const message = String(input.message ?? '').toLowerCase();

  if (kind === 'permission-denied') return 'stop';

  if (code === 'unauthenticated' || code === 'permission-denied') {
    return 'stop';
  }

  if (
    reason === 'visibility-inactive' ||
    message.includes('visibility-inactive')
  ) {
    return 'stop';
  }

  if (code === 'failed-precondition') {
    if (
      message.includes('app check') ||
      reason.includes('app check') ||
      message.includes('not ready') ||
      message.includes('initialization failed')
    ) {
      return 'stop';
    }
  }

  if (
    message.includes('app check') &&
    (code === 'failed-precondition' || code === 'unauthenticated')
  ) {
    return 'stop';
  }

  // Explicit non-retryable contractual errors that revoke authorization.
  if (input.retryable === false) {
    if (
      reason === 'visibility-inactive' ||
      code === 'unauthenticated' ||
      code === 'permission-denied'
    ) {
      return 'stop';
    }
  }

  return 'skip';
}

/** Headless JS must have Auth + App Check ready before publishLocation. */
export function isHeadlessPublishEnvironmentReady(input: {
  hasCurrentUser: boolean;
  appCheckStatus: string;
}): boolean {
  return input.hasCurrentUser && input.appCheckStatus === 'ready';
}

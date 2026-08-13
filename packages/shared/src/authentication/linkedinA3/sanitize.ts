/**
 * Sanitized logging / error helpers for LinkedIn A3 client (I1).
 * Never log App Check tokens, full authorization URLs, or full transaction IDs.
 */

export function sanitizeTransactionId(transactionId: string): string {
  const value = String(transactionId ?? '');
  if (value.length <= 8) {
    return '[tx]';
  }
  return `${value.slice(0, 4)}…${value.slice(-2)}`;
}

export function sanitizeAuthorizationUrl(url: string): string {
  try {
    const parsed = new URL(String(url ?? ''));
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return '[authorizationUrl]';
  }
}

export type LinkedInA3PublicErrorCode =
  | 'NOT_READY'
  | 'NOT_INITIALIZED'
  | 'INITIALIZING'
  | 'APP_CHECK_FAILED'
  | 'APP_CHECK_TIMEOUT'
  | 'ENV_INVALID'
  | 'LINKEDIN_DISABLED'
  | 'INVALID_ARGUMENT'
  | 'INVALID_RESPONSE'
  | 'CALLABLE_FAILED'
  | 'RETRY_EXHAUSTED'
  | 'OPERATION_IN_PROGRESS'
  | 'BROWSER_FAILED'
  | 'PROVIDER_CALLBACK_ERROR'
  | 'CALLBACK_INVALID'
  | 'CALLBACK_MISMATCH'
  | 'CUSTOM_TOKEN_MISSING'
  | 'FIREBASE_SIGN_IN_FAILED'
  | 'SESSION_CHANGED'
  | 'UNKNOWN';

export class LinkedInA3ClientError extends Error {
  readonly code: LinkedInA3PublicErrorCode;
  readonly causeCode?: string;

  constructor(
    code: LinkedInA3PublicErrorCode,
    message: string,
    causeCode?: string,
  ) {
    super(message);
    this.name = 'LinkedInA3ClientError';
    this.code = code;
    this.causeCode = causeCode;
  }
}

export function toSanitizedCallableError(err: unknown): LinkedInA3ClientError {
  if (err instanceof LinkedInA3ClientError) {
    return err;
  }

  const anyErr = err as {
    code?: string;
    message?: string;
  };

  const rawCode = String(anyErr?.code ?? '').trim();
  // Firebase Functions HttpsError codes are safe to surface as causeCode.
  if (rawCode.startsWith('functions/')) {
    return new LinkedInA3ClientError(
      'CALLABLE_FAILED',
      'LinkedIn auth start failed.',
      rawCode,
    );
  }

  return new LinkedInA3ClientError(
    'CALLABLE_FAILED',
    'LinkedIn auth start failed.',
  );
}

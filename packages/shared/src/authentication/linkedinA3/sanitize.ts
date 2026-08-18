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
  | 'TX_EXPIRED'
  | 'NETWORK'
  | 'EXCHANGE_ALREADY_CONSUMED'
  | 'UNKNOWN';

export type LinkedInA3CallableSanitizeContext = 'start' | 'exchange';

const APP_CHECK_FUNCTION_CODES = new Set([
  'functions/unauthenticated',
  'functions/permission-denied',
]);

function readErrorCode(err: unknown): string {
  return String((err as { code?: string })?.code ?? '').trim();
}

function readDetailsCode(err: unknown): string {
  const details = (err as { details?: { code?: unknown } })?.details;
  return typeof details?.code === 'string' ? details.code.trim() : '';
}

function isNetworkishCallableError(err: unknown, rawCode: string): boolean {
  if (
    rawCode === 'functions/unavailable' ||
    rawCode === 'functions/deadline-exceeded' ||
    rawCode === 'unavailable' ||
    rawCode === 'deadline-exceeded'
  ) {
    return true;
  }
  const msg = String((err as { message?: string })?.message ?? '').toLowerCase();
  return (
    msg === 'network request failed' ||
    msg.includes('failed to fetch') ||
    msg.includes('network-request-failed')
  );
}

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

export function toSanitizedCallableError(
  err: unknown,
  context: LinkedInA3CallableSanitizeContext = 'start',
): LinkedInA3ClientError {
  if (err instanceof LinkedInA3ClientError) {
    return err;
  }

  const rawCode = readErrorCode(err);
  const detailsCode = readDetailsCode(err);
  const fallbackMessage =
    context === 'exchange'
      ? 'LinkedIn auth exchange failed.'
      : 'LinkedIn auth start failed.';

  if (detailsCode === 'TX_EXPIRED' || rawCode.endsWith('/TX_EXPIRED')) {
    return new LinkedInA3ClientError(
      'TX_EXPIRED',
      'LinkedIn authentication expired.',
    );
  }

  if (APP_CHECK_FUNCTION_CODES.has(rawCode)) {
    return new LinkedInA3ClientError(
      'APP_CHECK_FAILED',
      'App Check rejected the LinkedIn auth request.',
      rawCode,
    );
  }

  if (isNetworkishCallableError(err, rawCode)) {
    return new LinkedInA3ClientError(
      'NETWORK',
      'LinkedIn authentication network error.',
      rawCode.startsWith('functions/') ? rawCode : undefined,
    );
  }

  if (
    context === 'exchange' &&
    (rawCode === 'functions/failed-precondition' ||
      rawCode === 'functions/already-exists' ||
      detailsCode === 'TX_FAILED' ||
      detailsCode === 'EXCHANGE_ALREADY_CONSUMED')
  ) {
    return new LinkedInA3ClientError(
      'EXCHANGE_ALREADY_CONSUMED',
      'LinkedIn authentication result was already used.',
      rawCode.startsWith('functions/') ? rawCode : undefined,
    );
  }

  if (rawCode.startsWith('functions/')) {
    return new LinkedInA3ClientError('CALLABLE_FAILED', fallbackMessage, rawCode);
  }

  return new LinkedInA3ClientError('CALLABLE_FAILED', fallbackMessage);
}

export function linkedInA3RetrySafe(input: {
  exchangeConsumed?: boolean;
  status?: string;
}): boolean {
  if (input.status === 'authenticated' || input.status === 'session_already_active') {
    return false;
  }
  return input.exchangeConsumed !== true;
}

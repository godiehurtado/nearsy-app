import type { SocialAuthProvider } from './socialAuthProvider';

/**
 * Stable application error taxonomy for social authentication (TS-006 / ADR-010).
 * Technical causes must never be rendered to end users or logged with tokens.
 */
export type SocialAuthenticationErrorCode =
  | 'CANCELLED'
  | 'IN_PROGRESS'
  | 'PROVIDER_UNAVAILABLE'
  | 'CONFIGURATION_ERROR'
  | 'NETWORK_ERROR'
  | 'TOKEN_MISSING'
  | 'TOKEN_INVALID'
  | 'FIREBASE_ERROR'
  | 'ACCOUNT_CONFLICT'
  | 'UNKNOWN';

export interface SocialAuthenticationError {
  code: SocialAuthenticationErrorCode;
  provider: SocialAuthProvider;
  recoverable: boolean;
  messageKey: string;
  /** Sanitized diagnostic code for developers; never a token or PII payload. */
  diagnosticCode?: string;
}

export class SocialAuthError extends Error {
  readonly social: SocialAuthenticationError;

  constructor(error: SocialAuthenticationError) {
    super(error.code);
    this.name = 'SocialAuthError';
    this.social = error;
  }
}

export function createSocialAuthError(
  partial: SocialAuthenticationError,
): SocialAuthError {
  return new SocialAuthError(partial);
}

const MESSAGE_KEYS: Record<SocialAuthenticationErrorCode, string> = {
  CANCELLED: 'authentication.social.errors.cancelled',
  IN_PROGRESS: 'authentication.social.errors.inProgress',
  PROVIDER_UNAVAILABLE: 'authentication.social.errors.providerUnavailable',
  CONFIGURATION_ERROR: 'authentication.social.errors.configuration',
  NETWORK_ERROR: 'authentication.social.errors.network',
  TOKEN_MISSING: 'authentication.social.errors.generic',
  TOKEN_INVALID: 'authentication.social.errors.generic',
  FIREBASE_ERROR: 'authentication.social.errors.generic',
  ACCOUNT_CONFLICT: 'authentication.social.errors.accountConflict',
  UNKNOWN: 'authentication.social.errors.generic',
};

export function messageKeyForCode(
  code: SocialAuthenticationErrorCode,
): string {
  return MESSAGE_KEYS[code];
}

export function isRecoverableCode(code: SocialAuthenticationErrorCode): boolean {
  return (
    code === 'CANCELLED' ||
    code === 'NETWORK_ERROR' ||
    code === 'IN_PROGRESS' ||
    code === 'ACCOUNT_CONFLICT'
  );
}

/**
 * Map a native/SDK error-ish value into a typed social error without leaking
 * tokens or raw payloads.
 */
export function mapUnknownProviderError(
  provider: SocialAuthProvider,
  err: unknown,
): SocialAuthError {
  const codeName =
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    typeof (err as { code: unknown }).code === 'string'
      ? (err as { code: string }).code
      : undefined;

  if (
    codeName === 'SIGN_IN_CANCELLED' ||
    codeName === '-5' ||
    codeName === 'ERR_REQUEST_CANCELED'
  ) {
    return createSocialAuthError({
      code: 'CANCELLED',
      provider,
      recoverable: true,
      messageKey: messageKeyForCode('CANCELLED'),
      diagnosticCode: 'SIGN_IN_CANCELLED',
    });
  }

  if (codeName === 'SIGN_IN_REQUIRED' || codeName === 'IN_PROGRESS') {
    return createSocialAuthError({
      code: 'IN_PROGRESS',
      provider,
      recoverable: true,
      messageKey: messageKeyForCode('IN_PROGRESS'),
      diagnosticCode: codeName,
    });
  }

  if (
    codeName === 'PLAY_SERVICES_NOT_AVAILABLE' ||
    codeName === 'SIGN_IN_FAILED'
  ) {
    return createSocialAuthError({
      code: 'PROVIDER_UNAVAILABLE',
      provider,
      recoverable: false,
      messageKey: messageKeyForCode('PROVIDER_UNAVAILABLE'),
      diagnosticCode: codeName,
    });
  }

  if (
    typeof err === 'object' &&
    err !== null &&
    'message' in err &&
    typeof (err as { message: unknown }).message === 'string' &&
    /network/i.test((err as { message: string }).message)
  ) {
    return createSocialAuthError({
      code: 'NETWORK_ERROR',
      provider,
      recoverable: true,
      messageKey: messageKeyForCode('NETWORK_ERROR'),
      diagnosticCode: 'NETWORK',
    });
  }

  return createSocialAuthError({
    code: 'UNKNOWN',
    provider,
    recoverable: false,
    messageKey: messageKeyForCode('UNKNOWN'),
    diagnosticCode: codeName ?? 'UNKNOWN',
  });
}

/**
 * Safe serialization for diagnostics: never includes tokens or profile PII.
 */
export function sanitizeSocialErrorForLog(
  error: SocialAuthenticationError,
): Record<string, string | boolean> {
  return {
    code: error.code,
    provider: error.provider,
    recoverable: error.recoverable,
    messageKey: error.messageKey,
    ...(error.diagnosticCode
      ? { diagnosticCode: error.diagnosticCode }
      : {}),
  };
}

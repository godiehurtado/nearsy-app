/**
 * Phone OTP callable error normalization (no Firebase imports).
 */

import {
  isFirebaseCallableHttpError,
  type FirebaseCallableHttpError,
} from '../../firebase/callableHttp';

export type PhoneOtpFirebaseErrorCode =
  | 'unauthenticated'
  | 'permission-denied'
  | 'invalid-argument'
  | 'failed-precondition'
  | 'not-found'
  | 'resource-exhausted'
  | 'unavailable'
  | 'internal'
  | 'aborted'
  | 'unknown';

export type PhoneOtpErrorReason =
  | 'invalid_phone'
  | 'invalid_code'
  | 'invalid_challenge'
  | 'phone_not_allowed'
  | 'landline_blocked'
  | 'challenge_not_found'
  | 'code_mismatch'
  | 'challenge_expired'
  | 'challenge_locked'
  | 'challenge_cancelled'
  | 'challenge_failed'
  | 'claim_conflict'
  | 'verification_not_authorized'
  | 'rate_limited'
  | 'cooldown'
  | 'operation_in_progress'
  | 'feature_disabled'
  | 'auth_required'
  | 'app_check_failed'
  | 'provider_unavailable'
  | 'config_missing'
  | 'contract_invalid'
  | 'network'
  | 'generic_retryable'
  | 'generic';

export class PhoneOtpClientError extends Error {
  readonly kind = 'PhoneOtpClientError' as const;
  readonly code: PhoneOtpFirebaseErrorCode;
  readonly reason: PhoneOtpErrorReason;
  readonly retryable: boolean;
  readonly messageKey: string;
  readonly causeForLog?: unknown;

  constructor(input: {
    code: PhoneOtpFirebaseErrorCode;
    reason: PhoneOtpErrorReason;
    retryable: boolean;
    messageKey: string;
    message?: string;
    causeForLog?: unknown;
  }) {
    super(input.message ?? 'Phone verification failed.');
    this.name = 'PhoneOtpClientError';
    this.code = input.code;
    this.reason = input.reason;
    this.retryable = input.retryable;
    this.messageKey = input.messageKey;
    if (input.causeForLog !== undefined) this.causeForLog = input.causeForLog;
  }
}

export class PhoneOtpContractError extends Error {
  readonly kind = 'PhoneOtpContractError' as const;

  constructor(message = 'Invalid Phone OTP response.') {
    super(message);
    this.name = 'PhoneOtpContractError';
  }
}

export function createPhoneOtpContractError(
  message = 'Invalid Phone OTP response.',
): PhoneOtpContractError {
  return new PhoneOtpContractError(message);
}

export function isPhoneOtpClientError(value: unknown): value is PhoneOtpClientError {
  return (
    value instanceof PhoneOtpClientError ||
    (typeof value === 'object' &&
      value !== null &&
      (value as PhoneOtpClientError).kind === 'PhoneOtpClientError')
  );
}

const KNOWN_CODES = new Set<string>([
  'unauthenticated',
  'permission-denied',
  'invalid-argument',
  'failed-precondition',
  'not-found',
  'resource-exhausted',
  'unavailable',
  'internal',
  'aborted',
]);

export function normalizeFirebaseErrorCode(raw: unknown): PhoneOtpFirebaseErrorCode {
  const text = String(raw ?? '')
    .trim()
    .replace(/^functions\//i, '')
    .toLowerCase()
    .replace(/_/g, '-');
  if (KNOWN_CODES.has(text)) {
    return text as PhoneOtpFirebaseErrorCode;
  }
  return 'unknown';
}

function inferReasonFromMessage(message: string): PhoneOtpErrorReason | null {
  const m = message.toLowerCase();
  if (m.includes('expired')) return 'challenge_expired';
  if (m.includes('incorrect') || m.includes('invalid') && m.includes('code')) {
    return 'code_mismatch';
  }
  if (m.includes('cancelled')) return 'challenge_cancelled';
  if (m.includes('too many verification attempts')) return 'challenge_locked';
  if (m.includes('landline')) return 'landline_blocked';
  if (m.includes('does not belong')) return 'verification_not_authorized';
  if (m.includes('not eligible')) return 'phone_not_allowed';
  if (m.includes('already verified on another account')) return 'claim_conflict';
  if (m.includes('temporarily unavailable') || m.includes('feature')) {
    return 'feature_disabled';
  }
  if (m.includes('not configured')) return 'config_missing';
  if (m.includes('authentication is required')) return 'auth_required';
  if (m.includes('operation is already in progress')) {
    return 'operation_in_progress';
  }
  if (m.includes('too many verification sends')) return 'rate_limited';
  if (m.includes('challenge not found')) return 'challenge_not_found';
  if (m.includes('six digits')) return 'invalid_code';
  if (m.includes('e.164') || m.includes('international')) return 'invalid_phone';
  return null;
}

export function mapPhoneOtpErrorReason(input: {
  code: PhoneOtpFirebaseErrorCode;
  message?: string;
}): { reason: PhoneOtpErrorReason; retryable: boolean; messageKey: string } {
  const inferred = input.message ? inferReasonFromMessage(input.message) : null;
  if (inferred) {
    return {
      reason: inferred,
      retryable: defaultRetryableForReason(inferred),
      messageKey: messageKeyForReason(inferred),
    };
  }

  switch (input.code) {
    case 'unauthenticated':
      return {
        reason: 'auth_required',
        retryable: false,
        messageKey: 'phoneOtp.errors.authRequired',
      };
    case 'permission-denied':
      return {
        reason: 'generic',
        retryable: false,
        messageKey: 'phoneOtp.errors.generic',
      };
    case 'invalid-argument':
      return {
        reason: 'invalid_code',
        retryable: false,
        messageKey: 'phoneOtp.errors.invalidCode',
      };
    case 'not-found':
      return {
        reason: 'challenge_not_found',
        retryable: false,
        messageKey: 'phoneOtp.errors.challengeNotFound',
      };
    case 'resource-exhausted':
      return {
        reason: 'rate_limited',
        retryable: true,
        messageKey: 'phoneOtp.errors.rateLimited',
      };
    case 'aborted':
      return {
        reason: 'operation_in_progress',
        retryable: true,
        messageKey: 'phoneOtp.errors.operationInProgress',
      };
    case 'unavailable':
      return {
        reason: 'provider_unavailable',
        retryable: true,
        messageKey: 'phoneOtp.errors.providerUnavailable',
      };
    case 'failed-precondition':
      return {
        reason: 'feature_disabled',
        retryable: false,
        messageKey: 'phoneOtp.errors.featureDisabled',
      };
    case 'internal':
      return {
        reason: 'generic',
        retryable: true,
        messageKey: 'phoneOtp.errors.generic',
      };
    default:
      return {
        reason: 'generic_retryable',
        retryable: true,
        messageKey: 'phoneOtp.errors.genericRetryable',
      };
  }
}

function defaultRetryableForReason(reason: PhoneOtpErrorReason): boolean {
  switch (reason) {
    case 'rate_limited':
    case 'operation_in_progress':
    case 'provider_unavailable':
    case 'generic_retryable':
    case 'network':
      return true;
    default:
      return false;
  }
}

export function messageKeyForReason(reason: PhoneOtpErrorReason): string {
  const map: Record<PhoneOtpErrorReason, string> = {
    invalid_phone: 'phoneOtp.errors.invalidPhone',
    invalid_code: 'phoneOtp.errors.invalidCode',
    invalid_challenge: 'phoneOtp.errors.challengeNotFound',
    phone_not_allowed: 'phoneOtp.errors.phoneNotAllowed',
    landline_blocked: 'phoneOtp.errors.landlineBlocked',
    challenge_not_found: 'phoneOtp.errors.challengeNotFound',
    code_mismatch: 'phoneOtp.errors.codeMismatch',
    challenge_expired: 'phoneOtp.errors.challengeExpired',
    challenge_locked: 'phoneOtp.errors.challengeLocked',
    challenge_cancelled: 'phoneOtp.errors.challengeCancelled',
    challenge_failed: 'phoneOtp.errors.challengeFailed',
    claim_conflict: 'phoneOtp.errors.claimConflict',
    verification_not_authorized: 'phoneOtp.errors.verificationNotAuthorized',
    rate_limited: 'phoneOtp.errors.rateLimited',
    cooldown: 'phoneOtp.errors.cooldown',
    operation_in_progress: 'phoneOtp.errors.operationInProgress',
    feature_disabled: 'phoneOtp.errors.featureDisabled',
    auth_required: 'phoneOtp.errors.authRequired',
    app_check_failed: 'phoneOtp.errors.appCheckFailed',
    provider_unavailable: 'phoneOtp.errors.providerUnavailable',
    config_missing: 'phoneOtp.errors.configMissing',
    contract_invalid: 'phoneOtp.errors.generic',
    network: 'phoneOtp.errors.network',
    generic_retryable: 'phoneOtp.errors.genericRetryable',
    generic: 'phoneOtp.errors.generic',
  };
  return map[reason];
}

export function normalizePhoneOtpCallableError(err: unknown): PhoneOtpClientError {
  if (isPhoneOtpClientError(err)) return err;
  if (err instanceof PhoneOtpContractError) {
    return new PhoneOtpClientError({
      code: 'internal',
      reason: 'contract_invalid',
      retryable: false,
      messageKey: 'phoneOtp.errors.generic',
      causeForLog: err,
    });
  }

  const anyErr = err as {
    code?: unknown;
    message?: unknown;
    causeForLog?: unknown;
  };
  const code = normalizeFirebaseErrorCode(anyErr?.code);
  const message =
    typeof anyErr?.message === 'string' ? anyErr.message.slice(0, 240) : '';

  if (
    code === 'failed-precondition' &&
    message.toLowerCase().includes('app check')
  ) {
    return new PhoneOtpClientError({
      code,
      reason: 'app_check_failed',
      retryable: false,
      messageKey: 'phoneOtp.errors.appCheckFailed',
      causeForLog: err,
    });
  }

  const mapped = mapPhoneOtpErrorReason({ code, message });
  return new PhoneOtpClientError({
    code,
    reason: mapped.reason,
    retryable: mapped.retryable,
    messageKey: mapped.messageKey,
    causeForLog: err,
  });
}

export function mapTransportThrowable(err: unknown): never {
  if (isFirebaseCallableHttpError(err)) {
    throw normalizePhoneOtpCallableError({
      code: (err as FirebaseCallableHttpError).code,
      message: err.message,
    });
  }
  if (err && typeof err === 'object' && 'code' in err) {
    throw normalizePhoneOtpCallableError(err);
  }
  throw new PhoneOtpClientError({
    code: 'unavailable',
    reason: 'network',
    retryable: true,
    messageKey: 'phoneOtp.errors.network',
    causeForLog: err,
  });
}

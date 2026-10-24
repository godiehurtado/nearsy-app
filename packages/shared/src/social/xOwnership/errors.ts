import {
  isFirebaseCallableHttpError,
  sanitizeCallableErrorMessage,
} from '../../firebase/callableHttp';
import type { XOwnershipFlowStage } from './devLog';

export type XOwnershipErrorCode =
  | 'X_NOT_ENABLED'
  | 'X_NO_ACCOUNT'
  | 'X_ACCOUNT_CLAIMED'
  | 'X_OAUTH'
  | 'X_RATE_LIMITED'
  | 'X_CREDITS_OR_ACCESS'
  | 'X_FORBIDDEN'
  | 'TX_EXPIRED'
  | 'TX_INVALID'
  | 'TX_FAILED'
  | 'CLIENT_PROOF_INVALID'
  | 'UNAUTHENTICATED'
  | 'CANCELLED'
  | 'DISMISSED'
  | 'SESSION_CHANGED'
  | 'INVALID_RESPONSE'
  | 'INVALID_ARGUMENT'
  | 'NETWORK'
  | 'UNKNOWN';

export type XOwnershipClientErrorOptions = {
  retryable?: boolean;
  stage?: XOwnershipFlowStage;
  wireCode?: string;
};

export class XOwnershipClientError extends Error {
  readonly code: XOwnershipErrorCode;
  readonly retryable: boolean;
  readonly stage?: XOwnershipFlowStage;
  readonly wireCode?: string;

  constructor(
    code: XOwnershipErrorCode,
    message: string,
    retryableOrOptions: boolean | XOwnershipClientErrorOptions = false,
  ) {
    super(sanitizeCallableErrorMessage(message));
    this.name = 'XOwnershipClientError';
    this.code = code;
    if (typeof retryableOrOptions === 'boolean') {
      this.retryable = retryableOrOptions;
    } else {
      this.retryable = retryableOrOptions.retryable ?? false;
      this.stage = retryableOrOptions.stage;
      this.wireCode = retryableOrOptions.wireCode;
    }
  }
}

const TOKEN_MAP: Array<{
  match: RegExp;
  code: XOwnershipErrorCode;
  retryable?: boolean;
}> = [
  { match: /x-not-enabled/i, code: 'X_NOT_ENABLED' },
  { match: /x-no-account/i, code: 'X_NO_ACCOUNT' },
  { match: /x-account-claimed/i, code: 'X_ACCOUNT_CLAIMED' },
  { match: /x-oauth-failed|X_OAUTH/i, code: 'X_OAUTH' },
  { match: /x-rate-limited|X_RATE_LIMITED/i, code: 'X_RATE_LIMITED' },
  {
    match: /x-credits-or-access|X_CREDITS_OR_ACCESS/i,
    code: 'X_CREDITS_OR_ACCESS',
  },
  { match: /x-api-forbidden|X_FORBIDDEN/i, code: 'X_FORBIDDEN' },
  { match: /TX_EXPIRED|Transaction expired/i, code: 'TX_EXPIRED', retryable: true },
  { match: /TX_INVALID|Invalid transaction/i, code: 'TX_INVALID' },
  { match: /TX_FAILED/i, code: 'TX_FAILED', retryable: true },
  {
    match: /CLIENT_PROOF_INVALID|Invalid client proof/i,
    code: 'CLIENT_PROOF_INVALID',
  },
  { match: /UNAUTHORIZED|unauthenticated|Authentication is required/i, code: 'UNAUTHENTICATED' },
  {
    match:
      /INVALID_(START|EXCHANGE|GET|RESPONSE|TRANSACTION|AUTHORIZATION|EXPIRES|USER|USERNAME|CANONICAL)/i,
    code: 'INVALID_RESPONSE',
  },
  { match: /INVALID_ARGUMENT|FORBIDDEN_CLIENT_FIELD|FORBIDDEN_START_FIELD/i, code: 'INVALID_ARGUMENT' },
  {
    match:
      /mode must be personal|mode cannot be changed after Start|Client-supplied X URLs/i,
    code: 'INVALID_ARGUMENT',
  },
  { match: /FORBIDDEN_EXCHANGE_MODE/i, code: 'INVALID_ARGUMENT' },
];

function withMeta(
  err: XOwnershipClientError,
  stage?: XOwnershipFlowStage,
  wireCode?: string,
): XOwnershipClientError {
  if (!stage && !wireCode) return err;
  if (err.stage === stage && err.wireCode === wireCode) return err;
  return new XOwnershipClientError(err.code, err.message, {
    retryable: err.retryable,
    stage: stage ?? err.stage,
    wireCode: wireCode ?? err.wireCode,
  });
}

export function mapXOwnershipThrowable(
  err: unknown,
  stage?: XOwnershipFlowStage,
): XOwnershipClientError {
  if (err instanceof XOwnershipClientError) {
    return withMeta(err, stage, err.wireCode);
  }

  const haystackParts: string[] = [];
  let wireCode: string | undefined;
  if (typeof err === 'string') haystackParts.push(err);
  if (err && typeof err === 'object') {
    const o = err as {
      code?: unknown;
      message?: unknown;
      details?: unknown;
      name?: unknown;
    };
    if (typeof o.code === 'string') {
      haystackParts.push(o.code);
      wireCode = o.code;
    }
    if (typeof o.message === 'string') haystackParts.push(o.message);
    if (typeof o.name === 'string') haystackParts.push(o.name);
    if (typeof o.details === 'string') haystackParts.push(o.details);
    if (o.details && typeof o.details === 'object') {
      const details = o.details as Record<string, unknown>;
      if (typeof details.reason === 'string') {
        haystackParts.push(details.reason);
      }
      haystackParts.push(JSON.stringify(o.details));
    }
  }
  if (isFirebaseCallableHttpError(err)) {
    haystackParts.push(err.code, err.message);
    wireCode = err.code;
  }

  const haystack = haystackParts.join(' ');
  for (const entry of TOKEN_MAP) {
    if (entry.match.test(haystack)) {
      return new XOwnershipClientError(
        entry.code,
        sanitizeCallableErrorMessage(haystackParts[0] || entry.code),
        {
          retryable: entry.retryable ?? false,
          stage,
          wireCode,
        },
      );
    }
  }

  if (/functions\/invalid-argument/i.test(haystack)) {
    return new XOwnershipClientError(
      'INVALID_ARGUMENT',
      sanitizeCallableErrorMessage(
        haystackParts.find((p) => /invalid/i.test(p)) ||
          'X ownership invalid argument.',
      ),
      { retryable: false, stage, wireCode },
    );
  }
  if (/functions\/resource-exhausted/i.test(haystack)) {
    return new XOwnershipClientError(
      'X_RATE_LIMITED',
      'Too many X connection attempts.',
      { retryable: false, stage, wireCode },
    );
  }
  if (/functions\/failed-precondition/i.test(haystack)) {
    return new XOwnershipClientError(
      'TX_INVALID',
      'X ownership precondition failed.',
      { retryable: false, stage, wireCode },
    );
  }
  if (/functions\/permission-denied|functions\/not-found/i.test(haystack)) {
    return new XOwnershipClientError(
      'UNKNOWN',
      'X ownership callable rejected the request.',
      { retryable: false, stage, wireCode },
    );
  }
  if (/functions\/unavailable|functions\/deadline-exceeded/i.test(haystack)) {
    return new XOwnershipClientError(
      'NETWORK',
      'X ownership callable unavailable.',
      { retryable: true, stage, wireCode },
    );
  }
  if (/functions\/internal/i.test(haystack)) {
    return new XOwnershipClientError(
      'UNKNOWN',
      'X ownership request failed on the server.',
      { retryable: true, stage, wireCode },
    );
  }

  if (/network|fetch|timeout/i.test(haystack)) {
    return new XOwnershipClientError(
      'NETWORK',
      'Network error during X ownership.',
      { retryable: true, stage, wireCode },
    );
  }

  return new XOwnershipClientError(
    'UNKNOWN',
    'X ownership request failed.',
    { retryable: true, stage, wireCode },
  );
}

export function xOwnershipErrorMessageKey(code: XOwnershipErrorCode): string {
  switch (code) {
    case 'X_NOT_ENABLED':
      return 'profile.social.x.errors.notEnabled';
    case 'X_NO_ACCOUNT':
      return 'profile.social.x.errors.noAccount';
    case 'X_ACCOUNT_CLAIMED':
      return 'profile.social.x.errors.accountClaimed';
    case 'X_OAUTH':
      return 'profile.social.x.errors.oauth';
    case 'X_RATE_LIMITED':
      return 'profile.social.x.errors.rateLimited';
    case 'X_CREDITS_OR_ACCESS':
      return 'profile.social.x.errors.creditsOrAccess';
    case 'X_FORBIDDEN':
      return 'profile.social.x.errors.forbidden';
    case 'TX_EXPIRED':
      return 'profile.social.x.errors.txExpired';
    case 'TX_INVALID':
    case 'TX_FAILED':
      return 'profile.social.x.errors.txInvalid';
    case 'CLIENT_PROOF_INVALID':
      return 'profile.social.x.errors.proofInvalid';
    case 'UNAUTHENTICATED':
      return 'profile.social.x.errors.unauthenticated';
    case 'CANCELLED':
    case 'DISMISSED':
      return 'profile.social.x.errors.cancelled';
    case 'SESSION_CHANGED':
      return 'profile.social.x.errors.sessionChanged';
    case 'NETWORK':
      return 'profile.social.x.errors.network';
    default:
      return 'profile.social.x.errors.generic';
  }
}

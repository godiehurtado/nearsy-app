import {
  isFirebaseCallableHttpError,
  sanitizeCallableErrorMessage,
} from '../../firebase/callableHttp';
import type { TiktokOwnershipFlowStage } from './devLog';

export type TiktokOwnershipErrorCode =
  | 'TIKTOK_NOT_ENABLED'
  | 'TIKTOK_NO_ACCOUNT'
  | 'TIKTOK_ACCOUNT_CLAIMED'
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

export type TiktokOwnershipClientErrorOptions = {
  retryable?: boolean;
  stage?: TiktokOwnershipFlowStage;
  wireCode?: string;
};

export class TiktokOwnershipClientError extends Error {
  readonly code: TiktokOwnershipErrorCode;
  readonly retryable: boolean;
  readonly stage?: TiktokOwnershipFlowStage;
  readonly wireCode?: string;

  constructor(
    code: TiktokOwnershipErrorCode,
    message: string,
    retryableOrOptions: boolean | TiktokOwnershipClientErrorOptions = false,
  ) {
    super(sanitizeCallableErrorMessage(message));
    this.name = 'TiktokOwnershipClientError';
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
  code: TiktokOwnershipErrorCode;
  retryable?: boolean;
}> = [
  { match: /tiktok-not-enabled/i, code: 'TIKTOK_NOT_ENABLED' },
  { match: /tiktok-no-account/i, code: 'TIKTOK_NO_ACCOUNT' },
  { match: /tiktok-account-claimed/i, code: 'TIKTOK_ACCOUNT_CLAIMED' },
  { match: /TX_EXPIRED/i, code: 'TX_EXPIRED', retryable: true },
  { match: /TX_INVALID/i, code: 'TX_INVALID' },
  { match: /TX_FAILED/i, code: 'TX_FAILED', retryable: true },
  { match: /CLIENT_PROOF_INVALID/i, code: 'CLIENT_PROOF_INVALID' },
  { match: /UNAUTHORIZED|unauthenticated/i, code: 'UNAUTHENTICATED' },
  {
    match:
      /INVALID_(START|EXCHANGE|GET|RESPONSE|TRANSACTION|AUTHORIZATION|EXPIRES|OPEN|USERNAME|CANONICAL)/i,
    code: 'INVALID_RESPONSE',
  },
  { match: /INVALID_ARGUMENT|FORBIDDEN_START_FIELD/i, code: 'INVALID_ARGUMENT' },
  {
    match: /mode must be personal|mode cannot be changed after Start/i,
    code: 'INVALID_ARGUMENT',
  },
  { match: /FORBIDDEN_EXCHANGE_MODE/i, code: 'INVALID_ARGUMENT' },
];

function withMeta(
  err: TiktokOwnershipClientError,
  stage?: TiktokOwnershipFlowStage,
  wireCode?: string,
): TiktokOwnershipClientError {
  if (!stage && !wireCode) return err;
  if (err.stage === stage && err.wireCode === wireCode) return err;
  return new TiktokOwnershipClientError(err.code, err.message, {
    retryable: err.retryable,
    stage: stage ?? err.stage,
    wireCode: wireCode ?? err.wireCode,
  });
}

export function mapTiktokOwnershipThrowable(
  err: unknown,
  stage?: TiktokOwnershipFlowStage,
): TiktokOwnershipClientError {
  if (err instanceof TiktokOwnershipClientError) {
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
      return new TiktokOwnershipClientError(
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
    return new TiktokOwnershipClientError(
      'INVALID_ARGUMENT',
      sanitizeCallableErrorMessage(
        haystackParts.find((p) => /invalid/i.test(p)) ||
          'TikTok ownership invalid argument.',
      ),
      { retryable: false, stage, wireCode },
    );
  }
  if (/functions\/failed-precondition/i.test(haystack)) {
    return new TiktokOwnershipClientError(
      'INVALID_ARGUMENT',
      'TikTok ownership precondition failed.',
      { retryable: true, stage, wireCode },
    );
  }
  if (/functions\/permission-denied|functions\/not-found/i.test(haystack)) {
    return new TiktokOwnershipClientError(
      'UNKNOWN',
      'TikTok ownership callable rejected the request.',
      { retryable: false, stage, wireCode },
    );
  }
  if (/functions\/unavailable|functions\/deadline-exceeded/i.test(haystack)) {
    return new TiktokOwnershipClientError(
      'NETWORK',
      'TikTok ownership callable unavailable.',
      { retryable: true, stage, wireCode },
    );
  }
  if (/functions\/internal/i.test(haystack)) {
    return new TiktokOwnershipClientError(
      'UNKNOWN',
      'TikTok ownership request failed on the server.',
      { retryable: true, stage, wireCode },
    );
  }

  if (/network|fetch|timeout/i.test(haystack)) {
    return new TiktokOwnershipClientError(
      'NETWORK',
      'Network error during TikTok ownership.',
      { retryable: true, stage, wireCode },
    );
  }

  return new TiktokOwnershipClientError(
    'UNKNOWN',
    'TikTok ownership request failed.',
    { retryable: true, stage, wireCode },
  );
}

export function tiktokOwnershipErrorMessageKey(
  code: TiktokOwnershipErrorCode,
): string {
  switch (code) {
    case 'TIKTOK_NOT_ENABLED':
      return 'profile.social.tiktok.errors.notEnabled';
    case 'TIKTOK_NO_ACCOUNT':
      return 'profile.social.tiktok.errors.noAccount';
    case 'TIKTOK_ACCOUNT_CLAIMED':
      return 'profile.social.tiktok.errors.accountClaimed';
    case 'TX_EXPIRED':
      return 'profile.social.tiktok.errors.txExpired';
    case 'TX_INVALID':
    case 'TX_FAILED':
      return 'profile.social.tiktok.errors.txInvalid';
    case 'CLIENT_PROOF_INVALID':
      return 'profile.social.tiktok.errors.proofInvalid';
    case 'UNAUTHENTICATED':
      return 'profile.social.tiktok.errors.unauthenticated';
    case 'CANCELLED':
    case 'DISMISSED':
      return 'profile.social.tiktok.errors.cancelled';
    case 'SESSION_CHANGED':
      return 'profile.social.tiktok.errors.sessionChanged';
    case 'NETWORK':
      return 'profile.social.tiktok.errors.network';
    default:
      return 'profile.social.tiktok.errors.generic';
  }
}

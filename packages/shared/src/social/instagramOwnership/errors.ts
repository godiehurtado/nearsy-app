import {
  isFirebaseCallableHttpError,
  sanitizeCallableErrorMessage,
} from '../../firebase/callableHttp';
import type { InstagramOwnershipFlowStage } from './devLog';

export type InstagramOwnershipErrorCode =
  | 'INSTAGRAM_NOT_ENABLED'
  | 'INSTAGRAM_ACCOUNT_CLAIMED'
  | 'INSTAGRAM_RATE_LIMITED'
  | 'INSTAGRAM_NO_USERNAME'
  | 'TX_EXPIRED'
  | 'UNAUTHENTICATED'
  | 'SESSION_CHANGED'
  | 'INVALID_RESPONSE'
  | 'INVALID_ARGUMENT'
  | 'NETWORK'
  | 'UNKNOWN';

export type InstagramOwnershipClientErrorOptions = {
  retryable?: boolean;
  stage?: InstagramOwnershipFlowStage;
  wireCode?: string;
};

export class InstagramOwnershipClientError extends Error {
  readonly code: InstagramOwnershipErrorCode;
  readonly retryable: boolean;
  readonly stage?: InstagramOwnershipFlowStage;
  readonly wireCode?: string;

  constructor(
    code: InstagramOwnershipErrorCode,
    message: string,
    retryableOrOptions: boolean | InstagramOwnershipClientErrorOptions = false,
  ) {
    super(sanitizeCallableErrorMessage(message));
    this.name = 'InstagramOwnershipClientError';
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
  code: InstagramOwnershipErrorCode;
  retryable?: boolean;
}> = [
  { match: /instagram-not-enabled/i, code: 'INSTAGRAM_NOT_ENABLED' },
  { match: /instagram-inbox-not-connected/i, code: 'INSTAGRAM_NOT_ENABLED' },
  {
    match: /instagram-account-claimed/i,
    code: 'INSTAGRAM_ACCOUNT_CLAIMED',
  },
  { match: /instagram-rate-limited/i, code: 'INSTAGRAM_RATE_LIMITED' },
  { match: /instagram-no-username/i, code: 'INSTAGRAM_NO_USERNAME' },
  { match: /UNAUTHORIZED|unauthenticated/i, code: 'UNAUTHENTICATED' },
  {
    match:
      /INVALID_(START|GET|RESPONSE|CHALLENGE|EXPIRES|IGSID|USERNAME|CANONICAL|INBOX|PENDING|VERIFIED)/i,
    code: 'INVALID_RESPONSE',
  },
  {
    match: /INVALID_ARGUMENT|FORBIDDEN_CLIENT_FIELD/i,
    code: 'INVALID_ARGUMENT',
  },
  {
    match: /mode must be personal|Invalid platform/i,
    code: 'INVALID_ARGUMENT',
  },
];

function withMeta(
  err: InstagramOwnershipClientError,
  stage?: InstagramOwnershipFlowStage,
  wireCode?: string,
): InstagramOwnershipClientError {
  if (!stage && !wireCode) return err;
  if (err.stage === stage && err.wireCode === wireCode) return err;
  return new InstagramOwnershipClientError(err.code, err.message, {
    retryable: err.retryable,
    stage: stage ?? err.stage,
    wireCode: wireCode ?? err.wireCode,
  });
}

export function mapInstagramOwnershipThrowable(
  err: unknown,
  stage?: InstagramOwnershipFlowStage,
): InstagramOwnershipClientError {
  if (err instanceof InstagramOwnershipClientError) {
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
      return new InstagramOwnershipClientError(
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
    return new InstagramOwnershipClientError(
      'INVALID_ARGUMENT',
      sanitizeCallableErrorMessage(
        haystackParts.find((p) => /invalid/i.test(p)) ||
          'Instagram ownership invalid argument.',
      ),
      { retryable: false, stage, wireCode },
    );
  }
  if (/functions\/resource-exhausted/i.test(haystack)) {
    return new InstagramOwnershipClientError(
      'INSTAGRAM_RATE_LIMITED',
      'Too many Instagram verification attempts.',
      { retryable: false, stage, wireCode },
    );
  }
  if (/functions\/failed-precondition/i.test(haystack)) {
    return new InstagramOwnershipClientError(
      'INSTAGRAM_NO_USERNAME',
      'Instagram ownership precondition failed.',
      { retryable: true, stage, wireCode },
    );
  }
  if (/functions\/permission-denied|functions\/not-found/i.test(haystack)) {
    return new InstagramOwnershipClientError(
      'UNKNOWN',
      'Instagram ownership callable rejected the request.',
      { retryable: false, stage, wireCode },
    );
  }
  if (/functions\/unavailable|functions\/deadline-exceeded/i.test(haystack)) {
    return new InstagramOwnershipClientError(
      'NETWORK',
      'Instagram ownership callable unavailable.',
      { retryable: true, stage, wireCode },
    );
  }
  if (/functions\/internal/i.test(haystack)) {
    return new InstagramOwnershipClientError(
      'UNKNOWN',
      'Instagram ownership request failed on the server.',
      { retryable: true, stage, wireCode },
    );
  }

  if (/network|fetch|timeout/i.test(haystack)) {
    return new InstagramOwnershipClientError(
      'NETWORK',
      'Network error during Instagram ownership.',
      { retryable: true, stage, wireCode },
    );
  }

  return new InstagramOwnershipClientError(
    'UNKNOWN',
    'Instagram ownership request failed.',
    { retryable: true, stage, wireCode },
  );
}

export function instagramOwnershipErrorMessageKey(
  code: InstagramOwnershipErrorCode,
): string {
  switch (code) {
    case 'INSTAGRAM_NOT_ENABLED':
      return 'profile.social.instagram.errors.notEnabled';
    case 'INSTAGRAM_ACCOUNT_CLAIMED':
      return 'profile.social.instagram.errors.accountClaimed';
    case 'INSTAGRAM_RATE_LIMITED':
      return 'profile.social.instagram.errors.rateLimited';
    case 'INSTAGRAM_NO_USERNAME':
      return 'profile.social.instagram.errors.noUsername';
    case 'TX_EXPIRED':
      return 'profile.social.instagram.errors.txExpired';
    case 'UNAUTHENTICATED':
      return 'profile.social.instagram.errors.unauthenticated';
    case 'SESSION_CHANGED':
      return 'profile.social.instagram.errors.sessionChanged';
    case 'NETWORK':
      return 'profile.social.instagram.errors.network';
    default:
      return 'profile.social.instagram.errors.generic';
  }
}

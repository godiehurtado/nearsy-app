import {
  isFirebaseCallableHttpError,
  sanitizeCallableErrorMessage,
} from '../../firebase/callableHttp';
import type { YoutubeOwnershipFlowStage } from './devLog';

export type YoutubeOwnershipErrorCode =
  | 'YOUTUBE_NOT_ENABLED'
  | 'YOUTUBE_NO_CHANNEL'
  | 'YOUTUBE_CHANNEL_CLAIMED'
  | 'YOUTUBE_CHANNEL_NOT_IN_CANDIDATES'
  | 'YOUTUBE_NOT_LINKED'
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

export type YoutubeOwnershipClientErrorOptions = {
  retryable?: boolean;
  stage?: YoutubeOwnershipFlowStage;
  /** Firebase/callable wire code (e.g. functions/failed-precondition). Never a token. */
  wireCode?: string;
};

export class YoutubeOwnershipClientError extends Error {
  readonly code: YoutubeOwnershipErrorCode;
  readonly retryable: boolean;
  readonly stage?: YoutubeOwnershipFlowStage;
  readonly wireCode?: string;

  constructor(
    code: YoutubeOwnershipErrorCode,
    message: string,
    retryableOrOptions: boolean | YoutubeOwnershipClientErrorOptions = false,
  ) {
    super(sanitizeCallableErrorMessage(message));
    this.name = 'YoutubeOwnershipClientError';
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
  code: YoutubeOwnershipErrorCode;
  retryable?: boolean;
}> = [
  { match: /youtube-not-enabled/i, code: 'YOUTUBE_NOT_ENABLED' },
  { match: /youtube-no-channel/i, code: 'YOUTUBE_NO_CHANNEL' },
  { match: /youtube-channel-claimed/i, code: 'YOUTUBE_CHANNEL_CLAIMED' },
  {
    match: /youtube-channel-not-in-candidates/i,
    code: 'YOUTUBE_CHANNEL_NOT_IN_CANDIDATES',
  },
  { match: /youtube-not-linked/i, code: 'YOUTUBE_NOT_LINKED' },
  { match: /TX_EXPIRED/i, code: 'TX_EXPIRED', retryable: true },
  { match: /TX_INVALID/i, code: 'TX_INVALID' },
  { match: /TX_FAILED/i, code: 'TX_FAILED', retryable: true },
  { match: /CLIENT_PROOF_INVALID/i, code: 'CLIENT_PROOF_INVALID' },
  { match: /unauthenticated/i, code: 'UNAUTHENTICATED' },
  {
    match: /INVALID_(START|EXCHANGE|GET|SELECT|PUBLICATION|RESPONSE|TRANSACTION|CHANNEL|AUTHORIZATION|EXPIRES|CUSTOM)/i,
    code: 'INVALID_RESPONSE',
  },
  { match: /INVALID_ARGUMENT|FORBIDDEN_START_FIELD/i, code: 'INVALID_ARGUMENT' },
  {
    match: /mode must be personal|mode cannot be changed after Start/i,
    code: 'INVALID_ARGUMENT',
  },
  {
    match: /FORBIDDEN_EXCHANGE_MODE|FORBIDDEN_SELECT_MODE/i,
    code: 'INVALID_ARGUMENT',
  },
];

function withMeta(
  err: YoutubeOwnershipClientError,
  stage?: YoutubeOwnershipFlowStage,
  wireCode?: string,
): YoutubeOwnershipClientError {
  if (!stage && !wireCode) return err;
  if (err.stage === stage && err.wireCode === wireCode) return err;
  return new YoutubeOwnershipClientError(err.code, err.message, {
    retryable: err.retryable,
    stage: stage ?? err.stage,
    wireCode: wireCode ?? err.wireCode,
  });
}

export function mapYoutubeOwnershipThrowable(
  err: unknown,
  stage?: YoutubeOwnershipFlowStage,
): YoutubeOwnershipClientError {
  if (err instanceof YoutubeOwnershipClientError) {
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
      return new YoutubeOwnershipClientError(
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
    return new YoutubeOwnershipClientError(
      'INVALID_ARGUMENT',
      sanitizeCallableErrorMessage(
        haystackParts.find((p) => /invalid/i.test(p)) ||
          'YouTube ownership invalid argument.',
      ),
      { retryable: false, stage, wireCode },
    );
  }
  if (/functions\/failed-precondition/i.test(haystack)) {
    return new YoutubeOwnershipClientError(
      'INVALID_ARGUMENT',
      'YouTube ownership precondition failed.',
      { retryable: true, stage, wireCode },
    );
  }
  if (/functions\/permission-denied|functions\/not-found/i.test(haystack)) {
    return new YoutubeOwnershipClientError(
      'UNKNOWN',
      'YouTube ownership callable rejected the request.',
      { retryable: false, stage, wireCode },
    );
  }
  if (/functions\/unavailable|functions\/deadline-exceeded/i.test(haystack)) {
    return new YoutubeOwnershipClientError(
      'NETWORK',
      'YouTube ownership callable unavailable.',
      { retryable: true, stage, wireCode },
    );
  }
  // Server uncaught exception (not a transport failure). Do not present as Network.
  if (/functions\/internal/i.test(haystack)) {
    return new YoutubeOwnershipClientError(
      'UNKNOWN',
      'YouTube ownership request failed on the server.',
      { retryable: true, stage, wireCode },
    );
  }

  if (/network|fetch|timeout/i.test(haystack)) {
    return new YoutubeOwnershipClientError(
      'NETWORK',
      'Network error during YouTube ownership.',
      { retryable: true, stage, wireCode },
    );
  }

  return new YoutubeOwnershipClientError(
    'UNKNOWN',
    'YouTube ownership request failed.',
    { retryable: true, stage, wireCode },
  );
}

export function youtubeOwnershipErrorMessageKey(
  code: YoutubeOwnershipErrorCode,
): string {
  switch (code) {
    case 'YOUTUBE_NOT_ENABLED':
      return 'profile.social.youtube.errors.notEnabled';
    case 'YOUTUBE_NO_CHANNEL':
      return 'profile.social.youtube.errors.noChannel';
    case 'YOUTUBE_CHANNEL_CLAIMED':
      return 'profile.social.youtube.errors.channelClaimed';
    case 'YOUTUBE_CHANNEL_NOT_IN_CANDIDATES':
      return 'profile.social.youtube.errors.channelNotInCandidates';
    case 'YOUTUBE_NOT_LINKED':
      return 'profile.social.youtube.errors.notLinked';
    case 'TX_EXPIRED':
      return 'profile.social.youtube.errors.txExpired';
    case 'TX_INVALID':
    case 'TX_FAILED':
      return 'profile.social.youtube.errors.txInvalid';
    case 'CLIENT_PROOF_INVALID':
      return 'profile.social.youtube.errors.proofInvalid';
    case 'UNAUTHENTICATED':
      return 'profile.social.youtube.errors.unauthenticated';
    case 'CANCELLED':
    case 'DISMISSED':
      return 'profile.social.youtube.errors.cancelled';
    case 'SESSION_CHANGED':
      return 'profile.social.youtube.errors.sessionChanged';
    case 'NETWORK':
      return 'profile.social.youtube.errors.network';
    default:
      return 'profile.social.youtube.errors.generic';
  }
}

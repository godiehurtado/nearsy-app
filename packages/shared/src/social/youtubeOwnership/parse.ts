import {
  assertClientProofChallengeShape,
  assertClientProofVerifierShape,
  CLIENT_PROOF_METHOD_S256,
} from '../../authentication/linkedinA3/clientProof';
import {
  YOUTUBE_OWNERSHIP_CLIENT_PLATFORMS,
  YOUTUBE_OWNERSHIP_MODES,
  YOUTUBE_OWNERSHIP_PLATFORM,
  type YoutubeOwnershipClientPlatform,
  type YoutubeOwnershipMode,
} from './names';
import type {
  YoutubeOwnershipChannelCandidate,
  YoutubeOwnershipExchangeRequest,
  YoutubeOwnershipExchangeResponse,
  YoutubeOwnershipGetRequest,
  YoutubeOwnershipGetResponse,
  YoutubeOwnershipSelectChannelRequest,
  YoutubeOwnershipStartRequest,
  YoutubeOwnershipStartResponse,
  YoutubeOwnershipUnlinkRequest,
  YoutubeOwnershipUnlinked,
  YoutubeOwnershipVerified,
} from './wireTypes';

const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;
const MIN_TX = 8;
const MAX_TX = 128;
const CHANNEL_ID_RE = /^UC[A-Za-z0-9_-]{22}$/;

const MODE_SET = new Set<string>(YOUTUBE_OWNERSHIP_MODES);
const CLIENT_PLATFORM_SET = new Set<string>(YOUTUBE_OWNERSHIP_CLIENT_PLATFORMS);

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function assertYoutubeOwnershipMode(value: unknown): YoutubeOwnershipMode {
  if (typeof value !== 'string' || !MODE_SET.has(value)) {
    throw new Error('INVALID_YOUTUBE_OWNERSHIP_MODE');
  }
  return value as YoutubeOwnershipMode;
}

export function assertYoutubeOwnershipClientPlatform(
  value: unknown,
): YoutubeOwnershipClientPlatform {
  if (typeof value !== 'string' || !CLIENT_PLATFORM_SET.has(value)) {
    throw new Error('INVALID_START_PLATFORM');
  }
  return value as YoutubeOwnershipClientPlatform;
}

export function assertYoutubeOwnershipTransactionId(
  transactionId: unknown,
): string {
  if (
    !isNonEmptyString(transactionId) ||
    transactionId.length < MIN_TX ||
    transactionId.length > MAX_TX ||
    !BASE64URL_RE.test(transactionId)
  ) {
    throw new Error('INVALID_TRANSACTION_ID');
  }
  return transactionId;
}

export function assertYoutubeChannelId(channelId: unknown): string {
  if (!isNonEmptyString(channelId) || !CHANNEL_ID_RE.test(channelId)) {
    throw new Error('INVALID_CHANNEL_ID');
  }
  return channelId;
}

export function assertYoutubeOwnershipStartRequest(
  input: unknown,
): YoutubeOwnershipStartRequest {
  if (!isPlainObject(input)) throw new Error('INVALID_START_REQUEST');
  const mode = assertYoutubeOwnershipMode(input.mode);
  const platform = assertYoutubeOwnershipClientPlatform(input.platform);
  if (input.clientProofMethod !== CLIENT_PROOF_METHOD_S256) {
    throw new Error('INVALID_CLIENT_PROOF_METHOD');
  }
  for (const forbidden of ['url', 'channelUrl', 'redirectUri', 'returnUrl']) {
    if (forbidden in input) throw new Error('FORBIDDEN_START_FIELD');
  }
  const challenge = String(input.clientProofChallenge ?? '');
  assertClientProofChallengeShape(challenge);
  if (challenge.includes('=') || challenge.includes('+') || challenge.includes('/')) {
    throw new Error('INVALID_CLIENT_PROOF_CHALLENGE_ENCODING');
  }
  if (/^[0-9a-fA-F]+$/.test(challenge) && challenge.length === 64) {
    throw new Error('INVALID_CLIENT_PROOF_CHALLENGE_HEX');
  }
  return {
    mode,
    platform,
    clientProofChallenge: challenge,
    clientProofMethod: CLIENT_PROOF_METHOD_S256,
  };
}

export function normalizeYoutubeOwnershipExpiresAt(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return new Date(value).toISOString();
  }
  if (isNonEmptyString(value)) {
    const ms = Date.parse(value);
    if (!Number.isFinite(ms)) throw new Error('INVALID_EXPIRES_AT');
    return new Date(ms).toISOString();
  }
  throw new Error('INVALID_EXPIRES_AT');
}

export function assertYoutubeOwnershipStartResponse(
  data: unknown,
): YoutubeOwnershipStartResponse {
  if (!isPlainObject(data)) throw new Error('INVALID_START_RESPONSE');
  const transactionId = assertYoutubeOwnershipTransactionId(data.transactionId);
  const mode = assertYoutubeOwnershipMode(data.mode);
  if (
    !isNonEmptyString(data.authorizationUrl) ||
    !data.authorizationUrl.startsWith('https://')
  ) {
    throw new Error('INVALID_AUTHORIZATION_URL');
  }
  const expiresAt = normalizeYoutubeOwnershipExpiresAt(data.expiresAt);
  return {
    transactionId,
    mode,
    authorizationUrl: data.authorizationUrl,
    expiresAt,
  };
}

function parseCustomUrlCache(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw new Error('INVALID_CUSTOM_URL_CACHE');
  return value;
}

export function assertYoutubeOwnershipVerified(
  data: unknown,
): YoutubeOwnershipVerified {
  if (!isPlainObject(data)) throw new Error('INVALID_VERIFIED');
  if (data.result !== 'verified') throw new Error('INVALID_VERIFIED_RESULT');
  if (data.platform !== YOUTUBE_OWNERSHIP_PLATFORM) {
    throw new Error('INVALID_VERIFIED_PLATFORM');
  }
  const mode = assertYoutubeOwnershipMode(data.mode);
  const channelId = assertYoutubeChannelId(data.channelId);
  if (
    !isNonEmptyString(data.canonicalUrl) ||
    !data.canonicalUrl.startsWith('https://')
  ) {
    throw new Error('INVALID_CANONICAL_URL');
  }
  if (!isNonEmptyString(data.verifiedAt)) {
    throw new Error('INVALID_VERIFIED_AT');
  }
  return {
    result: 'verified',
    platform: YOUTUBE_OWNERSHIP_PLATFORM,
    mode,
    channelId,
    canonicalUrl: data.canonicalUrl,
    customUrlCache: parseCustomUrlCache(data.customUrlCache),
    verifiedAt: data.verifiedAt,
  };
}

function assertChannelCandidate(
  value: unknown,
): YoutubeOwnershipChannelCandidate {
  if (!isPlainObject(value)) throw new Error('INVALID_CHANNEL_CANDIDATE');
  const channelId = assertYoutubeChannelId(value.channelId);
  const out: YoutubeOwnershipChannelCandidate = { channelId };
  if (isNonEmptyString(value.title)) out.title = value.title;
  if (isNonEmptyString(value.canonicalUrl)) {
    out.canonicalUrl = value.canonicalUrl;
  }
  if (value.customUrlCache === null) out.customUrlCache = null;
  else if (isNonEmptyString(value.customUrlCache)) {
    out.customUrlCache = value.customUrlCache;
  }
  return out;
}

export function assertYoutubeOwnershipExchangeRequest(
  input: unknown,
): YoutubeOwnershipExchangeRequest {
  if (!isPlainObject(input)) throw new Error('INVALID_EXCHANGE_REQUEST');
  if ('mode' in input) throw new Error('FORBIDDEN_EXCHANGE_MODE');
  return {
    transactionId: assertYoutubeOwnershipTransactionId(input.transactionId),
    clientProofVerifier: assertClientProofVerifier(input.clientProofVerifier),
  };
}

export function assertYoutubeOwnershipExchangeResponse(
  data: unknown,
): YoutubeOwnershipExchangeResponse {
  if (!isPlainObject(data)) throw new Error('INVALID_EXCHANGE_RESPONSE');
  if (data.result === 'verified') {
    return assertYoutubeOwnershipVerified(data);
  }
  if (data.result !== 'select_channel') {
    throw new Error('INVALID_EXCHANGE_RESULT');
  }
  if (data.platform !== YOUTUBE_OWNERSHIP_PLATFORM) {
    throw new Error('INVALID_SELECT_PLATFORM');
  }
  const mode = assertYoutubeOwnershipMode(data.mode);
  const transactionId = assertYoutubeOwnershipTransactionId(data.transactionId);
  if (!Array.isArray(data.channels) || data.channels.length === 0) {
    throw new Error('INVALID_CHANNELS');
  }
  return {
    result: 'select_channel',
    platform: YOUTUBE_OWNERSHIP_PLATFORM,
    mode,
    transactionId,
    channels: data.channels.map(assertChannelCandidate),
  };
}

export function assertYoutubeOwnershipSelectChannelRequest(
  input: unknown,
): YoutubeOwnershipSelectChannelRequest {
  if (!isPlainObject(input)) throw new Error('INVALID_SELECT_REQUEST');
  if ('mode' in input) throw new Error('FORBIDDEN_SELECT_MODE');
  return {
    transactionId: assertYoutubeOwnershipTransactionId(input.transactionId),
    channelId: assertYoutubeChannelId(input.channelId),
  };
}

export function assertYoutubeOwnershipGetRequest(
  input: unknown,
): YoutubeOwnershipGetRequest {
  if (!isPlainObject(input)) throw new Error('INVALID_GET_REQUEST');
  return { mode: assertYoutubeOwnershipMode(input.mode) };
}

export function assertYoutubeOwnershipGetResponse(
  data: unknown,
): YoutubeOwnershipGetResponse {
  if (!isPlainObject(data)) throw new Error('INVALID_GET_RESPONSE');
  if (data.result === 'verified') {
    return assertYoutubeOwnershipVerified(data);
  }
  if (data.result !== 'not_linked') throw new Error('INVALID_GET_RESULT');
  if (data.platform !== YOUTUBE_OWNERSHIP_PLATFORM) {
    throw new Error('INVALID_GET_PLATFORM');
  }
  const mode = assertYoutubeOwnershipMode(data.mode);
  if (data.linked !== false) throw new Error('INVALID_GET_LINKED');
  return {
    result: 'not_linked',
    platform: YOUTUBE_OWNERSHIP_PLATFORM,
    mode,
    linked: false,
  };
}

export function assertYoutubeOwnershipUnlinkRequest(
  input: unknown,
): YoutubeOwnershipUnlinkRequest {
  if (!isPlainObject(input)) throw new Error('INVALID_UNLINK_REQUEST');
  return { mode: assertYoutubeOwnershipMode(input.mode) };
}

export function assertYoutubeOwnershipUnlinked(
  data: unknown,
): YoutubeOwnershipUnlinked {
  if (!isPlainObject(data)) throw new Error('INVALID_UNLINK_RESPONSE');
  if (data.result !== 'unlinked') throw new Error('INVALID_UNLINK_RESULT');
  if (data.platform !== YOUTUBE_OWNERSHIP_PLATFORM) {
    throw new Error('INVALID_UNLINK_PLATFORM');
  }
  const mode = assertYoutubeOwnershipMode(data.mode);
  if (data.unlinked !== true) throw new Error('INVALID_UNLINK_FLAG');
  return {
    result: 'unlinked',
    platform: YOUTUBE_OWNERSHIP_PLATFORM,
    mode,
    unlinked: true,
  };
}

export function assertClientProofVerifier(input: unknown): string {
  const value = String(input ?? '');
  assertClientProofVerifierShape(value);
  return value;
}

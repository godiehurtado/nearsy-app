import {
  assertClientProofChallengeShape,
  assertClientProofVerifierShape,
  CLIENT_PROOF_METHOD_S256,
} from '../../authentication/linkedinA3/clientProof';
import {
  TIKTOK_OWNERSHIP_CLIENT_PLATFORMS,
  TIKTOK_OWNERSHIP_MODES,
  TIKTOK_OWNERSHIP_PLATFORM,
  type TiktokOwnershipClientPlatform,
  type TiktokOwnershipMode,
} from './names';
import type {
  TiktokOwnershipExchangeRequest,
  TiktokOwnershipExchangeResponse,
  TiktokOwnershipGetRequest,
  TiktokOwnershipGetResponse,
  TiktokOwnershipStartRequest,
  TiktokOwnershipStartResponse,
  TiktokOwnershipUnlinkRequest,
  TiktokOwnershipUnlinked,
  TiktokOwnershipVerified,
} from './wireTypes';

const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;
const MIN_TX = 8;
const MAX_TX = 128;
const USERNAME_RE = /^[A-Za-z0-9._]{2,24}$/;
const CANONICAL_URL_RE =
  /^https:\/\/www\.tiktok\.com\/@([A-Za-z0-9._]{2,24})$/;
const OPEN_ID_RE = /^[^\s]{1,256}$/;

const MODE_SET = new Set<string>(TIKTOK_OWNERSHIP_MODES);
const CLIENT_PLATFORM_SET = new Set<string>(TIKTOK_OWNERSHIP_CLIENT_PLATFORMS);

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function assertTiktokOwnershipMode(value: unknown): TiktokOwnershipMode {
  if (typeof value !== 'string' || !MODE_SET.has(value)) {
    throw new Error('INVALID_TIKTOK_OWNERSHIP_MODE');
  }
  return value as TiktokOwnershipMode;
}

export function assertTiktokOwnershipClientPlatform(
  value: unknown,
): TiktokOwnershipClientPlatform {
  if (typeof value !== 'string' || !CLIENT_PLATFORM_SET.has(value)) {
    throw new Error('INVALID_START_PLATFORM');
  }
  return value as TiktokOwnershipClientPlatform;
}

export function assertTiktokOwnershipTransactionId(
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

export function assertTiktokUsername(username: unknown): string {
  if (!isNonEmptyString(username) || !USERNAME_RE.test(username)) {
    throw new Error('INVALID_USERNAME_CACHE');
  }
  return username;
}

export function assertTiktokCanonicalUrl(url: unknown): string {
  if (!isNonEmptyString(url) || !CANONICAL_URL_RE.test(url)) {
    throw new Error('INVALID_CANONICAL_URL');
  }
  return url;
}

export function assertTiktokOpenId(openId: unknown): string {
  if (!isNonEmptyString(openId) || !OPEN_ID_RE.test(openId.trim())) {
    throw new Error('INVALID_OPEN_ID');
  }
  return openId.trim();
}

export function assertTiktokOwnershipStartRequest(
  input: unknown,
): TiktokOwnershipStartRequest {
  if (!isPlainObject(input)) throw new Error('INVALID_START_REQUEST');
  const mode = assertTiktokOwnershipMode(input.mode);
  const platform = assertTiktokOwnershipClientPlatform(input.platform);
  if (input.clientProofMethod !== CLIENT_PROOF_METHOD_S256) {
    throw new Error('INVALID_CLIENT_PROOF_METHOD');
  }
  for (const forbidden of [
    'url',
    'profileUrl',
    'handle',
    'username',
    'redirectUri',
    'returnUrl',
  ]) {
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

export function normalizeTiktokOwnershipExpiresAt(value: unknown): string {
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

export function assertTiktokOwnershipStartResponse(
  data: unknown,
): TiktokOwnershipStartResponse {
  if (!isPlainObject(data)) throw new Error('INVALID_START_RESPONSE');
  const transactionId = assertTiktokOwnershipTransactionId(data.transactionId);
  const mode = assertTiktokOwnershipMode(data.mode);
  if (
    !isNonEmptyString(data.authorizationUrl) ||
    !data.authorizationUrl.startsWith('https://')
  ) {
    throw new Error('INVALID_AUTHORIZATION_URL');
  }
  // Login Kit Web must not include provider PKCE on the authorize URL.
  if (/[?&]code_challenge(=|&|$)/i.test(data.authorizationUrl)) {
    throw new Error('INVALID_AUTHORIZATION_URL_PKCE');
  }
  const expiresAt = normalizeTiktokOwnershipExpiresAt(data.expiresAt);
  return {
    transactionId,
    mode,
    authorizationUrl: data.authorizationUrl,
    expiresAt,
  };
}

export function assertTiktokOwnershipVerified(
  data: unknown,
): TiktokOwnershipVerified {
  if (!isPlainObject(data)) throw new Error('INVALID_VERIFIED');
  if (data.result !== 'verified') throw new Error('INVALID_VERIFIED_RESULT');
  if (data.platform !== TIKTOK_OWNERSHIP_PLATFORM) {
    throw new Error('INVALID_VERIFIED_PLATFORM');
  }
  const mode = assertTiktokOwnershipMode(data.mode);
  const openId = assertTiktokOpenId(data.openId);
  const usernameCache = assertTiktokUsername(data.usernameCache);
  const canonicalUrl = assertTiktokCanonicalUrl(data.canonicalUrl);
  const match = CANONICAL_URL_RE.exec(canonicalUrl);
  if (!match || match[1] !== usernameCache) {
    throw new Error('INVALID_CANONICAL_USERNAME_MISMATCH');
  }
  if (!isNonEmptyString(data.verifiedAt)) {
    throw new Error('INVALID_VERIFIED_AT');
  }
  return {
    result: 'verified',
    platform: TIKTOK_OWNERSHIP_PLATFORM,
    mode,
    openId,
    canonicalUrl,
    usernameCache,
    verifiedAt: data.verifiedAt,
  };
}

export function assertTiktokOwnershipExchangeRequest(
  input: unknown,
): TiktokOwnershipExchangeRequest {
  if (!isPlainObject(input)) throw new Error('INVALID_EXCHANGE_REQUEST');
  if ('mode' in input) throw new Error('FORBIDDEN_EXCHANGE_MODE');
  return {
    transactionId: assertTiktokOwnershipTransactionId(input.transactionId),
    clientProofVerifier: assertClientProofVerifier(input.clientProofVerifier),
  };
}

export function assertTiktokOwnershipExchangeResponse(
  data: unknown,
): TiktokOwnershipExchangeResponse {
  if (!isPlainObject(data)) throw new Error('INVALID_EXCHANGE_RESPONSE');
  if (data.result !== 'verified') {
    throw new Error('INVALID_EXCHANGE_RESULT');
  }
  return assertTiktokOwnershipVerified(data);
}

export function assertTiktokOwnershipGetRequest(
  input: unknown,
): TiktokOwnershipGetRequest {
  if (!isPlainObject(input)) throw new Error('INVALID_GET_REQUEST');
  return { mode: assertTiktokOwnershipMode(input.mode) };
}

export function assertTiktokOwnershipGetResponse(
  data: unknown,
): TiktokOwnershipGetResponse {
  if (!isPlainObject(data)) throw new Error('INVALID_GET_RESPONSE');
  if (data.result === 'verified') {
    return assertTiktokOwnershipVerified(data);
  }
  if (data.result !== 'not_linked') throw new Error('INVALID_GET_RESULT');
  if (data.platform !== TIKTOK_OWNERSHIP_PLATFORM) {
    throw new Error('INVALID_GET_PLATFORM');
  }
  const mode = assertTiktokOwnershipMode(data.mode);
  if (data.linked !== false) throw new Error('INVALID_GET_LINKED');
  return {
    result: 'not_linked',
    platform: TIKTOK_OWNERSHIP_PLATFORM,
    mode,
    linked: false,
  };
}

export function assertTiktokOwnershipUnlinkRequest(
  input: unknown,
): TiktokOwnershipUnlinkRequest {
  if (!isPlainObject(input)) throw new Error('INVALID_UNLINK_REQUEST');
  return { mode: assertTiktokOwnershipMode(input.mode) };
}

export function assertTiktokOwnershipUnlinked(
  data: unknown,
): TiktokOwnershipUnlinked {
  if (!isPlainObject(data)) throw new Error('INVALID_UNLINK_RESPONSE');
  if (data.result !== 'unlinked') throw new Error('INVALID_UNLINK_RESULT');
  if (data.platform !== TIKTOK_OWNERSHIP_PLATFORM) {
    throw new Error('INVALID_UNLINK_PLATFORM');
  }
  const mode = assertTiktokOwnershipMode(data.mode);
  if (data.unlinked !== true) throw new Error('INVALID_UNLINK_FLAG');
  return {
    result: 'unlinked',
    platform: TIKTOK_OWNERSHIP_PLATFORM,
    mode,
    unlinked: true,
  };
}

export function assertClientProofVerifier(input: unknown): string {
  const value = String(input ?? '');
  assertClientProofVerifierShape(value);
  return value;
}

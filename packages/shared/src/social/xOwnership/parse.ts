import {
  assertClientProofChallengeShape,
  assertClientProofVerifierShape,
  CLIENT_PROOF_METHOD_S256,
} from '../../authentication/linkedinA3/clientProof';
import {
  X_OWNERSHIP_CLIENT_PLATFORMS,
  X_OWNERSHIP_MODES,
  X_OWNERSHIP_PLATFORM,
  type XOwnershipClientPlatform,
  type XOwnershipMode,
} from './names';
import type {
  XOwnershipExchangeRequest,
  XOwnershipExchangeResponse,
  XOwnershipGetRequest,
  XOwnershipGetResponse,
  XOwnershipStartRequest,
  XOwnershipStartResponse,
  XOwnershipUnlinkRequest,
  XOwnershipUnlinked,
  XOwnershipVerified,
} from './wireTypes';

const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;
const MIN_TX = 8;
const MAX_TX = 128;
const USERNAME_RE = /^[A-Za-z0-9_]{1,15}$/;
const CANONICAL_URL_RE = /^https:\/\/x\.com\/([A-Za-z0-9_]{1,15})$/;
const USER_ID_RE = /^\d{1,20}$/;

const MODE_SET = new Set<string>(X_OWNERSHIP_MODES);
const CLIENT_PLATFORM_SET = new Set<string>(X_OWNERSHIP_CLIENT_PLATFORMS);

const FORBIDDEN_CLIENT_FIELDS = [
  'url',
  'profileUrl',
  'handle',
  'username',
  'redirectUri',
  'returnUrl',
  'code_challenge',
  'code_challenge_method',
  'codeVerifier',
  'pkceChallenge',
  'pkceVerifier',
] as const;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function rejectForbiddenClientFields(input: Record<string, unknown>): void {
  for (const forbidden of FORBIDDEN_CLIENT_FIELDS) {
    if (forbidden in input) throw new Error('FORBIDDEN_CLIENT_FIELD');
  }
}

export function assertXOwnershipMode(value: unknown): XOwnershipMode {
  if (typeof value !== 'string' || !MODE_SET.has(value)) {
    throw new Error('INVALID_X_OWNERSHIP_MODE');
  }
  return value as XOwnershipMode;
}

export function assertXOwnershipClientPlatform(
  value: unknown,
): XOwnershipClientPlatform {
  if (typeof value !== 'string' || !CLIENT_PLATFORM_SET.has(value)) {
    throw new Error('INVALID_START_PLATFORM');
  }
  return value as XOwnershipClientPlatform;
}

export function assertXOwnershipTransactionId(transactionId: unknown): string {
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

export function assertXUsername(username: unknown): string {
  if (!isNonEmptyString(username) || !USERNAME_RE.test(username)) {
    throw new Error('INVALID_USERNAME_CACHE');
  }
  return username;
}

export function assertXCanonicalUrl(url: unknown): string {
  if (!isNonEmptyString(url) || !CANONICAL_URL_RE.test(url)) {
    throw new Error('INVALID_CANONICAL_URL');
  }
  return url;
}

export function assertXUserId(userId: unknown): string {
  if (!isNonEmptyString(userId) || !USER_ID_RE.test(userId.trim())) {
    throw new Error('INVALID_USER_ID');
  }
  return userId.trim();
}

export function assertXOwnershipStartRequest(
  input: unknown,
): XOwnershipStartRequest {
  if (!isPlainObject(input)) throw new Error('INVALID_START_REQUEST');
  rejectForbiddenClientFields(input);
  const mode = assertXOwnershipMode(input.mode);
  const platform = assertXOwnershipClientPlatform(input.platform);
  if (input.clientProofMethod !== CLIENT_PROOF_METHOD_S256) {
    throw new Error('INVALID_CLIENT_PROOF_METHOD');
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

export function normalizeXOwnershipExpiresAt(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (isNonEmptyString(value)) {
    const ms = Date.parse(value);
    if (!Number.isFinite(ms) || ms <= 0) throw new Error('INVALID_EXPIRES_AT');
    return ms;
  }
  throw new Error('INVALID_EXPIRES_AT');
}

function isXAuthorizeUrl(url: string): boolean {
  if (!url.startsWith('https://')) return false;
  const withoutScheme = url.slice('https://'.length).toLowerCase();
  return (
    withoutScheme.startsWith('x.com/') ||
    withoutScheme.startsWith('www.x.com/') ||
    withoutScheme.startsWith('twitter.com/') ||
    withoutScheme.startsWith('www.twitter.com/')
  );
}

export function assertXOwnershipStartResponse(
  data: unknown,
): XOwnershipStartResponse {
  if (!isPlainObject(data)) throw new Error('INVALID_START_RESPONSE');
  const transactionId = assertXOwnershipTransactionId(data.transactionId);
  const mode = assertXOwnershipMode(data.mode);
  if (
    !isNonEmptyString(data.authorizationUrl) ||
    !isXAuthorizeUrl(data.authorizationUrl)
  ) {
    throw new Error('INVALID_AUTHORIZATION_URL');
  }
  const expiresAt = normalizeXOwnershipExpiresAt(data.expiresAt);
  return {
    transactionId,
    mode,
    authorizationUrl: data.authorizationUrl,
    expiresAt,
  };
}

export function assertXOwnershipVerified(data: unknown): XOwnershipVerified {
  if (!isPlainObject(data)) throw new Error('INVALID_VERIFIED');
  if (data.result !== 'verified') throw new Error('INVALID_VERIFIED_RESULT');
  if (data.platform !== X_OWNERSHIP_PLATFORM) {
    throw new Error('INVALID_VERIFIED_PLATFORM');
  }
  const mode = assertXOwnershipMode(data.mode);
  const userId = assertXUserId(data.userId);
  const canonicalUrl = assertXCanonicalUrl(data.canonicalUrl);
  let usernameCache: string | null = null;
  if (data.usernameCache !== null && data.usernameCache !== undefined) {
    usernameCache = assertXUsername(data.usernameCache);
    const match = CANONICAL_URL_RE.exec(canonicalUrl);
    if (!match || match[1] !== usernameCache) {
      throw new Error('INVALID_CANONICAL_USERNAME_MISMATCH');
    }
  }
  if (!isNonEmptyString(data.verifiedAt)) {
    throw new Error('INVALID_VERIFIED_AT');
  }
  return {
    result: 'verified',
    platform: X_OWNERSHIP_PLATFORM,
    mode,
    userId,
    canonicalUrl,
    usernameCache,
    verifiedAt: data.verifiedAt,
  };
}

export function assertXOwnershipExchangeRequest(
  input: unknown,
): XOwnershipExchangeRequest {
  if (!isPlainObject(input)) throw new Error('INVALID_EXCHANGE_REQUEST');
  if ('mode' in input) throw new Error('FORBIDDEN_EXCHANGE_MODE');
  rejectForbiddenClientFields(input);
  return {
    transactionId: assertXOwnershipTransactionId(input.transactionId),
    clientProofVerifier: assertClientProofVerifier(input.clientProofVerifier),
  };
}

export function assertXOwnershipExchangeResponse(
  data: unknown,
): XOwnershipExchangeResponse {
  if (!isPlainObject(data)) throw new Error('INVALID_EXCHANGE_RESPONSE');
  if (data.result !== 'verified') {
    throw new Error('INVALID_EXCHANGE_RESULT');
  }
  return assertXOwnershipVerified(data);
}

export function assertXOwnershipGetRequest(
  input: unknown,
): XOwnershipGetRequest {
  if (!isPlainObject(input)) throw new Error('INVALID_GET_REQUEST');
  return { mode: assertXOwnershipMode(input.mode) };
}

export function assertXOwnershipGetResponse(
  data: unknown,
): XOwnershipGetResponse {
  if (!isPlainObject(data)) throw new Error('INVALID_GET_RESPONSE');
  if (data.result === 'verified') {
    return assertXOwnershipVerified(data);
  }
  if (data.result !== 'not_linked') throw new Error('INVALID_GET_RESULT');
  if (data.platform !== X_OWNERSHIP_PLATFORM) {
    throw new Error('INVALID_GET_PLATFORM');
  }
  const mode = assertXOwnershipMode(data.mode);
  if (data.linked !== false) throw new Error('INVALID_GET_LINKED');
  return {
    result: 'not_linked',
    platform: X_OWNERSHIP_PLATFORM,
    mode,
    linked: false,
  };
}

export function assertXOwnershipUnlinkRequest(
  input: unknown,
): XOwnershipUnlinkRequest {
  if (!isPlainObject(input)) throw new Error('INVALID_UNLINK_REQUEST');
  return { mode: assertXOwnershipMode(input.mode) };
}

export function assertXOwnershipUnlinked(data: unknown): XOwnershipUnlinked {
  if (!isPlainObject(data)) throw new Error('INVALID_UNLINK_RESPONSE');
  if (data.result !== 'unlinked') throw new Error('INVALID_UNLINK_RESULT');
  if (data.platform !== X_OWNERSHIP_PLATFORM) {
    throw new Error('INVALID_UNLINK_PLATFORM');
  }
  const mode = assertXOwnershipMode(data.mode);
  if (data.unlinked !== true) throw new Error('INVALID_UNLINK_FLAG');
  return {
    result: 'unlinked',
    platform: X_OWNERSHIP_PLATFORM,
    mode,
    unlinked: true,
  };
}

export function assertClientProofVerifier(input: unknown): string {
  const value = String(input ?? '');
  assertClientProofVerifierShape(value);
  return value;
}

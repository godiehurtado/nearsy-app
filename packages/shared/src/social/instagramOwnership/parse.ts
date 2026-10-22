import {
  INSTAGRAM_OWNERSHIP_CLIENT_PLATFORMS,
  INSTAGRAM_OWNERSHIP_MODES,
  INSTAGRAM_OWNERSHIP_PLATFORM,
  type InstagramOwnershipClientPlatform,
  type InstagramOwnershipMode,
} from './names';
import type {
  InstagramInboxAuthorizeStartRequest,
  InstagramInboxAuthorizeStartResponse,
  InstagramOwnershipConflict,
  InstagramOwnershipExpired,
  InstagramOwnershipGetRequest,
  InstagramOwnershipGetResponse,
  InstagramOwnershipNotLinked,
  InstagramOwnershipPending,
  InstagramOwnershipStartRequest,
  InstagramOwnershipStartResponse,
  InstagramOwnershipUnlinkRequest,
  InstagramOwnershipUnlinked,
  InstagramOwnershipVerified,
} from './wireTypes';

/** Identity: 8 chars, no 0/O/1/I. */
const CHALLENGE_CODE_RE = /^[2-9A-HJ-NP-Z]{8}$/;
const USERNAME_RE = /^[A-Za-z0-9._]{1,30}$/;
const IGSID_RE = /^[0-9]{5,32}$/;
const CANONICAL_URL_RE =
  /^https:\/\/www\.instagram\.com\/([A-Za-z0-9._]{1,30})$/;
const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;
const MIN_CHALLENGE_ID = 8;
const MAX_CHALLENGE_ID = 128;

const BANNED_CLIENT_FIELDS = [
  'url',
  'profileUrl',
  'handle',
  'username',
  'igsid',
  'code',
  'redirectUri',
  'returnUrl',
] as const;

const MODE_SET = new Set<string>(INSTAGRAM_OWNERSHIP_MODES);
const CLIENT_PLATFORM_SET = new Set<string>(
  INSTAGRAM_OWNERSHIP_CLIENT_PLATFORMS,
);

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function rejectBannedClientFields(input: Record<string, unknown>): void {
  for (const field of BANNED_CLIENT_FIELDS) {
    if (field in input) throw new Error('FORBIDDEN_CLIENT_FIELD');
  }
}

export function assertInstagramOwnershipMode(
  value: unknown,
): InstagramOwnershipMode {
  if (typeof value !== 'string' || !MODE_SET.has(value)) {
    throw new Error('INVALID_INSTAGRAM_OWNERSHIP_MODE');
  }
  return value as InstagramOwnershipMode;
}

export function assertInstagramOwnershipClientPlatform(
  value: unknown,
): InstagramOwnershipClientPlatform {
  if (typeof value !== 'string' || !CLIENT_PLATFORM_SET.has(value)) {
    throw new Error('INVALID_START_PLATFORM');
  }
  return value as InstagramOwnershipClientPlatform;
}

export function assertInstagramChallengeId(value: unknown): string {
  if (
    !isNonEmptyString(value) ||
    value.length < MIN_CHALLENGE_ID ||
    value.length > MAX_CHALLENGE_ID ||
    !BASE64URL_RE.test(value)
  ) {
    throw new Error('INVALID_CHALLENGE_ID');
  }
  return value;
}

export function assertInstagramChallengeCode(value: unknown): string {
  if (!isNonEmptyString(value) || !CHALLENGE_CODE_RE.test(value)) {
    throw new Error('INVALID_CHALLENGE_CODE');
  }
  return value;
}

export function assertInstagramUsername(value: unknown): string {
  if (!isNonEmptyString(value) || !USERNAME_RE.test(value)) {
    throw new Error('INVALID_USERNAME_CACHE');
  }
  return value;
}

export function assertInstagramCanonicalUrl(value: unknown): string {
  if (!isNonEmptyString(value) || !CANONICAL_URL_RE.test(value)) {
    throw new Error('INVALID_CANONICAL_URL');
  }
  return value;
}

export function assertInstagramIgsid(value: unknown): string {
  if (!isNonEmptyString(value) || !IGSID_RE.test(value.trim())) {
    throw new Error('INVALID_IGSID');
  }
  return value.trim();
}

export function assertInstagramExpiresAt(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }
  throw new Error('INVALID_EXPIRES_AT');
}

export function assertInstagramOwnershipStartRequest(
  input: unknown,
): InstagramOwnershipStartRequest {
  if (!isPlainObject(input)) throw new Error('INVALID_START_REQUEST');
  rejectBannedClientFields(input);
  return {
    mode: assertInstagramOwnershipMode(input.mode),
    platform: assertInstagramOwnershipClientPlatform(input.platform),
  };
}

export function assertInstagramOwnershipPending(
  data: unknown,
): InstagramOwnershipPending {
  if (!isPlainObject(data)) throw new Error('INVALID_PENDING');
  if (data.result !== 'pending') throw new Error('INVALID_PENDING_RESULT');
  if (data.platform !== INSTAGRAM_OWNERSHIP_PLATFORM) {
    throw new Error('INVALID_PENDING_PLATFORM');
  }
  const mode = assertInstagramOwnershipMode(data.mode);
  const challengeId = assertInstagramChallengeId(data.challengeId);
  const code = assertInstagramChallengeCode(data.code);
  const inboxUsername = assertInstagramUsername(data.inboxUsername);
  const inboxProfileUrl = assertInstagramCanonicalUrl(data.inboxProfileUrl);
  const match = CANONICAL_URL_RE.exec(inboxProfileUrl);
  if (!match || match[1] !== inboxUsername) {
    throw new Error('INVALID_INBOX_USERNAME_MISMATCH');
  }
  return {
    result: 'pending',
    platform: INSTAGRAM_OWNERSHIP_PLATFORM,
    mode,
    challengeId,
    code,
    inboxUsername,
    inboxProfileUrl,
    expiresAt: assertInstagramExpiresAt(data.expiresAt),
  };
}

export function assertInstagramOwnershipStartResponse(
  data: unknown,
): InstagramOwnershipStartResponse {
  return assertInstagramOwnershipPending(data);
}

export function assertInstagramOwnershipVerified(
  data: unknown,
): InstagramOwnershipVerified {
  if (!isPlainObject(data)) throw new Error('INVALID_VERIFIED');
  if (data.result !== 'verified') throw new Error('INVALID_VERIFIED_RESULT');
  if (data.platform !== INSTAGRAM_OWNERSHIP_PLATFORM) {
    throw new Error('INVALID_VERIFIED_PLATFORM');
  }
  const mode = assertInstagramOwnershipMode(data.mode);
  const igsid = assertInstagramIgsid(data.igsid);
  const usernameCache = assertInstagramUsername(data.usernameCache);
  const canonicalUrl = assertInstagramCanonicalUrl(data.canonicalUrl);
  const match = CANONICAL_URL_RE.exec(canonicalUrl);
  if (!match || match[1] !== usernameCache) {
    throw new Error('INVALID_CANONICAL_USERNAME_MISMATCH');
  }
  if (!isNonEmptyString(data.verifiedAt)) {
    throw new Error('INVALID_VERIFIED_AT');
  }
  return {
    result: 'verified',
    platform: INSTAGRAM_OWNERSHIP_PLATFORM,
    mode,
    igsid,
    canonicalUrl,
    usernameCache,
    verifiedAt: data.verifiedAt,
  };
}

export function assertInstagramOwnershipNotLinked(
  data: unknown,
): InstagramOwnershipNotLinked {
  if (!isPlainObject(data)) throw new Error('INVALID_NOT_LINKED');
  if (data.result !== 'not_linked') throw new Error('INVALID_GET_RESULT');
  if (data.platform !== INSTAGRAM_OWNERSHIP_PLATFORM) {
    throw new Error('INVALID_GET_PLATFORM');
  }
  const mode = assertInstagramOwnershipMode(data.mode);
  if (data.linked !== false) throw new Error('INVALID_GET_LINKED');
  return {
    result: 'not_linked',
    platform: INSTAGRAM_OWNERSHIP_PLATFORM,
    mode,
    linked: false,
  };
}

export function assertInstagramOwnershipGetRequest(
  input: unknown,
): InstagramOwnershipGetRequest {
  if (!isPlainObject(input)) throw new Error('INVALID_GET_REQUEST');
  rejectBannedClientFields(input);
  return { mode: assertInstagramOwnershipMode(input.mode) };
}

export function assertInstagramOwnershipExpired(
  data: unknown,
): InstagramOwnershipExpired {
  if (!isPlainObject(data)) throw new Error('INVALID_EXPIRED');
  if (data.result !== 'expired') throw new Error('INVALID_EXPIRED_RESULT');
  if (data.platform !== INSTAGRAM_OWNERSHIP_PLATFORM) {
    throw new Error('INVALID_EXPIRED_PLATFORM');
  }
  if ('code' in data) throw new Error('FORBIDDEN_EXPIRED_CODE');
  return {
    result: 'expired',
    platform: INSTAGRAM_OWNERSHIP_PLATFORM,
    mode: assertInstagramOwnershipMode(data.mode),
    challengeId: assertInstagramChallengeId(data.challengeId),
    expiresAt: assertInstagramExpiresAt(data.expiresAt),
  };
}

export function assertInstagramOwnershipConflict(
  data: unknown,
): InstagramOwnershipConflict {
  if (!isPlainObject(data)) throw new Error('INVALID_CONFLICT');
  if (data.result !== 'conflict') throw new Error('INVALID_CONFLICT_RESULT');
  if (data.platform !== INSTAGRAM_OWNERSHIP_PLATFORM) {
    throw new Error('INVALID_CONFLICT_PLATFORM');
  }
  if (data.reason !== 'instagram-account-claimed') {
    throw new Error('INVALID_CONFLICT_REASON');
  }
  return {
    result: 'conflict',
    platform: INSTAGRAM_OWNERSHIP_PLATFORM,
    mode: assertInstagramOwnershipMode(data.mode),
    reason: 'instagram-account-claimed',
  };
}

export function assertInstagramOwnershipGetResponse(
  data: unknown,
): InstagramOwnershipGetResponse {
  if (!isPlainObject(data)) throw new Error('INVALID_GET_RESPONSE');
  if (data.result === 'verified') return assertInstagramOwnershipVerified(data);
  if (data.result === 'pending') return assertInstagramOwnershipPending(data);
  if (data.result === 'expired') return assertInstagramOwnershipExpired(data);
  if (data.result === 'conflict') return assertInstagramOwnershipConflict(data);
  if (data.result === 'not_linked') {
    return assertInstagramOwnershipNotLinked(data);
  }
  throw new Error('INVALID_GET_RESULT');
}

export function assertInstagramInboxAuthorizeStartRequest(
  input: unknown,
): InstagramInboxAuthorizeStartRequest {
  const data = input == null ? {} : input;
  if (!isPlainObject(data)) throw new Error('INVALID_INBOX_AUTHORIZE_REQUEST');
  rejectBannedClientFields(data);
  if (Object.keys(data).length > 0) {
    throw new Error('INVALID_INBOX_AUTHORIZE_REQUEST');
  }
  return {};
}

export function assertInstagramInboxAuthorizeStartResponse(
  data: unknown,
): InstagramInboxAuthorizeStartResponse {
  if (!isPlainObject(data)) throw new Error('INVALID_INBOX_AUTHORIZE_RESPONSE');
  if (!isNonEmptyString(data.authorizationUrl)) {
    throw new Error('INVALID_AUTHORIZATION_URL');
  }
  let parsed: URL;
  try {
    parsed = new URL(data.authorizationUrl);
  } catch {
    throw new Error('INVALID_AUTHORIZATION_URL');
  }
  const host = parsed.hostname.toLowerCase();
  if (parsed.protocol !== 'https:') {
    throw new Error('INVALID_AUTHORIZATION_URL');
  }
  if (host !== 'www.instagram.com' && host !== 'instagram.com') {
    throw new Error('INVALID_AUTHORIZATION_URL');
  }
  if (!parsed.pathname.startsWith('/oauth/authorize')) {
    throw new Error('INVALID_AUTHORIZATION_URL');
  }
  return { authorizationUrl: data.authorizationUrl };
}

export function assertInstagramOwnershipUnlinkRequest(
  input: unknown,
): InstagramOwnershipUnlinkRequest {
  if (!isPlainObject(input)) throw new Error('INVALID_UNLINK_REQUEST');
  rejectBannedClientFields(input);
  return { mode: assertInstagramOwnershipMode(input.mode) };
}

export function assertInstagramOwnershipUnlinked(
  data: unknown,
): InstagramOwnershipUnlinked {
  if (!isPlainObject(data)) throw new Error('INVALID_UNLINK_RESPONSE');
  if (data.result !== 'unlinked') throw new Error('INVALID_UNLINK_RESULT');
  if (data.platform !== INSTAGRAM_OWNERSHIP_PLATFORM) {
    throw new Error('INVALID_UNLINK_PLATFORM');
  }
  const mode = assertInstagramOwnershipMode(data.mode);
  if (data.unlinked !== true) throw new Error('INVALID_UNLINK_FLAG');
  return {
    result: 'unlinked',
    platform: INSTAGRAM_OWNERSHIP_PLATFORM,
    mode,
    unlinked: true,
  };
}

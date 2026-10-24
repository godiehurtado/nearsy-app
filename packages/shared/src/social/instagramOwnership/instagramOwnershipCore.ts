/**
 * Instagram reverse-DM ownership parsers and callables.
 * Start / Get / Unlink only. Never send the DM code back to Identity.
 */
import { isProfileMode } from '../../profile/profileModeFields.ts';
import {
  INSTAGRAM_BANNED_CLIENT_FIELDS,
  INSTAGRAM_CANONICAL_URL_RE,
  INSTAGRAM_CHALLENGE_CODE_RE,
  INSTAGRAM_CHALLENGE_ID_RE,
  INSTAGRAM_IGSID_RE,
  INSTAGRAM_OWNERSHIP_ERROR_CODES,
  INSTAGRAM_OWNERSHIP_GET,
  INSTAGRAM_OWNERSHIP_PLATFORM,
  INSTAGRAM_OWNERSHIP_START,
  INSTAGRAM_OWNERSHIP_UNLINK,
  INSTAGRAM_USERNAME_RE,
  MAX_CHALLENGE_ID_LEN,
  MIN_CHALLENGE_ID_LEN,
  type InstagramOwnershipConflict,
  type InstagramOwnershipErrorCode,
  type InstagramOwnershipExpired,
  type InstagramOwnershipGetResponse,
  type InstagramOwnershipMobilePlatform,
  type InstagramOwnershipMode,
  type InstagramOwnershipPending,
  type InstagramOwnershipUnlinkResponse,
  type InstagramOwnershipVerified,
} from './instagramOwnershipContract.ts';

export type InstagramOwnershipFunctionsPort = {
  region: string;
  call: (name: string, data?: unknown) => Promise<unknown>;
};

export class InstagramOwnershipError extends Error {
  readonly code: string;
  readonly backendCode?: string;
  constructor(code: string, message: string, backendCode?: string) {
    super(message);
    this.name = 'InstagramOwnershipError';
    this.code = code;
    this.backendCode = backendCode;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function assertInstagramOwnershipMode(
  value: unknown,
): InstagramOwnershipMode {
  if (!isProfileMode(value)) {
    throw new InstagramOwnershipError(
      'invalid-argument',
      'mode must be personal or professional.',
    );
  }
  return value;
}

function parseModeFromResponse(value: unknown): InstagramOwnershipMode {
  if (!isProfileMode(value)) {
    throw new InstagramOwnershipError(
      'BAD_RESPONSE',
      'mode must be personal or professional.',
    );
  }
  return value;
}

function assertChallengeId(value: unknown): string {
  const id = asNonEmptyString(value);
  if (
    !id ||
    id.length < MIN_CHALLENGE_ID_LEN ||
    id.length > MAX_CHALLENGE_ID_LEN ||
    !INSTAGRAM_CHALLENGE_ID_RE.test(id)
  ) {
    throw new InstagramOwnershipError('BAD_RESPONSE', 'Invalid challengeId.');
  }
  return id;
}

function assertChallengeCode(value: unknown): string {
  const code = asNonEmptyString(value);
  if (!code || !INSTAGRAM_CHALLENGE_CODE_RE.test(code)) {
    throw new InstagramOwnershipError('BAD_RESPONSE', 'Invalid challenge code.');
  }
  return code;
}

function assertUsername(value: unknown): string {
  const user = asNonEmptyString(value);
  if (!user || !INSTAGRAM_USERNAME_RE.test(user)) {
    throw new InstagramOwnershipError('BAD_RESPONSE', 'Invalid username.');
  }
  return user;
}

function assertCanonicalUrl(value: unknown, expectedUser?: string): string {
  const url = asNonEmptyString(value);
  if (!url) {
    throw new InstagramOwnershipError('BAD_RESPONSE', 'Invalid canonical URL.');
  }
  const match = INSTAGRAM_CANONICAL_URL_RE.exec(url);
  if (!match) {
    throw new InstagramOwnershipError('BAD_RESPONSE', 'Invalid canonical URL.');
  }
  if (expectedUser && match[1] !== expectedUser) {
    throw new InstagramOwnershipError(
      'BAD_RESPONSE',
      'Canonical URL username mismatch.',
    );
  }
  return url;
}

function assertIgsid(value: unknown): string {
  const id = asNonEmptyString(value);
  if (!id || !INSTAGRAM_IGSID_RE.test(id)) {
    throw new InstagramOwnershipError('BAD_RESPONSE', 'Invalid igsid.');
  }
  return id;
}

function assertExpiresAt(value: unknown): number {
  const expiresAt =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : NaN;
  if (!Number.isFinite(expiresAt) || expiresAt <= 0) {
    throw new InstagramOwnershipError('BAD_RESPONSE', 'Invalid expiresAt.');
  }
  return expiresAt;
}

function rejectBannedClientFields(input: Record<string, unknown>): void {
  for (const field of INSTAGRAM_BANNED_CLIENT_FIELDS) {
    if (field in input) {
      throw new InstagramOwnershipError(
        'invalid-argument',
        'Client-supplied Instagram URLs, handles, or codes are not accepted.',
      );
    }
  }
}

export function mapCallableError(err: unknown): InstagramOwnershipError {
  if (err instanceof InstagramOwnershipError) return err;
  const e = err as { code?: unknown; message?: unknown; details?: unknown };
  const httpsCode = typeof e.code === 'string' ? e.code : '';
  const message = typeof e.message === 'string' ? e.message : '';
  const details = e.details;
  let backendCode: string | undefined;
  if (typeof details === 'string') backendCode = details;
  else if (isRecord(details) && typeof details.code === 'string') {
    backendCode = details.code;
  }
  const haystack = `${httpsCode} ${message} ${backendCode ?? ''}`.toLowerCase();
  if (/functions\/internal/i.test(haystack)) {
    return new InstagramOwnershipError(
      'CALLABLE_FAILED',
      message || 'Instagram ownership callable failed.',
      backendCode,
    );
  }
  if (
    /functions\/resource-exhausted/i.test(haystack) ||
    haystack.includes('instagram-rate-limited')
  ) {
    return new InstagramOwnershipError(
      'instagram-rate-limited',
      message || 'instagram-rate-limited',
      'instagram-rate-limited',
    );
  }
  for (const token of INSTAGRAM_OWNERSHIP_ERROR_CODES) {
    if (haystack.includes(token.toLowerCase())) {
      return new InstagramOwnershipError(token, message || token, token);
    }
  }
  if (httpsCode === 'unauthenticated' || /unauthenticated/i.test(message)) {
    return new InstagramOwnershipError(
      'unauthenticated',
      message || 'unauthenticated',
      'unauthenticated',
    );
  }
  return new InstagramOwnershipError(
    'CALLABLE_FAILED',
    message || 'Instagram ownership callable failed.',
    backendCode,
  );
}

export function parsePendingResponse(raw: unknown): InstagramOwnershipPending {
  if (!isRecord(raw) || raw.result !== 'pending') {
    throw new InstagramOwnershipError('BAD_RESPONSE', 'Expected pending.');
  }
  if (raw.platform !== INSTAGRAM_OWNERSHIP_PLATFORM) {
    throw new InstagramOwnershipError('BAD_RESPONSE', 'Unexpected platform.');
  }
  const mode = parseModeFromResponse(raw.mode);
  const inboxUsername = assertUsername(raw.inboxUsername);
  return {
    result: 'pending',
    platform: INSTAGRAM_OWNERSHIP_PLATFORM,
    mode,
    challengeId: assertChallengeId(raw.challengeId),
    code: assertChallengeCode(raw.code),
    inboxUsername,
    inboxProfileUrl: assertCanonicalUrl(raw.inboxProfileUrl, inboxUsername),
    expiresAt: assertExpiresAt(raw.expiresAt),
  };
}

export function parseVerifiedShape(raw: unknown): InstagramOwnershipVerified {
  if (!isRecord(raw) || raw.result !== 'verified') {
    throw new InstagramOwnershipError('BAD_RESPONSE', 'Expected verified.');
  }
  if (raw.platform !== INSTAGRAM_OWNERSHIP_PLATFORM) {
    throw new InstagramOwnershipError('BAD_RESPONSE', 'Unexpected platform.');
  }
  const usernameCache = assertUsername(raw.usernameCache);
  return {
    result: 'verified',
    platform: INSTAGRAM_OWNERSHIP_PLATFORM,
    mode: parseModeFromResponse(raw.mode),
    igsid: assertIgsid(raw.igsid),
    canonicalUrl: assertCanonicalUrl(raw.canonicalUrl, usernameCache),
    usernameCache,
    verifiedAt: asNonEmptyString(raw.verifiedAt) ?? '',
  };
}

function parseVerifiedOrThrow(raw: unknown): InstagramOwnershipVerified {
  const verified = parseVerifiedShape(raw);
  if (!verified.verifiedAt) {
    throw new InstagramOwnershipError('BAD_RESPONSE', 'Invalid verifiedAt.');
  }
  return verified;
}

export function parseExpiredResponse(raw: unknown): InstagramOwnershipExpired {
  if (!isRecord(raw) || raw.result !== 'expired') {
    throw new InstagramOwnershipError('BAD_RESPONSE', 'Expected expired.');
  }
  if (raw.platform !== INSTAGRAM_OWNERSHIP_PLATFORM) {
    throw new InstagramOwnershipError('BAD_RESPONSE', 'Unexpected platform.');
  }
  if ('code' in raw) {
    throw new InstagramOwnershipError(
      'BAD_RESPONSE',
      'Expired must not re-expose the code.',
    );
  }
  return {
    result: 'expired',
    platform: INSTAGRAM_OWNERSHIP_PLATFORM,
    mode: parseModeFromResponse(raw.mode),
    challengeId: assertChallengeId(raw.challengeId),
    expiresAt: assertExpiresAt(raw.expiresAt),
  };
}

export function parseConflictResponse(
  raw: unknown,
): InstagramOwnershipConflict {
  if (!isRecord(raw) || raw.result !== 'conflict') {
    throw new InstagramOwnershipError('BAD_RESPONSE', 'Expected conflict.');
  }
  if (raw.platform !== INSTAGRAM_OWNERSHIP_PLATFORM) {
    throw new InstagramOwnershipError('BAD_RESPONSE', 'Unexpected platform.');
  }
  if (raw.reason !== 'instagram-account-claimed') {
    throw new InstagramOwnershipError('BAD_RESPONSE', 'Invalid conflict reason.');
  }
  return {
    result: 'conflict',
    platform: INSTAGRAM_OWNERSHIP_PLATFORM,
    mode: parseModeFromResponse(raw.mode),
    reason: 'instagram-account-claimed',
  };
}

export function parseGetResponse(raw: unknown): InstagramOwnershipGetResponse {
  if (!isRecord(raw)) {
    throw new InstagramOwnershipError('BAD_RESPONSE', 'Invalid get response.');
  }
  switch (raw.result) {
    case 'verified':
      return parseVerifiedOrThrow(raw);
    case 'pending':
      return parsePendingResponse(raw);
    case 'expired':
      return parseExpiredResponse(raw);
    case 'conflict':
      return parseConflictResponse(raw);
    case 'not_linked':
      if (raw.platform !== INSTAGRAM_OWNERSHIP_PLATFORM || raw.linked !== false) {
        throw new InstagramOwnershipError('BAD_RESPONSE', 'Invalid not_linked.');
      }
      return {
        result: 'not_linked',
        platform: INSTAGRAM_OWNERSHIP_PLATFORM,
        mode: parseModeFromResponse(raw.mode),
        linked: false,
      };
    default:
      throw new InstagramOwnershipError('BAD_RESPONSE', 'Unknown get result.');
  }
}

export function parseUnlinkResponse(
  raw: unknown,
): InstagramOwnershipUnlinkResponse {
  if (
    !isRecord(raw) ||
    raw.result !== 'unlinked' ||
    raw.platform !== INSTAGRAM_OWNERSHIP_PLATFORM ||
    raw.unlinked !== true
  ) {
    throw new InstagramOwnershipError('BAD_RESPONSE', 'Expected unlinked.');
  }
  return {
    result: 'unlinked',
    platform: INSTAGRAM_OWNERSHIP_PLATFORM,
    mode: parseModeFromResponse(raw.mode),
    unlinked: true,
  };
}

export async function instagramOwnershipStart(
  functions: InstagramOwnershipFunctionsPort,
  input: {
    mode: InstagramOwnershipMode;
    platform: InstagramOwnershipMobilePlatform;
  },
): Promise<InstagramOwnershipPending> {
  const mode = assertInstagramOwnershipMode(input.mode);
  if (input.platform !== 'android' && input.platform !== 'ios') {
    throw new InstagramOwnershipError(
      'invalid-argument',
      'platform must be android or ios.',
    );
  }
  const request: Record<string, unknown> = {
    mode,
    platform: input.platform,
  };
  rejectBannedClientFields(request);
  let raw: unknown;
  try {
    raw = await functions.call(INSTAGRAM_OWNERSHIP_START, request);
  } catch (err) {
    throw mapCallableError(err);
  }
  const pending = parsePendingResponse(raw);
  if (pending.mode !== mode) {
    throw new InstagramOwnershipError('BAD_RESPONSE', 'Start mode echo mismatch.');
  }
  return pending;
}

export async function instagramOwnershipGet(
  functions: InstagramOwnershipFunctionsPort,
  mode: InstagramOwnershipMode,
): Promise<InstagramOwnershipGetResponse> {
  const scopedMode = assertInstagramOwnershipMode(mode);
  let raw: unknown;
  try {
    raw = await functions.call(INSTAGRAM_OWNERSHIP_GET, { mode: scopedMode });
  } catch (err) {
    throw mapCallableError(err);
  }
  const parsed = parseGetResponse(raw);
  if (parsed.mode !== scopedMode) {
    throw new InstagramOwnershipError('BAD_RESPONSE', 'Get mode echo mismatch.');
  }
  return parsed;
}

export async function instagramOwnershipUnlink(
  functions: InstagramOwnershipFunctionsPort,
  mode: InstagramOwnershipMode,
): Promise<InstagramOwnershipUnlinkResponse> {
  const scopedMode = assertInstagramOwnershipMode(mode);
  let raw: unknown;
  try {
    raw = await functions.call(INSTAGRAM_OWNERSHIP_UNLINK, { mode: scopedMode });
  } catch (err) {
    throw mapCallableError(err);
  }
  const parsed = parseUnlinkResponse(raw);
  if (parsed.mode !== scopedMode) {
    throw new InstagramOwnershipError(
      'BAD_RESPONSE',
      'Unlink mode echo mismatch.',
    );
  }
  return parsed;
}

export function instagramOwnershipErrorToI18nKey(code: string): string {
  switch (code) {
    case 'instagram-not-enabled':
    case 'instagram-inbox-not-connected':
      return 'notEnabled';
    case 'instagram-account-claimed':
      return 'accountClaimed';
    case 'instagram-rate-limited':
      return 'rateLimited';
    case 'instagram-no-username':
      return 'noUsername';
    case 'TX_EXPIRED':
      return 'txExpired';
    case 'unauthenticated':
      return 'unauthenticated';
    case 'session_changed':
      return 'sessionChanged';
    default:
      return 'generic';
  }
}

export function isInstagramOwnershipErrorCode(
  code: string,
): code is InstagramOwnershipErrorCode {
  return (INSTAGRAM_OWNERSHIP_ERROR_CODES as readonly string[]).includes(code);
}

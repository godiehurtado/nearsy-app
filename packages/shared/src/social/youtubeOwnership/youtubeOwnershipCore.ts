/**
 * Pure YouTube ownership client helpers — callable request/response parsing.
 * Ownership is scoped per profile mode. No Firebase session mutation.
 * Injectable Functions port for tests. No publication-toggle callables.
 */

import { isProfileMode } from '../../profile/profileModeFields.ts';
import {
  BASE64URL_RE,
  MAX_TRANSACTION_ID_LEN,
  MIN_TRANSACTION_ID_LEN,
  YOUTUBE_OWNERSHIP_CLIENT_PROOF_METHOD,
  YOUTUBE_OWNERSHIP_ERROR_CODES,
  YOUTUBE_OWNERSHIP_EXCHANGE,
  YOUTUBE_OWNERSHIP_GET,
  YOUTUBE_OWNERSHIP_PLATFORM,
  YOUTUBE_OWNERSHIP_SELECT_CHANNEL,
  YOUTUBE_OWNERSHIP_START,
  YOUTUBE_OWNERSHIP_UNLINK,
  type YoutubeOwnershipChannelCandidate,
  type YoutubeOwnershipErrorCode,
  type YoutubeOwnershipExchangeResponse,
  type YoutubeOwnershipGetResponse,
  type YoutubeOwnershipMobilePlatform,
  type YoutubeOwnershipMode,
  type YoutubeOwnershipSelectChannelResponse,
  type YoutubeOwnershipStartResponse,
  type YoutubeOwnershipUnlinkResponse,
  type YoutubeOwnershipVerified,
  type YoutubeStoredTransaction,
} from './youtubeOwnershipContract.ts';
import {
  assertClientProofChallengeShape,
  assertClientProofVerifierShape,
  createClientProofPair,
  type ClientProofCrypto,
} from './youtubeOwnershipProof.ts';

export type YoutubeOwnershipFunctionsPort = {
  region: string;
  call: (name: string, data?: unknown) => Promise<unknown>;
};

export type SecureKv = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  deleteItem: (key: string) => Promise<void>;
};

export class YoutubeOwnershipError extends Error {
  readonly code: string;
  readonly backendCode?: string;

  constructor(code: string, message: string, backendCode?: string) {
    super(message);
    this.name = 'YoutubeOwnershipError';
    this.code = code;
    this.backendCode = backendCode;
  }
}

export type YoutubeConnectOutcome =
  | { status: 'verified'; verified: YoutubeOwnershipVerified }
  | {
      status: 'select_channel';
      transactionId: string;
      mode: YoutubeOwnershipMode;
      channels: YoutubeOwnershipChannelCandidate[];
    }
  | { status: 'cancelled' }
  | { status: 'failed'; error: YoutubeOwnershipError };

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isValidTransactionId(value: string): boolean {
  return (
    value.length >= MIN_TRANSACTION_ID_LEN &&
    value.length <= MAX_TRANSACTION_ID_LEN &&
    BASE64URL_RE.test(value)
  );
}

export function assertYoutubeOwnershipMode(
  value: unknown,
): YoutubeOwnershipMode {
  if (!isProfileMode(value)) {
    throw new YoutubeOwnershipError(
      'invalid-argument',
      'mode must be personal or professional.',
    );
  }
  return value;
}

function parseModeFromResponse(value: unknown): YoutubeOwnershipMode {
  if (!isProfileMode(value)) {
    throw new YoutubeOwnershipError(
      'BAD_RESPONSE',
      'mode must be personal or professional.',
    );
  }
  return value;
}

export function mapCallableError(err: unknown): YoutubeOwnershipError {
  if (err instanceof YoutubeOwnershipError) return err;
  const e = err as {
    code?: unknown;
    message?: unknown;
    details?: unknown;
  };
  const httpsCode = typeof e.code === 'string' ? e.code : '';
  const message = typeof e.message === 'string' ? e.message : '';
  const details = e.details;
  let backendCode: string | undefined;
  if (typeof details === 'string') {
    backendCode = details;
  } else if (isRecord(details) && typeof details.code === 'string') {
    backendCode = details.code;
  }

  const haystack = `${httpsCode} ${message} ${backendCode ?? ''}`.toLowerCase();
  for (const token of YOUTUBE_OWNERSHIP_ERROR_CODES) {
    if (haystack.includes(token.toLowerCase())) {
      return new YoutubeOwnershipError(token, message || token, token);
    }
  }
  if (httpsCode === 'unauthenticated' || /unauthenticated/i.test(message)) {
    return new YoutubeOwnershipError(
      'unauthenticated',
      message || 'unauthenticated',
      'unauthenticated',
    );
  }
  if (
    httpsCode === 'invalid-argument' ||
    /invalid-argument|mode must be|mode cannot be changed/i.test(haystack)
  ) {
    return new YoutubeOwnershipError(
      'invalid-argument',
      message || 'invalid-argument',
      backendCode ?? 'invalid-argument',
    );
  }
  return new YoutubeOwnershipError(
    'CALLABLE_FAILED',
    message || 'YouTube ownership callable failed.',
    backendCode,
  );
}

export function parseVerifiedShape(raw: unknown): YoutubeOwnershipVerified {
  if (!isRecord(raw) || raw.result !== 'verified') {
    throw new YoutubeOwnershipError('BAD_RESPONSE', 'Expected verified result.');
  }
  if (raw.platform !== YOUTUBE_OWNERSHIP_PLATFORM) {
    throw new YoutubeOwnershipError('BAD_RESPONSE', 'Unexpected platform.');
  }
  const mode = parseModeFromResponse(raw.mode);
  const channelId = asNonEmptyString(raw.channelId);
  const canonicalUrl = asNonEmptyString(raw.canonicalUrl);
  const verifiedAt = asNonEmptyString(raw.verifiedAt);
  if (!channelId || !canonicalUrl || !verifiedAt) {
    throw new YoutubeOwnershipError('BAD_RESPONSE', 'Missing verified fields.');
  }
  // Legacy publish flags must not appear on mode-scoped verified responses.
  if ('publishPersonal' in raw || 'publishProfessional' in raw) {
    throw new YoutubeOwnershipError(
      'BAD_RESPONSE',
      'Legacy publish flags are not accepted.',
    );
  }
  const customUrlCache =
    raw.customUrlCache === null
      ? null
      : asNonEmptyString(raw.customUrlCache);
  if (raw.customUrlCache != null && customUrlCache === null) {
    throw new YoutubeOwnershipError('BAD_RESPONSE', 'Invalid customUrlCache.');
  }
  return {
    result: 'verified',
    platform: YOUTUBE_OWNERSHIP_PLATFORM,
    mode,
    channelId,
    canonicalUrl,
    customUrlCache: customUrlCache ?? null,
    verifiedAt,
  };
}

function parseChannelCandidate(
  raw: unknown,
): YoutubeOwnershipChannelCandidate | null {
  if (!isRecord(raw)) return null;
  const channelId = asNonEmptyString(raw.channelId);
  if (!channelId) return null;
  const customUrlCache =
    raw.customUrlCache === null
      ? null
      : asNonEmptyString(raw.customUrlCache);
  return {
    channelId,
    title: asNonEmptyString(raw.title) ?? undefined,
    canonicalUrl: asNonEmptyString(raw.canonicalUrl) ?? undefined,
    customUrlCache:
      raw.customUrlCache === undefined
        ? undefined
        : (customUrlCache ?? null),
  };
}

export function parseExchangeResponse(
  raw: unknown,
): YoutubeOwnershipExchangeResponse {
  if (!isRecord(raw)) {
    throw new YoutubeOwnershipError('BAD_RESPONSE', 'Invalid exchange response.');
  }
  if (raw.result === 'verified') {
    return parseVerifiedShape(raw);
  }
  if (raw.result === 'select_channel') {
    if (raw.platform !== YOUTUBE_OWNERSHIP_PLATFORM) {
      throw new YoutubeOwnershipError('BAD_RESPONSE', 'Unexpected platform.');
    }
    const mode = parseModeFromResponse(raw.mode);
    const transactionId = asNonEmptyString(raw.transactionId);
    if (!transactionId || !isValidTransactionId(transactionId)) {
      throw new YoutubeOwnershipError('BAD_RESPONSE', 'Invalid transactionId.');
    }
    if (!Array.isArray(raw.channels) || raw.channels.length === 0) {
      throw new YoutubeOwnershipError(
        'youtube-no-channel',
        'No channels to select.',
        'youtube-no-channel',
      );
    }
    const channels: YoutubeOwnershipChannelCandidate[] = [];
    for (const item of raw.channels) {
      const parsed = parseChannelCandidate(item);
      if (parsed) channels.push(parsed);
    }
    if (channels.length === 0) {
      throw new YoutubeOwnershipError(
        'youtube-no-channel',
        'No channels to select.',
        'youtube-no-channel',
      );
    }
    const out: YoutubeOwnershipSelectChannelResponse = {
      result: 'select_channel',
      platform: YOUTUBE_OWNERSHIP_PLATFORM,
      mode,
      transactionId,
      channels,
    };
    return out;
  }
  throw new YoutubeOwnershipError('BAD_RESPONSE', 'Unexpected exchange result.');
}

export function parseStartResponse(raw: unknown): YoutubeOwnershipStartResponse {
  if (!isRecord(raw)) {
    throw new YoutubeOwnershipError('BAD_RESPONSE', 'Invalid start response.');
  }
  const transactionId = asNonEmptyString(raw.transactionId);
  const authorizationUrl = asNonEmptyString(raw.authorizationUrl);
  const mode = parseModeFromResponse(raw.mode);
  const expiresAt =
    typeof raw.expiresAt === 'number'
      ? raw.expiresAt
      : typeof raw.expiresAt === 'string'
        ? Number(raw.expiresAt)
        : NaN;
  if (!transactionId || !isValidTransactionId(transactionId)) {
    throw new YoutubeOwnershipError('BAD_RESPONSE', 'Invalid transactionId.');
  }
  if (!authorizationUrl || !authorizationUrl.startsWith('https://')) {
    throw new YoutubeOwnershipError('BAD_RESPONSE', 'Invalid authorizationUrl.');
  }
  // Reject prohibited client-invented redirect fields if echoed.
  if (
    'url' in raw ||
    'channelUrl' in raw ||
    'redirectUri' in raw ||
    'returnUrl' in raw
  ) {
    throw new YoutubeOwnershipError(
      'BAD_RESPONSE',
      'Prohibited start response fields.',
    );
  }
  if (!Number.isFinite(expiresAt)) {
    throw new YoutubeOwnershipError('BAD_RESPONSE', 'Invalid expiresAt.');
  }
  return { transactionId, mode, authorizationUrl, expiresAt };
}

export function parseGetResponse(raw: unknown): YoutubeOwnershipGetResponse {
  if (!isRecord(raw)) {
    throw new YoutubeOwnershipError('BAD_RESPONSE', 'Invalid get response.');
  }
  if (raw.result === 'not_linked') {
    if (
      raw.platform !== YOUTUBE_OWNERSHIP_PLATFORM ||
      raw.linked !== false
    ) {
      throw new YoutubeOwnershipError('BAD_RESPONSE', 'Invalid not_linked.');
    }
    const mode = parseModeFromResponse(raw.mode);
    return {
      result: 'not_linked',
      platform: YOUTUBE_OWNERSHIP_PLATFORM,
      mode,
      linked: false,
    };
  }
  return parseVerifiedShape(raw);
}

export function parseUnlinkResponse(
  raw: unknown,
): YoutubeOwnershipUnlinkResponse {
  if (
    !isRecord(raw) ||
    raw.result !== 'unlinked' ||
    raw.platform !== YOUTUBE_OWNERSHIP_PLATFORM ||
    raw.unlinked !== true
  ) {
    throw new YoutubeOwnershipError('BAD_RESPONSE', 'Expected unlinked.');
  }
  const mode = parseModeFromResponse(raw.mode);
  return {
    result: 'unlinked',
    platform: YOUTUBE_OWNERSHIP_PLATFORM,
    mode,
    unlinked: true,
  };
}

export async function youtubeOwnershipStart(
  functions: YoutubeOwnershipFunctionsPort,
  crypto: ClientProofCrypto,
  input: {
    mode: YoutubeOwnershipMode;
    platform: YoutubeOwnershipMobilePlatform;
  },
): Promise<{
  start: YoutubeOwnershipStartResponse;
  clientProofVerifier: string;
}> {
  const mode = assertYoutubeOwnershipMode(input.mode);
  if (input.platform !== 'android' && input.platform !== 'ios') {
    throw new YoutubeOwnershipError(
      'invalid-argument',
      'platform must be android or ios.',
    );
  }
  const proof = await createClientProofPair(crypto);
  assertClientProofChallengeShape(proof.clientProofChallenge);
  const request = {
    mode,
    platform: input.platform,
    clientProofChallenge: proof.clientProofChallenge,
    clientProofMethod: YOUTUBE_OWNERSHIP_CLIENT_PROOF_METHOD,
  };
  let raw: unknown;
  try {
    raw = await functions.call(YOUTUBE_OWNERSHIP_START, request);
  } catch (err) {
    throw mapCallableError(err);
  }
  const start = parseStartResponse(raw);
  if (start.mode !== mode) {
    throw new YoutubeOwnershipError(
      'BAD_RESPONSE',
      'Start mode echo mismatch.',
    );
  }
  return {
    start,
    clientProofVerifier: proof.clientProofVerifier,
  };
}

export async function youtubeOwnershipExchange(
  functions: YoutubeOwnershipFunctionsPort,
  transactionId: string,
  clientProofVerifier: string,
): Promise<YoutubeOwnershipExchangeResponse> {
  assertClientProofVerifierShape(clientProofVerifier);
  if (!isValidTransactionId(transactionId)) {
    throw new YoutubeOwnershipError('TX_INVALID', 'Invalid transactionId.');
  }
  // Mode is bound to the transaction by Start — never send it here.
  const request = {
    transactionId,
    clientProofVerifier,
  };
  let raw: unknown;
  try {
    raw = await functions.call(YOUTUBE_OWNERSHIP_EXCHANGE, request);
  } catch (err) {
    throw mapCallableError(err);
  }
  return parseExchangeResponse(raw);
}

export async function youtubeOwnershipSelectChannel(
  functions: YoutubeOwnershipFunctionsPort,
  transactionId: string,
  channelId: string,
): Promise<YoutubeOwnershipVerified> {
  if (!isValidTransactionId(transactionId)) {
    throw new YoutubeOwnershipError('TX_INVALID', 'Invalid transactionId.');
  }
  const id = asNonEmptyString(channelId);
  if (!id) {
    throw new YoutubeOwnershipError(
      'youtube-channel-not-in-candidates',
      'Invalid channelId.',
    );
  }
  // Mode is bound to the transaction by Start — never send it here.
  const request = {
    transactionId,
    channelId: id,
  };
  let raw: unknown;
  try {
    raw = await functions.call(YOUTUBE_OWNERSHIP_SELECT_CHANNEL, request);
  } catch (err) {
    throw mapCallableError(err);
  }
  return parseVerifiedShape(raw);
}

export async function youtubeOwnershipGet(
  functions: YoutubeOwnershipFunctionsPort,
  mode: YoutubeOwnershipMode,
): Promise<YoutubeOwnershipGetResponse> {
  const scopedMode = assertYoutubeOwnershipMode(mode);
  let raw: unknown;
  try {
    raw = await functions.call(YOUTUBE_OWNERSHIP_GET, { mode: scopedMode });
  } catch (err) {
    throw mapCallableError(err);
  }
  const parsed = parseGetResponse(raw);
  if (parsed.mode !== scopedMode) {
    throw new YoutubeOwnershipError('BAD_RESPONSE', 'Get mode echo mismatch.');
  }
  return parsed;
}

export async function youtubeOwnershipUnlink(
  functions: YoutubeOwnershipFunctionsPort,
  mode: YoutubeOwnershipMode,
): Promise<YoutubeOwnershipUnlinkResponse> {
  const scopedMode = assertYoutubeOwnershipMode(mode);
  let raw: unknown;
  try {
    raw = await functions.call(YOUTUBE_OWNERSHIP_UNLINK, { mode: scopedMode });
  } catch (err) {
    throw mapCallableError(err);
  }
  const parsed = parseUnlinkResponse(raw);
  if (parsed.mode !== scopedMode) {
    throw new YoutubeOwnershipError(
      'BAD_RESPONSE',
      'Unlink mode echo mismatch.',
    );
  }
  return parsed;
}

export function serializeStoredTransaction(
  tx: YoutubeStoredTransaction,
): string {
  return JSON.stringify(tx);
}

export function parseStoredTransaction(
  raw: string,
): YoutubeStoredTransaction | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed) || parsed.version !== 1) return null;
    const transactionId = asNonEmptyString(parsed.transactionId);
    const clientProofVerifier = asNonEmptyString(parsed.clientProofVerifier);
    const uid = asNonEmptyString(parsed.uid);
    const mode = isProfileMode(parsed.mode) ? parsed.mode : null;
    const createdAt = Number(parsed.createdAt);
    const expiresAt = Number(parsed.expiresAt);
    if (
      !transactionId ||
      !clientProofVerifier ||
      !uid ||
      !mode ||
      !Number.isFinite(createdAt) ||
      !Number.isFinite(expiresAt)
    ) {
      return null;
    }
    assertClientProofVerifierShape(clientProofVerifier);
    if (!isValidTransactionId(transactionId)) return null;
    return {
      version: 1,
      transactionId,
      clientProofVerifier,
      createdAt,
      expiresAt,
      uid,
      mode,
    };
  } catch {
    return null;
  }
}

export function isYoutubeOwnershipErrorCode(
  code: string,
): code is YoutubeOwnershipErrorCode {
  return (YOUTUBE_OWNERSHIP_ERROR_CODES as readonly string[]).includes(code);
}

/** Map backend/error codes to i18n keys under profile.social.youtubeOwnership.errors.* */
export function youtubeOwnershipErrorToI18nKey(code: string): string {
  switch (code) {
    case 'youtube-not-enabled':
      return 'notEnabled';
    case 'youtube-no-channel':
      return 'noChannel';
    case 'youtube-channel-claimed':
      return 'channelClaimed';
    case 'youtube-channel-not-in-candidates':
      return 'channelNotInCandidates';
    case 'youtube-not-linked':
      return 'notLinked';
    case 'TX_EXPIRED':
      return 'txExpired';
    case 'TX_INVALID':
    case 'TX_FAILED':
      return 'txInvalid';
    case 'CLIENT_PROOF_INVALID':
      return 'proofInvalid';
    case 'unauthenticated':
      return 'unauthenticated';
    case 'cancelled':
      return 'cancelled';
    case 'session_changed':
      return 'sessionChanged';
    case 'invalid-argument':
      return 'generic';
    default:
      return 'generic';
  }
}


/**
 * TikTok ownership parsers and callables. No channel picker. No Firebase session mutation.
 */
import { isProfileMode } from '../../profile/profileModeFields.ts';
import {
  BASE64URL_RE,
  MAX_TRANSACTION_ID_LEN,
  MIN_TRANSACTION_ID_LEN,
  TIKTOK_OWNERSHIP_CLIENT_PROOF_METHOD,
  TIKTOK_OWNERSHIP_ERROR_CODES,
  TIKTOK_OWNERSHIP_EXCHANGE,
  TIKTOK_OWNERSHIP_GET,
  TIKTOK_OWNERSHIP_PLATFORM,
  TIKTOK_OWNERSHIP_START,
  TIKTOK_OWNERSHIP_UNLINK,
  type TiktokOwnershipErrorCode,
  type TiktokOwnershipGetResponse,
  type TiktokOwnershipMobilePlatform,
  type TiktokOwnershipMode,
  type TiktokOwnershipStartResponse,
  type TiktokOwnershipUnlinkResponse,
  type TiktokOwnershipVerified,
  type TiktokStoredTransaction,
} from './tiktokOwnershipContract.ts';
import {
  assertClientProofChallengeShape,
  assertClientProofVerifierShape,
  createClientProofPair,
  type ClientProofCrypto,
} from './tiktokOwnershipProof.ts';

export type TiktokOwnershipFunctionsPort = {
  region: string;
  call: (name: string, data?: unknown) => Promise<unknown>;
};

export class TiktokOwnershipError extends Error {
  readonly code: string;
  readonly backendCode?: string;
  constructor(code: string, message: string, backendCode?: string) {
    super(message);
    this.name = 'TiktokOwnershipError';
    this.code = code;
    this.backendCode = backendCode;
  }
}

export type TiktokConnectOutcome =
  | { status: 'verified'; verified: TiktokOwnershipVerified }
  | { status: 'cancelled' }
  | { status: 'failed'; error: TiktokOwnershipError };

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

export function assertTiktokOwnershipMode(
  value: unknown,
): TiktokOwnershipMode {
  if (!isProfileMode(value)) {
    throw new TiktokOwnershipError(
      'invalid-argument',
      'mode must be personal or professional.',
    );
  }
  return value;
}

function parseModeFromResponse(value: unknown): TiktokOwnershipMode {
  if (!isProfileMode(value)) {
    throw new TiktokOwnershipError(
      'BAD_RESPONSE',
      'mode must be personal or professional.',
    );
  }
  return value;
}

export function mapCallableError(err: unknown): TiktokOwnershipError {
  if (err instanceof TiktokOwnershipError) return err;
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
    return new TiktokOwnershipError(
      'CALLABLE_FAILED',
      message || 'TikTok ownership callable failed.',
      backendCode,
    );
  }
  for (const token of TIKTOK_OWNERSHIP_ERROR_CODES) {
    if (haystack.includes(token.toLowerCase())) {
      return new TiktokOwnershipError(token, message || token, token);
    }
  }
  if (httpsCode === 'unauthenticated' || /unauthenticated/i.test(message)) {
    return new TiktokOwnershipError(
      'unauthenticated',
      message || 'unauthenticated',
      'unauthenticated',
    );
  }
  return new TiktokOwnershipError(
    'CALLABLE_FAILED',
    message || 'TikTok ownership callable failed.',
    backendCode,
  );
}

export function parseVerifiedShape(raw: unknown): TiktokOwnershipVerified {
  if (!isRecord(raw) || raw.result !== 'verified') {
    throw new TiktokOwnershipError('BAD_RESPONSE', 'Expected verified result.');
  }
  if (raw.platform !== TIKTOK_OWNERSHIP_PLATFORM) {
    throw new TiktokOwnershipError('BAD_RESPONSE', 'Unexpected platform.');
  }
  const mode = parseModeFromResponse(raw.mode);
  const openId = asNonEmptyString(raw.openId);
  const canonicalUrl = asNonEmptyString(raw.canonicalUrl);
  const verifiedAt = asNonEmptyString(raw.verifiedAt);
  if (!openId || !canonicalUrl || !verifiedAt) {
    throw new TiktokOwnershipError('BAD_RESPONSE', 'Missing verified fields.');
  }
  const usernameCache =
    raw.usernameCache === null ? null : asNonEmptyString(raw.usernameCache);
  if (raw.usernameCache != null && usernameCache === null) {
    throw new TiktokOwnershipError('BAD_RESPONSE', 'Invalid usernameCache.');
  }
  return {
    result: 'verified',
    platform: TIKTOK_OWNERSHIP_PLATFORM,
    mode,
    openId,
    canonicalUrl,
    usernameCache: usernameCache ?? null,
    verifiedAt,
  };
}

export function parseStartResponse(raw: unknown): TiktokOwnershipStartResponse {
  if (!isRecord(raw)) {
    throw new TiktokOwnershipError('BAD_RESPONSE', 'Invalid start response.');
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
    throw new TiktokOwnershipError('BAD_RESPONSE', 'Invalid transactionId.');
  }
  if (!authorizationUrl || !authorizationUrl.startsWith('https://')) {
    throw new TiktokOwnershipError('BAD_RESPONSE', 'Invalid authorizationUrl.');
  }
  if (
    'url' in raw ||
    'profileUrl' in raw ||
    'handle' in raw ||
    'username' in raw ||
    'redirectUri' in raw ||
    'returnUrl' in raw
  ) {
    throw new TiktokOwnershipError(
      'BAD_RESPONSE',
      'Prohibited start response fields.',
    );
  }
  if (!Number.isFinite(expiresAt)) {
    throw new TiktokOwnershipError('BAD_RESPONSE', 'Invalid expiresAt.');
  }
  return { transactionId, mode, authorizationUrl, expiresAt };
}

export function parseGetResponse(raw: unknown): TiktokOwnershipGetResponse {
  if (!isRecord(raw)) {
    throw new TiktokOwnershipError('BAD_RESPONSE', 'Invalid get response.');
  }
  if (raw.result === 'not_linked') {
    if (raw.platform !== TIKTOK_OWNERSHIP_PLATFORM || raw.linked !== false) {
      throw new TiktokOwnershipError('BAD_RESPONSE', 'Invalid not_linked.');
    }
    return {
      result: 'not_linked',
      platform: TIKTOK_OWNERSHIP_PLATFORM,
      mode: parseModeFromResponse(raw.mode),
      linked: false,
    };
  }
  return parseVerifiedShape(raw);
}

export function parseUnlinkResponse(
  raw: unknown,
): TiktokOwnershipUnlinkResponse {
  if (
    !isRecord(raw) ||
    raw.result !== 'unlinked' ||
    raw.platform !== TIKTOK_OWNERSHIP_PLATFORM ||
    raw.unlinked !== true
  ) {
    throw new TiktokOwnershipError('BAD_RESPONSE', 'Expected unlinked.');
  }
  return {
    result: 'unlinked',
    platform: TIKTOK_OWNERSHIP_PLATFORM,
    mode: parseModeFromResponse(raw.mode),
    unlinked: true,
  };
}

export async function tiktokOwnershipStart(
  functions: TiktokOwnershipFunctionsPort,
  crypto: ClientProofCrypto,
  input: {
    mode: TiktokOwnershipMode;
    platform: TiktokOwnershipMobilePlatform;
  },
): Promise<{
  start: TiktokOwnershipStartResponse;
  clientProofVerifier: string;
}> {
  const mode = assertTiktokOwnershipMode(input.mode);
  if (input.platform !== 'android' && input.platform !== 'ios') {
    throw new TiktokOwnershipError(
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
    clientProofMethod: TIKTOK_OWNERSHIP_CLIENT_PROOF_METHOD,
  };
  let raw: unknown;
  try {
    raw = await functions.call(TIKTOK_OWNERSHIP_START, request);
  } catch (err) {
    throw mapCallableError(err);
  }
  const start = parseStartResponse(raw);
  if (start.mode !== mode) {
    throw new TiktokOwnershipError('BAD_RESPONSE', 'Start mode echo mismatch.');
  }
  return { start, clientProofVerifier: proof.clientProofVerifier };
}

export async function tiktokOwnershipExchange(
  functions: TiktokOwnershipFunctionsPort,
  transactionId: string,
  clientProofVerifier: string,
): Promise<TiktokOwnershipVerified> {
  assertClientProofVerifierShape(clientProofVerifier);
  if (!isValidTransactionId(transactionId)) {
    throw new TiktokOwnershipError('TX_INVALID', 'Invalid transactionId.');
  }
  let raw: unknown;
  try {
    raw = await functions.call(TIKTOK_OWNERSHIP_EXCHANGE, {
      transactionId,
      clientProofVerifier,
    });
  } catch (err) {
    throw mapCallableError(err);
  }
  return parseVerifiedShape(raw);
}

export async function tiktokOwnershipGet(
  functions: TiktokOwnershipFunctionsPort,
  mode: TiktokOwnershipMode,
): Promise<TiktokOwnershipGetResponse> {
  const scopedMode = assertTiktokOwnershipMode(mode);
  let raw: unknown;
  try {
    raw = await functions.call(TIKTOK_OWNERSHIP_GET, { mode: scopedMode });
  } catch (err) {
    throw mapCallableError(err);
  }
  const parsed = parseGetResponse(raw);
  if (parsed.mode !== scopedMode) {
    throw new TiktokOwnershipError('BAD_RESPONSE', 'Get mode echo mismatch.');
  }
  return parsed;
}

export async function tiktokOwnershipUnlink(
  functions: TiktokOwnershipFunctionsPort,
  mode: TiktokOwnershipMode,
): Promise<TiktokOwnershipUnlinkResponse> {
  const scopedMode = assertTiktokOwnershipMode(mode);
  let raw: unknown;
  try {
    raw = await functions.call(TIKTOK_OWNERSHIP_UNLINK, { mode: scopedMode });
  } catch (err) {
    throw mapCallableError(err);
  }
  const parsed = parseUnlinkResponse(raw);
  if (parsed.mode !== scopedMode) {
    throw new TiktokOwnershipError(
      'BAD_RESPONSE',
      'Unlink mode echo mismatch.',
    );
  }
  return parsed;
}

export function serializeStoredTransaction(
  tx: TiktokStoredTransaction,
): string {
  return JSON.stringify(tx);
}

export function parseStoredTransaction(
  raw: string,
): TiktokStoredTransaction | null {
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

export function tiktokOwnershipErrorToI18nKey(code: string): string {
  switch (code) {
    case 'tiktok-not-enabled':
      return 'notEnabled';
    case 'tiktok-no-account':
      return 'noAccount';
    case 'tiktok-account-claimed':
      return 'accountClaimed';
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
    default:
      return 'generic';
  }
}

export function isTiktokOwnershipErrorCode(
  code: string,
): code is TiktokOwnershipErrorCode {
  return (TIKTOK_OWNERSHIP_ERROR_CODES as readonly string[]).includes(code);
}

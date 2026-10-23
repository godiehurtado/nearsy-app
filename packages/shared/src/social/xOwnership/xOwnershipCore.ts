/**
 * X ownership parsers and callables. No channel picker. No Firebase session mutation.
 */
import { isProfileMode } from '../../profile/profileModeFields.ts';
import {
  BASE64URL_RE,
  MAX_TRANSACTION_ID_LEN,
  MIN_TRANSACTION_ID_LEN,
  X_OWNERSHIP_CLIENT_PROOF_METHOD,
  X_OWNERSHIP_ERROR_CODES,
  X_OWNERSHIP_EXCHANGE,
  X_OWNERSHIP_GET,
  X_OWNERSHIP_PLATFORM,
  X_OWNERSHIP_START,
  X_OWNERSHIP_UNLINK,
  type XOwnershipErrorCode,
  type XOwnershipGetResponse,
  type XOwnershipMobilePlatform,
  type XOwnershipMode,
  type XOwnershipStartResponse,
  type XOwnershipUnlinkResponse,
  type XOwnershipVerified,
  type XStoredTransaction,
} from './xOwnershipContract.ts';
import {
  assertClientProofChallengeShape,
  assertClientProofVerifierShape,
  createClientProofPair,
  type ClientProofCrypto,
} from './xOwnershipProof.ts';

export type XOwnershipFunctionsPort = {
  region: string;
  call: (name: string, data?: unknown) => Promise<unknown>;
};

export class XOwnershipError extends Error {
  readonly code: string;
  readonly backendCode?: string;
  constructor(code: string, message: string, backendCode?: string) {
    super(message);
    this.name = 'XOwnershipError';
    this.code = code;
    this.backendCode = backendCode;
  }
}

export type XConnectOutcome =
  | { status: 'verified'; verified: XOwnershipVerified }
  | { status: 'cancelled' }
  | { status: 'failed'; error: XOwnershipError };

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

export function assertXOwnershipMode(
  value: unknown,
): XOwnershipMode {
  if (!isProfileMode(value)) {
    throw new XOwnershipError(
      'invalid-argument',
      'mode must be personal or professional.',
    );
  }
  return value;
}

function parseModeFromResponse(value: unknown): XOwnershipMode {
  if (!isProfileMode(value)) {
    throw new XOwnershipError(
      'BAD_RESPONSE',
      'mode must be personal or professional.',
    );
  }
  return value;
}

export function mapCallableError(err: unknown): XOwnershipError {
  if (err instanceof XOwnershipError) return err;
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
    return new XOwnershipError(
      'CALLABLE_FAILED',
      message || 'X ownership callable failed.',
      backendCode,
    );
  }
  // Specific X tokens first so a generic 403 is never treated as credits.
  const specific: Array<[RegExp, string]> = [
    [/x-credits-or-access|x_credits_or_access/, 'x-credits-or-access'],
    [/x-api-forbidden|x_forbidden/, 'x-api-forbidden'],
    [/x-rate-limited|x_rate_limited/, 'x-rate-limited'],
    [/x-oauth-failed|x_oauth/, 'x-oauth-failed'],
  ];
  for (const [re, token] of specific) {
    if (re.test(haystack)) {
      return new XOwnershipError(token, message || token, token);
    }
  }
  for (const token of X_OWNERSHIP_ERROR_CODES) {
    if (haystack.includes(token.toLowerCase())) {
      return new XOwnershipError(token, message || token, token);
    }
  }
  if (httpsCode === 'unauthenticated' || /unauthenticated/i.test(message)) {
    return new XOwnershipError(
      'unauthenticated',
      message || 'unauthenticated',
      'unauthenticated',
    );
  }
  return new XOwnershipError(
    'CALLABLE_FAILED',
    message || 'X ownership callable failed.',
    backendCode,
  );
}

export function parseVerifiedShape(raw: unknown): XOwnershipVerified {
  if (!isRecord(raw) || raw.result !== 'verified') {
    throw new XOwnershipError('BAD_RESPONSE', 'Expected verified result.');
  }
  if (raw.platform !== X_OWNERSHIP_PLATFORM) {
    throw new XOwnershipError('BAD_RESPONSE', 'Unexpected platform.');
  }
  const mode = parseModeFromResponse(raw.mode);
  const userId = asNonEmptyString(raw.userId);
  const canonicalUrl = asNonEmptyString(raw.canonicalUrl);
  const verifiedAt = asNonEmptyString(raw.verifiedAt);
  if (!userId || !canonicalUrl || !verifiedAt) {
    throw new XOwnershipError('BAD_RESPONSE', 'Missing verified fields.');
  }
  const usernameCache =
    raw.usernameCache === null ? null : asNonEmptyString(raw.usernameCache);
  if (raw.usernameCache != null && usernameCache === null) {
    throw new XOwnershipError('BAD_RESPONSE', 'Invalid usernameCache.');
  }
  return {
    result: 'verified',
    platform: X_OWNERSHIP_PLATFORM,
    mode,
    userId,
    canonicalUrl,
    usernameCache: usernameCache ?? null,
    verifiedAt,
  };
}

export function parseStartResponse(raw: unknown): XOwnershipStartResponse {
  if (!isRecord(raw)) {
    throw new XOwnershipError('BAD_RESPONSE', 'Invalid start response.');
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
    throw new XOwnershipError('BAD_RESPONSE', 'Invalid transactionId.');
  }
  if (!authorizationUrl || !authorizationUrl.startsWith('https://')) {
    throw new XOwnershipError('BAD_RESPONSE', 'Invalid authorizationUrl.');
  }
  if (
    'url' in raw ||
    'profileUrl' in raw ||
    'handle' in raw ||
    'username' in raw ||
    'redirectUri' in raw ||
    'returnUrl' in raw ||
    'code_challenge' in raw ||
    'codeVerifier' in raw ||
    'pkceChallenge' in raw
  ) {
    throw new XOwnershipError(
      'BAD_RESPONSE',
      'Prohibited start response fields.',
    );
  }
  if (!Number.isFinite(expiresAt)) {
    throw new XOwnershipError('BAD_RESPONSE', 'Invalid expiresAt.');
  }
  return { transactionId, mode, authorizationUrl, expiresAt };
}

export function parseGetResponse(raw: unknown): XOwnershipGetResponse {
  if (!isRecord(raw)) {
    throw new XOwnershipError('BAD_RESPONSE', 'Invalid get response.');
  }
  if (raw.result === 'not_linked') {
    if (raw.platform !== X_OWNERSHIP_PLATFORM || raw.linked !== false) {
      throw new XOwnershipError('BAD_RESPONSE', 'Invalid not_linked.');
    }
    return {
      result: 'not_linked',
      platform: X_OWNERSHIP_PLATFORM,
      mode: parseModeFromResponse(raw.mode),
      linked: false,
    };
  }
  return parseVerifiedShape(raw);
}

export function parseUnlinkResponse(
  raw: unknown,
): XOwnershipUnlinkResponse {
  if (
    !isRecord(raw) ||
    raw.result !== 'unlinked' ||
    raw.platform !== X_OWNERSHIP_PLATFORM ||
    raw.unlinked !== true
  ) {
    throw new XOwnershipError('BAD_RESPONSE', 'Expected unlinked.');
  }
  return {
    result: 'unlinked',
    platform: X_OWNERSHIP_PLATFORM,
    mode: parseModeFromResponse(raw.mode),
    unlinked: true,
  };
}

export async function xOwnershipStart(
  functions: XOwnershipFunctionsPort,
  crypto: ClientProofCrypto,
  input: {
    mode: XOwnershipMode;
    platform: XOwnershipMobilePlatform;
  },
): Promise<{
  start: XOwnershipStartResponse;
  clientProofVerifier: string;
}> {
  const mode = assertXOwnershipMode(input.mode);
  if (input.platform !== 'android' && input.platform !== 'ios') {
    throw new XOwnershipError(
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
    clientProofMethod: X_OWNERSHIP_CLIENT_PROOF_METHOD,
  };
  let raw: unknown;
  try {
    raw = await functions.call(X_OWNERSHIP_START, request);
  } catch (err) {
    throw mapCallableError(err);
  }
  const start = parseStartResponse(raw);
  if (start.mode !== mode) {
    throw new XOwnershipError('BAD_RESPONSE', 'Start mode echo mismatch.');
  }
  return { start, clientProofVerifier: proof.clientProofVerifier };
}

export async function xOwnershipExchange(
  functions: XOwnershipFunctionsPort,
  transactionId: string,
  clientProofVerifier: string,
): Promise<XOwnershipVerified> {
  assertClientProofVerifierShape(clientProofVerifier);
  if (!isValidTransactionId(transactionId)) {
    throw new XOwnershipError('TX_INVALID', 'Invalid transactionId.');
  }
  let raw: unknown;
  try {
    raw = await functions.call(X_OWNERSHIP_EXCHANGE, {
      transactionId,
      clientProofVerifier,
    });
  } catch (err) {
    throw mapCallableError(err);
  }
  return parseVerifiedShape(raw);
}

export async function xOwnershipGet(
  functions: XOwnershipFunctionsPort,
  mode: XOwnershipMode,
): Promise<XOwnershipGetResponse> {
  const scopedMode = assertXOwnershipMode(mode);
  let raw: unknown;
  try {
    raw = await functions.call(X_OWNERSHIP_GET, { mode: scopedMode });
  } catch (err) {
    throw mapCallableError(err);
  }
  const parsed = parseGetResponse(raw);
  if (parsed.mode !== scopedMode) {
    throw new XOwnershipError('BAD_RESPONSE', 'Get mode echo mismatch.');
  }
  return parsed;
}

export async function xOwnershipUnlink(
  functions: XOwnershipFunctionsPort,
  mode: XOwnershipMode,
): Promise<XOwnershipUnlinkResponse> {
  const scopedMode = assertXOwnershipMode(mode);
  let raw: unknown;
  try {
    raw = await functions.call(X_OWNERSHIP_UNLINK, { mode: scopedMode });
  } catch (err) {
    throw mapCallableError(err);
  }
  const parsed = parseUnlinkResponse(raw);
  if (parsed.mode !== scopedMode) {
    throw new XOwnershipError(
      'BAD_RESPONSE',
      'Unlink mode echo mismatch.',
    );
  }
  return parsed;
}

export function serializeStoredTransaction(
  tx: XStoredTransaction,
): string {
  return JSON.stringify(tx);
}

export function parseStoredTransaction(
  raw: string,
): XStoredTransaction | null {
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

export function xOwnershipErrorToI18nKey(code: string): string {
  switch (code) {
    case 'x-not-enabled':
      return 'notEnabled';
    case 'x-no-account':
      return 'noAccount';
    case 'x-account-claimed':
      return 'accountClaimed';
    case 'x-oauth-failed':
    case 'X_OAUTH':
      return 'oauth';
    case 'x-rate-limited':
    case 'X_RATE_LIMITED':
      return 'rateLimited';
    case 'x-credits-or-access':
    case 'X_CREDITS_OR_ACCESS':
      return 'creditsOrAccess';
    case 'x-api-forbidden':
    case 'X_FORBIDDEN':
      return 'forbidden';
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

export function isXOwnershipErrorCode(
  code: string,
): code is XOwnershipErrorCode {
  return (X_OWNERSHIP_ERROR_CODES as readonly string[]).includes(code);
}

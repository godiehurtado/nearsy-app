/**
 * Strict parser for TikTok ownership mobile return URL.
 * Success: nearsy://tiktok-ownership?transactionId&mode&result=ok
 * Error: nearsy://tiktok-ownership?result=error&error=… (&transactionId optional;
 * mode only on success per contract — optional if present on error).
 * Never logs the URL.
 */

import { TIKTOK_OWNERSHIP_RETURN_URL, type TiktokOwnershipMode } from './names';
import { assertTiktokOwnershipMode } from './parse';

const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;
const MIN_TX = 8;
const MAX_TX = 128;

export const TIKTOK_OWNERSHIP_CALLBACK_ERROR_CODES = [
  'TX_INVALID',
  'TX_EXPIRED',
  'TX_FAILED',
] as const;

export type TiktokOwnershipCallbackErrorCode =
  (typeof TIKTOK_OWNERSHIP_CALLBACK_ERROR_CODES)[number];

const ERROR_CODE_SET = new Set<string>(TIKTOK_OWNERSHIP_CALLBACK_ERROR_CODES);

export type TiktokOwnershipReturnParseResult =
  | {
      kind: 'success';
      transactionId: string;
      mode: TiktokOwnershipMode;
      result: 'ok';
    }
  | {
      kind: 'provider_error';
      result: 'error';
      errorCode: string;
      mode?: TiktokOwnershipMode;
      transactionId?: string;
    }
  | { kind: 'invalid'; reason: string }
  | { kind: 'unrelated' };

function strictPercentDecode(raw: string): string | null {
  if (!/%/.test(raw)) return raw;
  if (/%(?![0-9A-Fa-f]{2})/.test(raw)) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

function parseStrictQuery(
  search: string,
): { ok: true; params: Map<string, string> } | { ok: false; reason: string } {
  if (search === '' || search === '?') {
    return { ok: false, reason: 'missing_query' };
  }
  const body = search.startsWith('?') ? search.slice(1) : search;
  if (body.length === 0) return { ok: false, reason: 'missing_query' };
  if (body.includes('#') || body.includes(';')) {
    return { ok: false, reason: 'invalid_query_separator' };
  }

  const params = new Map<string, string>();
  for (const pair of body.split('&')) {
    if (pair.length === 0) return { ok: false, reason: 'empty_pair' };
    const eq = pair.indexOf('=');
    if (eq <= 0) return { ok: false, reason: 'malformed_pair' };
    const key = strictPercentDecode(pair.slice(0, eq).replace(/\+/g, ' '));
    const val = strictPercentDecode(pair.slice(eq + 1).replace(/\+/g, ' '));
    if (key == null || val == null) return { ok: false, reason: 'invalid_encoding' };
    if (key.length === 0) return { ok: false, reason: 'empty_key' };
    if (params.has(key)) return { ok: false, reason: 'duplicate_param' };
    params.set(key, val);
  }
  return { ok: true, params };
}

function looksLikeTiktokReturnCandidate(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.hostname === 'tiktok-ownership' ||
      u.pathname === '/tiktok-ownership' ||
      u.pathname.endsWith('/tiktok-ownership')
    );
  } catch {
    return typeof url === 'string' && /tiktok-ownership/i.test(url);
  }
}

function isValidTxId(transactionId: string): boolean {
  return (
    transactionId.length >= MIN_TX &&
    transactionId.length <= MAX_TX &&
    BASE64URL_RE.test(transactionId)
  );
}

function parseModeParam(raw: string | undefined): TiktokOwnershipMode | null {
  if (raw == null) return null;
  try {
    return assertTiktokOwnershipMode(raw);
  } catch {
    return null;
  }
}

const ALLOWED_KEYS_OK = new Set(['transactionId', 'result', 'mode']);
const ALLOWED_KEYS_ERR = new Set(['transactionId', 'result', 'error', 'mode']);

export function parseTiktokOwnershipReturnUrl(
  url: string,
): TiktokOwnershipReturnParseResult {
  if (typeof url !== 'string' || url.length === 0) {
    return { kind: 'unrelated' };
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return looksLikeTiktokReturnCandidate(url)
      ? { kind: 'invalid', reason: 'malformed_url' }
      : { kind: 'unrelated' };
  }

  if (parsed.protocol !== 'nearsy:' || parsed.hostname !== 'tiktok-ownership') {
    return looksLikeTiktokReturnCandidate(url)
      ? { kind: 'invalid', reason: 'scheme_or_host' }
      : { kind: 'unrelated' };
  }

  if (parsed.username !== '' || parsed.password !== '') {
    return { kind: 'invalid', reason: 'userinfo' };
  }
  if (parsed.port !== '') return { kind: 'invalid', reason: 'port' };
  if (parsed.hash !== '') return { kind: 'invalid', reason: 'fragment' };
  if (parsed.pathname !== '' && parsed.pathname !== '/') {
    return { kind: 'invalid', reason: 'path' };
  }
  if (parsed.pathname === '/') return { kind: 'invalid', reason: 'path' };

  const baseNoQuery = `${parsed.protocol}//${parsed.hostname}`;
  if (baseNoQuery !== TIKTOK_OWNERSHIP_RETURN_URL) {
    return { kind: 'invalid', reason: 'base_mismatch' };
  }

  const schemeHostRaw = url.split('?')[0] ?? '';
  if (schemeHostRaw !== TIKTOK_OWNERSHIP_RETURN_URL) {
    return { kind: 'invalid', reason: 'case_or_base' };
  }

  const q = parseStrictQuery(parsed.search);
  if (q.ok === false) return { kind: 'invalid', reason: q.reason };
  const { params } = q;

  if (params.has('error_description')) {
    return { kind: 'invalid', reason: 'error_description_forbidden' };
  }
  if (params.has('code') || params.has('state') || params.has('access_token')) {
    return { kind: 'invalid', reason: 'forbidden_oauth_param' };
  }

  const result = params.get('result');
  if (result !== 'ok' && result !== 'error') {
    return { kind: 'invalid', reason: 'unknown_result' };
  }

  if (result === 'ok') {
    if (params.has('error')) return { kind: 'invalid', reason: 'success_with_error' };
    for (const key of params.keys()) {
      if (!ALLOWED_KEYS_OK.has(key)) {
        return { kind: 'invalid', reason: 'unknown_param' };
      }
    }
    if (!params.has('transactionId') || !params.has('mode') || params.size !== 3) {
      return { kind: 'invalid', reason: 'unexpected_params' };
    }
    const mode = parseModeParam(params.get('mode') ?? undefined);
    if (!mode) return { kind: 'invalid', reason: 'invalid_mode' };
    const transactionId = params.get('transactionId')!;
    if (!isValidTxId(transactionId)) {
      return { kind: 'invalid', reason: 'malformed_transaction_id' };
    }
    return { kind: 'success', transactionId, mode, result: 'ok' };
  }

  // Error: mode and transactionId are optional (invalid state may omit both).
  if (!params.has('error')) {
    return { kind: 'invalid', reason: 'missing_error_code' };
  }
  for (const key of params.keys()) {
    if (!ALLOWED_KEYS_ERR.has(key)) {
      return { kind: 'invalid', reason: 'unknown_param' };
    }
  }
  const errorCode = params.get('error')!;
  if (!ERROR_CODE_SET.has(errorCode)) {
    return { kind: 'invalid', reason: 'unknown_error_code' };
  }

  const modeRaw = params.get('mode');
  let mode: TiktokOwnershipMode | undefined;
  if (modeRaw != null) {
    const parsedMode = parseModeParam(modeRaw);
    if (!parsedMode) return { kind: 'invalid', reason: 'invalid_mode' };
    mode = parsedMode;
  }

  let transactionId: string | undefined;
  if (params.has('transactionId')) {
    const tx = params.get('transactionId')!;
    if (!isValidTxId(tx)) {
      return { kind: 'invalid', reason: 'malformed_transaction_id' };
    }
    transactionId = tx;
  }

  const expectedMin = 2; // result + error
  const expectedMax = 4; // + optional mode + optional transactionId
  if (params.size < expectedMin || params.size > expectedMax) {
    return { kind: 'invalid', reason: 'unexpected_params' };
  }

  return {
    kind: 'provider_error',
    result: 'error',
    errorCode,
    ...(mode ? { mode } : {}),
    ...(transactionId ? { transactionId } : {}),
  };
}

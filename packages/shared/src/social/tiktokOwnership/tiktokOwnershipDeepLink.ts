/**
 * Parse nearsy://tiktok-ownership?transactionId&mode&result=ok|error&error?
 * `mode` is an informative echo from the callback — it does not mutate the server.
 * Never logs the raw URL.
 */

import { isProfileMode, type ProfileMode } from '../../profile/profileModeFields.ts';
import {
  BASE64URL_RE,
  MAX_TRANSACTION_ID_LEN,
  MIN_TRANSACTION_ID_LEN,
  TIKTOK_OWNERSHIP_RETURN_URL,
} from './tiktokOwnershipContract.ts';

export type TiktokDeepLinkSuccess = {
  kind: 'success';
  transactionId: string;
  result: 'ok';
  /** Informative echo; optional for older callbacks. */
  mode?: ProfileMode;
};

export type TiktokDeepLinkProviderError = {
  kind: 'provider_error';
  result: 'error';
  errorCode: string;
  transactionId?: string;
  mode?: ProfileMode;
};

export type TiktokDeepLinkParseResult =
  | TiktokDeepLinkSuccess
  | TiktokDeepLinkProviderError
  | { kind: 'unrelated' }
  | { kind: 'invalid'; reason: string };

const CALLBACK_ERROR_CODES = new Set([
  'TX_INVALID',
  'TX_EXPIRED',
  'TX_FAILED',
]);

const ALLOWED_KEYS_SUCCESS = new Set(['transactionId', 'result', 'mode']);
const ALLOWED_KEYS_ERROR = new Set([
  'transactionId',
  'result',
  'error',
  'mode',
]);

function looksLikeTiktokReturnCandidate(url: string): boolean {
  return /nearsy:\/\/tiktok-ownership/i.test(url);
}

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
  if (!body) return { ok: false, reason: 'missing_query' };
  if (body.includes('#') || body.includes(';')) {
    return { ok: false, reason: 'invalid_query_separator' };
  }
  const params = new Map<string, string>();
  for (const pair of body.split('&')) {
    if (!pair) return { ok: false, reason: 'empty_pair' };
    const eq = pair.indexOf('=');
    if (eq <= 0) return { ok: false, reason: 'malformed_pair' };
    const key = strictPercentDecode(pair.slice(0, eq));
    const val = strictPercentDecode(pair.slice(eq + 1));
    if (key === null || val === null) {
      return { ok: false, reason: 'bad_encoding' };
    }
    if (!key || params.has(key)) {
      return { ok: false, reason: 'duplicate_or_empty_key' };
    }
    params.set(key, val);
  }
  return { ok: true, params };
}

function isValidTransactionId(value: string): boolean {
  return (
    value.length >= MIN_TRANSACTION_ID_LEN &&
    value.length <= MAX_TRANSACTION_ID_LEN &&
    BASE64URL_RE.test(value)
  );
}

function parseOptionalMode(
  params: Map<string, string>,
): ProfileMode | undefined | 'invalid' {
  if (!params.has('mode')) return undefined;
  const raw = params.get('mode');
  if (!raw || !isProfileMode(raw)) return 'invalid';
  return raw;
}

/**
 * Strict parse of the mobile return URL from tiktokOwnershipCallback 302.
 */
export function parseTiktokOwnershipReturnUrl(
  rawUrl: string,
): TiktokDeepLinkParseResult {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return { kind: 'invalid', reason: 'empty' };
  }
  const url = rawUrl.trim();

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return looksLikeTiktokReturnCandidate(url)
      ? { kind: 'invalid', reason: 'malformed_url' }
      : { kind: 'unrelated' };
  }

  const isExactSchemeHost =
    parsed.protocol === 'nearsy:' && parsed.hostname === 'tiktok-ownership';

  if (!isExactSchemeHost) {
    return looksLikeTiktokReturnCandidate(url)
      ? { kind: 'invalid', reason: 'scheme_or_host' }
      : { kind: 'unrelated' };
  }

  if (parsed.username !== '' || parsed.password !== '') {
    return { kind: 'invalid', reason: 'userinfo' };
  }
  if (parsed.port !== '') {
    return { kind: 'invalid', reason: 'port' };
  }
  if (parsed.hash !== '') {
    return { kind: 'invalid', reason: 'fragment' };
  }
  if (parsed.pathname !== '' && parsed.pathname !== '/') {
    return { kind: 'invalid', reason: 'path' };
  }
  if (parsed.pathname === '/') {
    return { kind: 'invalid', reason: 'path' };
  }

  const baseNoQuery = `${parsed.protocol}//${parsed.hostname}`;
  if (baseNoQuery !== TIKTOK_OWNERSHIP_RETURN_URL) {
    return { kind: 'invalid', reason: 'base_mismatch' };
  }

  const schemeHostRaw = url.split('?')[0] ?? '';
  if (schemeHostRaw !== TIKTOK_OWNERSHIP_RETURN_URL) {
    return { kind: 'invalid', reason: 'case_or_base' };
  }

  const q = parseStrictQuery(parsed.search);
  if (!q.ok) return { kind: 'invalid', reason: q.reason };
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
    if (params.has('error')) {
      return { kind: 'invalid', reason: 'success_with_error' };
    }
    for (const key of params.keys()) {
      if (!ALLOWED_KEYS_SUCCESS.has(key)) {
        return { kind: 'invalid', reason: 'unknown_param' };
      }
    }
    const tx = params.get('transactionId');
    if (!tx || !isValidTransactionId(tx)) {
      return { kind: 'invalid', reason: 'bad_transaction' };
    }
    const mode = parseOptionalMode(params);
    if (mode === 'invalid') {
      return { kind: 'invalid', reason: 'bad_mode' };
    }
    return {
      kind: 'success',
      transactionId: tx,
      result: 'ok',
      ...(mode ? { mode } : {}),
    };
  }

  const errorCode = params.get('error');
  if (!errorCode || !CALLBACK_ERROR_CODES.has(errorCode)) {
    return { kind: 'invalid', reason: 'bad_error' };
  }
  for (const key of params.keys()) {
    if (!ALLOWED_KEYS_ERROR.has(key)) {
      return { kind: 'invalid', reason: 'unknown_param' };
    }
  }
  const tx = params.get('transactionId');
  if (tx !== undefined && !isValidTransactionId(tx)) {
    return { kind: 'invalid', reason: 'bad_transaction' };
  }
  const mode = parseOptionalMode(params);
  if (mode === 'invalid') {
    return { kind: 'invalid', reason: 'bad_mode' };
  }
  return {
    kind: 'provider_error',
    result: 'error',
    errorCode,
    transactionId: tx,
    ...(mode ? { mode } : {}),
  };
}


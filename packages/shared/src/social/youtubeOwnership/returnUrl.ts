/**
 * Strict parser for YouTube ownership mobile return URL.
 * Success: nearsy://youtube-ownership?transactionId&mode&result=ok
 * Error: nearsy://youtube-ownership?transactionId&mode&result=error&error=…
 * Never logs the URL.
 */

import { YOUTUBE_OWNERSHIP_RETURN_URL, type YoutubeOwnershipMode } from './names';
import { assertYoutubeOwnershipMode } from './parse';

const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;
const MIN_TX = 8;
const MAX_TX = 128;

export const YOUTUBE_OWNERSHIP_CALLBACK_ERROR_CODES = [
  'TX_INVALID',
  'TX_EXPIRED',
  'TX_FAILED',
] as const;

export type YoutubeOwnershipCallbackErrorCode =
  (typeof YOUTUBE_OWNERSHIP_CALLBACK_ERROR_CODES)[number];

const ERROR_CODE_SET = new Set<string>(YOUTUBE_OWNERSHIP_CALLBACK_ERROR_CODES);

export type YoutubeOwnershipReturnParseResult =
  | {
      kind: 'success';
      transactionId: string;
      mode: YoutubeOwnershipMode;
      result: 'ok';
    }
  | {
      kind: 'provider_error';
      result: 'error';
      errorCode: string;
      mode: YoutubeOwnershipMode;
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

function looksLikeYoutubeReturnCandidate(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.hostname === 'youtube-ownership' ||
      u.pathname === '/youtube-ownership' ||
      u.pathname.endsWith('/youtube-ownership')
    );
  } catch {
    return typeof url === 'string' && /youtube-ownership/i.test(url);
  }
}

function isValidTxId(transactionId: string): boolean {
  return (
    transactionId.length >= MIN_TX &&
    transactionId.length <= MAX_TX &&
    BASE64URL_RE.test(transactionId)
  );
}

function parseModeParam(raw: string | undefined): YoutubeOwnershipMode | null {
  if (raw == null) return null;
  try {
    return assertYoutubeOwnershipMode(raw);
  } catch {
    return null;
  }
}

const ALLOWED_KEYS_OK = new Set(['transactionId', 'result', 'mode']);
const ALLOWED_KEYS_ERR_WITH_TX = new Set([
  'transactionId',
  'result',
  'error',
  'mode',
]);
const ALLOWED_KEYS_ERR_NO_TX = new Set(['result', 'error', 'mode']);

export function parseYoutubeOwnershipReturnUrl(
  url: string,
): YoutubeOwnershipReturnParseResult {
  if (typeof url !== 'string' || url.length === 0) {
    return { kind: 'unrelated' };
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return looksLikeYoutubeReturnCandidate(url)
      ? { kind: 'invalid', reason: 'malformed_url' }
      : { kind: 'unrelated' };
  }

  if (parsed.protocol !== 'nearsy:' || parsed.hostname !== 'youtube-ownership') {
    return looksLikeYoutubeReturnCandidate(url)
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
  if (baseNoQuery !== YOUTUBE_OWNERSHIP_RETURN_URL) {
    return { kind: 'invalid', reason: 'base_mismatch' };
  }

  const schemeHostRaw = url.split('?')[0] ?? '';
  if (schemeHostRaw !== YOUTUBE_OWNERSHIP_RETURN_URL) {
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

  const mode = parseModeParam(params.get('mode') ?? undefined);
  if (!mode) return { kind: 'invalid', reason: 'invalid_mode' };

  if (result === 'ok') {
    if (params.has('error')) return { kind: 'invalid', reason: 'success_with_error' };
    for (const key of params.keys()) {
      if (!ALLOWED_KEYS_OK.has(key)) {
        return { kind: 'invalid', reason: 'unknown_param' };
      }
    }
    if (!params.has('transactionId') || params.size !== 3) {
      return { kind: 'invalid', reason: 'unexpected_params' };
    }
    const transactionId = params.get('transactionId')!;
    if (!isValidTxId(transactionId)) {
      return { kind: 'invalid', reason: 'malformed_transaction_id' };
    }
    return { kind: 'success', transactionId, mode, result: 'ok' };
  }

  if (!params.has('error')) {
    return { kind: 'invalid', reason: 'missing_error_code' };
  }
  const errorCode = params.get('error')!;
  if (!ERROR_CODE_SET.has(errorCode)) {
    return { kind: 'invalid', reason: 'unknown_error_code' };
  }

  const hasTx = params.has('transactionId');
  if (hasTx) {
    if (params.size !== 4) return { kind: 'invalid', reason: 'unexpected_params' };
    for (const key of params.keys()) {
      if (!ALLOWED_KEYS_ERR_WITH_TX.has(key)) {
        return { kind: 'invalid', reason: 'unknown_param' };
      }
    }
    const transactionId = params.get('transactionId')!;
    if (!isValidTxId(transactionId)) {
      return { kind: 'invalid', reason: 'malformed_transaction_id' };
    }
    return {
      kind: 'provider_error',
      result: 'error',
      errorCode,
      mode,
      transactionId,
    };
  }

  if (params.size !== 3) return { kind: 'invalid', reason: 'unexpected_params' };
  for (const key of params.keys()) {
    if (!ALLOWED_KEYS_ERR_NO_TX.has(key)) {
      return { kind: 'invalid', reason: 'unknown_param' };
    }
  }
  return { kind: 'provider_error', result: 'error', errorCode, mode };
}

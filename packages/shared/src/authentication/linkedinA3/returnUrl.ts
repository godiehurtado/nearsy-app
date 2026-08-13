/**
 * Strict parser for LinkedIn A3 mobile return URL (Dev).
 * Success: nearsy://linkedin-auth?transactionId=<id>&result=ok
 * Never logs the URL.
 */

import { LINKEDIN_APP_RETURN_URL } from './environment/nearsyFirebaseEnvironment';

const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;
const MIN_TX = 8;
const MAX_TX = 128;

export const LINKEDIN_MOBILE_RETURN_ERROR_CODES = [
  'INVALID_ARGUMENT',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'TX_INVALID',
  'TX_EXPIRED',
  'TX_FAILED',
  'CLIENT_PROOF_INVALID',
  'OIDC_INVALID',
  'LINKEDIN_ERROR',
  'CONFIG_MISSING',
  'RATE_LIMITED',
  'INTERNAL',
  'METHOD_NOT_ALLOWED',
  'CALLBACK_NOT_ENABLED',
] as const;

export type LinkedInMobileReturnErrorCode =
  (typeof LINKEDIN_MOBILE_RETURN_ERROR_CODES)[number];

const ERROR_CODE_SET = new Set<string>(LINKEDIN_MOBILE_RETURN_ERROR_CODES);

export type LinkedInReturnParseResult =
  | { kind: 'success'; transactionId: string; result: 'ok' }
  | {
      kind: 'provider_error';
      result: 'error';
      errorCode: string;
      transactionId?: string;
    }
  | { kind: 'invalid'; reason: string }
  | { kind: 'unrelated' };

export function isExactLinkedInMobileReturnBase(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'nearsy:') return false;
    if (u.hostname !== 'linkedin-auth') return false;
    const path = u.pathname === '' || u.pathname === '/' ? '' : u.pathname;
    return path === '';
  } catch {
    return false;
  }
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

function looksLikeLinkedInReturnCandidate(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.hostname === 'linkedin-auth' ||
      u.pathname === '/linkedin-auth' ||
      u.pathname.endsWith('/linkedin-auth')
    );
  } catch {
    return typeof url === 'string' && /linkedin-auth/i.test(url);
  }
}

function isValidTxId(transactionId: string): boolean {
  return (
    transactionId.length >= MIN_TX &&
    transactionId.length <= MAX_TX &&
    BASE64URL_RE.test(transactionId)
  );
}

/**
 * Pure parser — no I/O, no logging of URL/query contents.
 */
export function parseLinkedInMobileReturnUrl(
  url: string,
): LinkedInReturnParseResult {
  if (typeof url !== 'string' || url.length === 0) {
    return { kind: 'unrelated' };
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return looksLikeLinkedInReturnCandidate(url)
      ? { kind: 'invalid', reason: 'malformed_url' }
      : { kind: 'unrelated' };
  }

  if (parsed.protocol !== 'nearsy:' || parsed.hostname !== 'linkedin-auth') {
    return looksLikeLinkedInReturnCandidate(url)
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
  if (baseNoQuery !== LINKEDIN_APP_RETURN_URL) {
    return { kind: 'invalid', reason: 'base_mismatch' };
  }

  const schemeHostRaw = url.split('?')[0] ?? '';
  if (schemeHostRaw !== LINKEDIN_APP_RETURN_URL) {
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
    if (params.has('error')) return { kind: 'invalid', reason: 'success_with_error' };
    for (const key of params.keys()) {
      if (key !== 'transactionId' && key !== 'result') {
        return { kind: 'invalid', reason: 'unknown_param' };
      }
    }
    if (!params.has('transactionId') || params.size !== 2) {
      return { kind: 'invalid', reason: 'unexpected_params' };
    }
    const transactionId = params.get('transactionId')!;
    if (!isValidTxId(transactionId)) {
      return { kind: 'invalid', reason: 'malformed_transaction_id' };
    }
    return { kind: 'success', transactionId, result: 'ok' };
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
    if (params.size !== 3) return { kind: 'invalid', reason: 'unexpected_params' };
    for (const key of params.keys()) {
      if (key !== 'transactionId' && key !== 'result' && key !== 'error') {
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
      transactionId,
    };
  }

  if (params.size !== 2) return { kind: 'invalid', reason: 'unexpected_params' };
  return { kind: 'provider_error', result: 'error', errorCode };
}

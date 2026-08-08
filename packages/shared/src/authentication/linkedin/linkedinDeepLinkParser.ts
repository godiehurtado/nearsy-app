/**
 * Pure LinkedIn mobile-return URL parser (A3.4.3).
 *
 * Authoritative contract from Functions @ f1a90b6:
 * - src/services/linkedinAuthCallback.ts → redirectForTx / redirectUnknown / appendQuery
 * - src/config/urls.ts → DEVELOPMENT_APP_RETURN_URL = 'nearsy://linkedin-auth'
 * - src/services/__tests__/linkedinAuthCore.test.ts
 *
 * Success: nearsy://linkedin-auth?transactionId=<id>&result=ok
 * Error (known tx): ...?transactionId=<id>&result=error&error=<PublicErrorCode>
 * Error (unknown): ...?result=error&error=<PublicErrorCode>
 *
 * Encoding: URLSearchParams (application/x-www-form-urlencoded) via `new URL` + set.
 * Core off: HTTP 503 JSON CALLBACK_NOT_ENABLED — no mobile redirect (not parsed here).
 * error_description is never part of the mobile redirect; if present → invalid.
 */

import {
  BASE64URL_RE,
  LINKEDIN_MOBILE_RETURN_URL,
  MAX_TRANSACTION_ID_LEN,
  MIN_TRANSACTION_ID_LEN,
  type LinkedInDeepLinkParseResult,
} from './linkedinAuthCore.ts';

/** PublicErrorCode values Functions may place in redirect `error=` (domain/errors.ts). */
export const LINKEDIN_MOBILE_RETURN_ERROR_CODES = [
  'INVALID_ARGUMENT',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'TX_INVALID',
  'TX_EXPIRED',
  'TX_FAILED',
  'PKCE_INVALID',
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

const ALLOWED_KEYS_SUCCESS = new Set(['transactionId', 'result']);
const ALLOWED_KEYS_ERROR_WITH_TX = new Set([
  'transactionId',
  'result',
  'error',
]);
const ALLOWED_KEYS_ERROR_UNKNOWN = new Set(['result', 'error']);

/**
 * Strict percent-decode: reject malformed escapes (no silent replacement).
 */
export function strictPercentDecode(raw: string): string | null {
  if (!/%/.test(raw)) return raw;
  if (/%(?![0-9A-Fa-f]{2})/.test(raw)) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

/**
 * Parse query into ordered unique key→value map.
 * Rejects empty keys, missing '=', duplicate keys, and malformed encoding.
 */
export function parseStrictQuery(
  search: string,
): { ok: true; params: Map<string, string> } | { ok: false; reason: string } {
  if (search === '' || search === '?') {
    return { ok: false, reason: 'missing_query' };
  }
  const body = search.startsWith('?') ? search.slice(1) : search;
  if (body.length === 0) {
    return { ok: false, reason: 'missing_query' };
  }
  if (body.includes('#') || body.includes(';')) {
    return { ok: false, reason: 'invalid_query_separator' };
  }

  const params = new Map<string, string>();
  const pairs = body.split('&');
  for (const pair of pairs) {
    if (pair.length === 0) {
      return { ok: false, reason: 'empty_pair' };
    }
    const eq = pair.indexOf('=');
    if (eq <= 0) {
      return { ok: false, reason: 'malformed_pair' };
    }
    const rawKey = pair.slice(0, eq);
    const rawVal = pair.slice(eq + 1);
    const key = strictPercentDecode(rawKey.replace(/\+/g, ' '));
    const val = strictPercentDecode(rawVal.replace(/\+/g, ' '));
    if (key == null || val == null) {
      return { ok: false, reason: 'invalid_encoding' };
    }
    if (key.length === 0) {
      return { ok: false, reason: 'empty_key' };
    }
    if (params.has(key)) {
      return { ok: false, reason: 'duplicate_param' };
    }
    params.set(key, val);
  }
  return { ok: true, params };
}

function looksLikeLinkedInReturnCandidate(url: string): boolean {
  // Classify near-miss LinkedIn returns as invalid (not unrelated).
  // Other app links (e.g. nearsy://welcome) stay unrelated / ignored.
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

/**
 * Pure parser — no I/O, no logging of URL/query contents.
 */
export function parseLinkedInMobileReturnUrl(
  url: string,
): LinkedInDeepLinkParseResult {
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

  const isExactSchemeHost =
    parsed.protocol === 'nearsy:' && parsed.hostname === 'linkedin-auth';

  if (!isExactSchemeHost) {
    return looksLikeLinkedInReturnCandidate(url)
      ? { kind: 'invalid', reason: 'scheme_or_host' }
      : { kind: 'unrelated' };
  }

  // Reject userinfo, port, fragment, non-empty path (Functions appendQuery uses bare base).
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
  // Functions `new URL('nearsy://linkedin-auth')` → pathname ''; reject trailing slash path.
  if (parsed.pathname === '/') {
    return { kind: 'invalid', reason: 'path' };
  }

  // Exact base without relying on startsWith for acceptance.
  const baseNoQuery = `${parsed.protocol}//${parsed.hostname}`;
  if (baseNoQuery !== LINKEDIN_MOBILE_RETURN_URL) {
    return { kind: 'invalid', reason: 'base_mismatch' };
  }

  // Case: URL parser lowercases scheme; reject raw uppercase scheme/host variants.
  const schemeHostRaw = url.split('?')[0] ?? '';
  if (schemeHostRaw !== LINKEDIN_MOBILE_RETURN_URL) {
    return { kind: 'invalid', reason: 'case_or_base' };
  }

  const q = parseStrictQuery(parsed.search);
  if (!q.ok) {
    return { kind: 'invalid', reason: q.reason };
  }
  const { params } = q;

  // Forbidden / never-authorized on mobile return.
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
    if (!params.has('transactionId')) {
      return { kind: 'invalid', reason: 'missing_transaction_id' };
    }
    // Exact key set
    if (params.size !== 2) {
      return { kind: 'invalid', reason: 'unexpected_params' };
    }
    const transactionId = params.get('transactionId')!;
    if (
      transactionId.length < MIN_TRANSACTION_ID_LEN ||
      transactionId.length > MAX_TRANSACTION_ID_LEN ||
      !BASE64URL_RE.test(transactionId)
    ) {
      return { kind: 'invalid', reason: 'malformed_transaction_id' };
    }
    return { kind: 'success', transactionId, result: 'ok' };
  }

  // result === 'error'
  if (!params.has('error')) {
    return { kind: 'invalid', reason: 'missing_error_code' };
  }
  const errorCode = params.get('error')!;
  if (!ERROR_CODE_SET.has(errorCode)) {
    return { kind: 'invalid', reason: 'unknown_error_code' };
  }

  const hasTx = params.has('transactionId');
  const allowed = hasTx ? ALLOWED_KEYS_ERROR_WITH_TX : ALLOWED_KEYS_ERROR_UNKNOWN;
  for (const key of params.keys()) {
    if (!allowed.has(key)) {
      return { kind: 'invalid', reason: 'unknown_param' };
    }
  }
  if (hasTx) {
    if (params.size !== 3) {
      return { kind: 'invalid', reason: 'unexpected_params' };
    }
    const transactionId = params.get('transactionId')!;
    if (
      transactionId.length < MIN_TRANSACTION_ID_LEN ||
      transactionId.length > MAX_TRANSACTION_ID_LEN ||
      !BASE64URL_RE.test(transactionId)
    ) {
      return { kind: 'invalid', reason: 'malformed_transaction_id' };
    }
    return {
      kind: 'provider_error',
      result: 'error',
      errorCode,
      transactionId,
    };
  }
  if (params.size !== 2) {
    return { kind: 'invalid', reason: 'unexpected_params' };
  }
  return {
    kind: 'provider_error',
    result: 'error',
    errorCode,
  };
}

/**
 * Fingerprint for deduplication — stable, no secrets beyond public query fields.
 */
export function linkedInReturnFingerprint(url: string): string | null {
  const parsed = parseLinkedInMobileReturnUrl(url);
  if (parsed.kind === 'success') {
    return `ok:${parsed.transactionId}`;
  }
  if (parsed.kind === 'provider_error') {
    return `err:${parsed.transactionId ?? ''}:${parsed.errorCode}`;
  }
  return null;
}

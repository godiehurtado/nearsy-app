/**
 * Development-only App Check failure diagnostics (I1-I / I1-J).
 * Never includes tokens, JWTs, API keys, App IDs, or full URLs.
 */

export type AppCheckFailureStage =
  | 'read_debug_token'
  | 'configure_provider'
  | 'initialize_app_check'
  | 'get_token'
  | 'unknown';

export type AppCheckExchangeOperation =
  | 'exchangeDebugToken'
  | 'exchangeAppAttestAssertion'
  | 'exchangeDeviceCheckToken'
  | 'other'
  | 'unknown';

export type AppCheckFailureDiagnostic = {
  stage: AppCheckFailureStage;
  normalizedCode: string;
  nativeCode?: string;
  nativeDomain?: string;
  safeMessage: string;
  retryNumber: number;
  /** Parsed from native server error when present. */
  httpStatus?: number | null;
  firebaseStatus?: string | null;
  firebaseErrorMessage?: string | null;
  exchangeOperation?: AppCheckExchangeOperation;
  /** Host only, e.g. firebaseappcheck.googleapis.com */
  exchangeHost?: string | null;
  /** Whether URL app id shape matches 1:…:ios:… (value never shown). */
  targetAppIdShapeMatchesIos?: boolean | null;
};

const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
/** Full Firebase app ids */
const FIREBASE_APP_ID_RE = /\b1:\d{6,}:(?:ios|android):[a-f0-9]+\b/gi;
/** Residual fragments after aggressive redaction (must not leak). */
const APP_ID_FRAGMENT_RE =
  /(?:^|[^a-z0-9])(?:1:)?\d{6,}:(?:ios|android):[a-f0-9]+/gi;
const API_KEY_RE = /\bAIza[0-9A-Za-z_-]{20,}\b/g;
/** Google OAuth / Firebase client ids (never show full values). */
const GOOGLE_CLIENT_ID_RE =
  /\b\d{6,}-[a-z0-9]+\.apps\.googleusercontent\.com\b/gi;
const LONG_TOKENISH_RE = /[A-Za-z0-9_+\-/=]{40,}/g;
const FULL_URL_RE = /https?:\/\/[^\s]+/gi;

export function sanitizeAppCheckSafeMessage(raw: unknown): string {
  const text = String(
    raw && typeof raw === 'object' && 'message' in raw
      ? (raw as { message?: unknown }).message
      : (raw ?? ''),
  );
  return text
    .replace(FIREBASE_APP_ID_RE, '[appId]')
    .replace(APP_ID_FRAGMENT_RE, (m) =>
      m.startsWith('1') || /^\d/.test(m) ? '[appId]' : `${m[0]}[appId]`,
    )
    .replace(API_KEY_RE, '[apiKey]')
    .replace(GOOGLE_CLIENT_ID_RE, '[clientId]')
    .replace(UUID_RE, '[redacted]')
    .replace(FULL_URL_RE, (url) => {
      try {
        const u = new URL(url.replace(/[),.;]+$/, ''));
        return `${u.protocol}//${u.host}/[path]`;
      } catch {
        return '[url]';
      }
    })
    // Second pass: fragments left after URL/token mangling
    .replace(FIREBASE_APP_ID_RE, '[appId]')
    .replace(APP_ID_FRAGMENT_RE, (m) =>
      m.startsWith('1') || /^\d/.test(m) ? '[appId]' : `${m[0]}[appId]`,
    )
    .replace(LONG_TOKENISH_RE, '[redacted]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220) || 'App Check failed';
}

/**
 * Parse structured fields from Firebase App Check Core server error text
 * BEFORE redacting/truncating.
 */
export function parseAppCheckServerErrorFields(rawMessage: string): {
  httpStatus: number | null;
  firebaseStatus: string | null;
  firebaseErrorMessage: string | null;
  exchangeOperation: AppCheckExchangeOperation;
  exchangeHost: string | null;
  targetAppIdShapeMatchesIos: boolean | null;
} {
  const text = String(rawMessage ?? '');

  const httpMatch =
    text.match(/HTTP status code:\s*(\d{3})/i) ||
    text.match(/"code"\s*:\s*(\d{3})/);
  const httpStatus = httpMatch ? Number(httpMatch[1]) : null;

  let firebaseStatus: string | null = null;
  let firebaseErrorMessage: string | null = null;
  const statusJson = text.match(/"status"\s*:\s*"([A-Z_]+)"/);
  if (statusJson) firebaseStatus = statusJson[1];
  const messageJson = text.match(/"message"\s*:\s*"([^"]+)"/);
  if (messageJson) {
    firebaseErrorMessage = sanitizeAppCheckSafeMessage(
      messageJson[1].replace(/\\u003c/g, '<').replace(/\\u003e/g, '>'),
    );
  }

  let exchangeOperation: AppCheckExchangeOperation = 'unknown';
  if (/:exchangeDebugToken\b/i.test(text) || /exchangeDebugToken/i.test(text)) {
    exchangeOperation = 'exchangeDebugToken';
  } else if (/:exchangeAppAttestAssertion\b/i.test(text)) {
    exchangeOperation = 'exchangeAppAttestAssertion';
  } else if (/:exchangeDeviceCheckToken\b/i.test(text)) {
    exchangeOperation = 'exchangeDeviceCheckToken';
  } else if (/firebaseappcheck\.googleapis\.com/i.test(text)) {
    exchangeOperation = 'other';
  }

  let exchangeHost: string | null = null;
  const hostMatch = text.match(
    /https?:\/\/(firebaseappcheck\.googleapis\.com)[^\s]*/i,
  );
  if (hostMatch) {
    exchangeHost = hostMatch[1].toLowerCase();
  } else if (/firebaseappcheck\.googleapis\.com/i.test(text)) {
    exchangeHost = 'firebaseappcheck.googleapis.com';
  }

  let targetAppIdShapeMatchesIos: boolean | null = null;
  if (/1:\d+:ios:[a-f0-9]+/i.test(text) || /:\d+:ios:[a-f0-9]+/i.test(text)) {
    targetAppIdShapeMatchesIos = true;
  } else if (
    /1:\d+:android:[a-f0-9]+/i.test(text) ||
    /:\d+:android:[a-f0-9]+/i.test(text)
  ) {
    targetAppIdShapeMatchesIos = false;
  }

  return {
    httpStatus,
    firebaseStatus,
    firebaseErrorMessage,
    exchangeOperation,
    exchangeHost,
    targetAppIdShapeMatchesIos,
  };
}

export function classifyAppCheckHttpStatus(httpStatus: number | null | undefined): {
  class:
    | 'malformed_or_bad_request'
    | 'authz_or_unregistered'
    | 'app_not_registered'
    | 'rate_limited'
    | 'server_error'
    | 'transport_or_unknown';
  note: string;
} {
  if (httpStatus == null) {
    return {
      class: 'transport_or_unknown',
      note: 'HTTP status was not present in the retained error text.',
    };
  }
  if (httpStatus === 400) {
    return {
      class: 'malformed_or_bad_request',
      note: 'Malformed debug token or request.',
    };
  }
  if (httpStatus === 401 || httpStatus === 403) {
    return {
      class: 'authz_or_unregistered',
      note: 'Unauthorized / permission denied (often unregistered debug token or app mismatch).',
    };
  }
  if (httpStatus === 404) {
    return {
      class: 'app_not_registered',
      note: 'App Check app resource not found.',
    };
  }
  if (httpStatus === 429) {
    return { class: 'rate_limited', note: 'Quota or rate limit.' };
  }
  if (httpStatus >= 500) {
    return { class: 'server_error', note: 'Firebase server error.' };
  }
  return {
    class: 'transport_or_unknown',
    note: `Unexpected HTTP status ${httpStatus}.`,
  };
}

export function extractNativeAppCheckError(err: unknown): {
  nativeCode?: string;
  nativeDomain?: string;
  rawMessage: string;
  safeMessage: string;
  server: ReturnType<typeof parseAppCheckServerErrorFields>;
} {
  const anyErr = err as {
    code?: unknown;
    message?: unknown;
    domain?: unknown;
    userInfo?: {
      NSLocalizedDescription?: unknown;
      NSLocalizedFailureReason?: unknown;
    };
    nativeErrorCode?: unknown;
    nativeErrorMessage?: unknown;
  };

  const nativeCode =
    typeof anyErr?.code === 'string' && anyErr.code.trim()
      ? anyErr.code.trim()
      : typeof anyErr?.nativeErrorCode === 'string'
        ? anyErr.nativeErrorCode
        : undefined;

  const nativeDomain =
    typeof anyErr?.domain === 'string' && anyErr.domain.trim()
      ? anyErr.domain.trim().slice(0, 80)
      : undefined;

  const rawMessage = String(
    anyErr?.userInfo?.NSLocalizedFailureReason ??
      anyErr?.userInfo?.NSLocalizedDescription ??
      anyErr?.nativeErrorMessage ??
      anyErr?.message ??
      '',
  );

  const server = parseAppCheckServerErrorFields(rawMessage);

  return {
    nativeCode,
    nativeDomain,
    rawMessage,
    safeMessage: sanitizeAppCheckSafeMessage(rawMessage),
    server,
  };
}

export function buildAppCheckFailureDiagnostic(
  err: unknown,
  stage: AppCheckFailureStage,
  retryNumber: number,
): AppCheckFailureDiagnostic {
  const extracted = extractNativeAppCheckError(err);
  const normalizedCode =
    extracted.nativeCode && extracted.nativeCode.startsWith('appCheck/')
      ? extracted.nativeCode
      : extracted.nativeCode
        ? `appCheck/${extracted.nativeCode.replace(/^appCheck\//, '')}`
        : 'APP_CHECK_FAILED';

  // Debug provider getToken always hits exchangeDebugToken when host matches.
  let exchangeOperation = extracted.server.exchangeOperation;
  if (
    stage === 'get_token' &&
    (exchangeOperation === 'unknown' || exchangeOperation === 'other') &&
    extracted.server.exchangeHost === 'firebaseappcheck.googleapis.com'
  ) {
    exchangeOperation = 'exchangeDebugToken';
  }

  return {
    stage,
    normalizedCode,
    nativeCode: extracted.nativeCode,
    nativeDomain: extracted.nativeDomain,
    safeMessage: extracted.safeMessage,
    retryNumber,
    httpStatus: extracted.server.httpStatus,
    firebaseStatus: extracted.server.firebaseStatus,
    firebaseErrorMessage: extracted.server.firebaseErrorMessage,
    exchangeOperation,
    exchangeHost: extracted.server.exchangeHost,
    targetAppIdShapeMatchesIos: extracted.server.targetAppIdShapeMatchesIos,
  };
}

export function formatAppCheckDiagnosticLine(
  d: AppCheckFailureDiagnostic,
): string {
  const httpClass = classifyAppCheckHttpStatus(d.httpStatus ?? null);
  return [
    `stage = ${d.stage}`,
    `normalizedCode = ${d.normalizedCode}`,
    `nativeCode = ${d.nativeCode ?? 'n/a'}`,
    `nativeDomain = ${d.nativeDomain ?? 'n/a'}`,
    `httpStatus = ${d.httpStatus ?? 'not_captured'}`,
    `httpClass = ${httpClass.class}`,
    `firebaseStatus = ${d.firebaseStatus ?? 'n/a'}`,
    `firebaseErrorMessage = ${d.firebaseErrorMessage ?? 'n/a'}`,
    `exchangeOperation = ${d.exchangeOperation ?? 'unknown'}`,
    `exchangeHost = ${d.exchangeHost ?? 'n/a'}`,
    `targetAppIdShapeMatchesIos = ${
      d.targetAppIdShapeMatchesIos == null
        ? 'n/a'
        : d.targetAppIdShapeMatchesIos
          ? 'yes'
          : 'no'
    }`,
    `safeMessage = ${d.safeMessage}`,
    `retry = ${d.retryNumber}`,
  ].join('\n');
}

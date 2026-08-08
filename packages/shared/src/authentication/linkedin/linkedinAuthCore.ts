/**
 * LinkedIn A3 client core (A3.4.2) — PKCE, secure transaction, Start/Exchange.
 *
 * Pure / injectable: Node unit tests import this file with `.ts` suffix.
 * Android wiring lives in linkedinAuth.android.ts (lazy native deps).
 *
 * Authoritative Functions sources (@ f1a90b6):
 * - src/domain/types.ts
 * - src/domain/errors.ts
 * - src/config/runtime.ts, env.ts, urls.ts
 * - src/index.ts
 * - docs/operations/A3.2-MOBILE-HANDOFF.md
 */

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

export type LinkedInMobilePlatform = 'android';

export const LINKEDIN_AUTH_START_CALLABLE = 'linkedinAuthStart' as const;
export const LINKEDIN_AUTH_EXCHANGE_CALLABLE = 'linkedinAuthExchange' as const;
export const LINKEDIN_MOBILE_RETURN_URL = 'nearsy://linkedin-auth' as const;
export const LINKEDIN_TRANSACTION_TTL_MS = 10 * 60 * 1000;
export const PKCE_METHOD_S256 = 'S256' as const;

export const MIN_CODE_VERIFIER_LEN = 43;
export const MAX_CODE_VERIFIER_LEN = 128;
export const MIN_PKCE_CHALLENGE_LEN = 43;
export const MAX_PKCE_CHALLENGE_LEN = 128;
export const MIN_TRANSACTION_ID_LEN = 8;
export const MAX_TRANSACTION_ID_LEN = 128;
export const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;

/** SecureStore key — isolated from Google/email providers. */
export const LINKEDIN_TX_STORAGE_KEY = 'nearsy.linkedin.auth.tx.v1' as const;

export type LinkedInAuthStartRequest = {
  platform: LinkedInMobilePlatform;
  pkceChallenge: string;
  pkceMethod: typeof PKCE_METHOD_S256;
};

export type LinkedInAuthStartResponse = {
  transactionId: string;
  authorizationUrl: string;
  expiresAt: number;
};

export type LinkedInAuthExchangeRequest = {
  transactionId: string;
  codeVerifier: string;
};

export type LinkedInAuthExchangeResponse = {
  customToken: string;
};

/** Future A3.4.3 deep-link coordinator input (validated shape only). */
export type LinkedInDeepLinkSuccess = {
  kind: 'success';
  transactionId: string;
  result: 'ok';
};

export type LinkedInDeepLinkProviderError = {
  kind: 'provider_error';
  result: 'error';
  errorCode: string;
  transactionId?: string;
};

export type LinkedInDeepLinkParseResult =
  | LinkedInDeepLinkSuccess
  | LinkedInDeepLinkProviderError;

export type LinkedInStoredTransaction = {
  version: 1;
  transactionId: string;
  codeVerifier: string;
  createdAt: number;
  expiresAt: number;
  mobileReturnUrl: typeof LINKEDIN_MOBILE_RETURN_URL;
  platform: LinkedInMobilePlatform;
};

export function assertPkceChallengeShape(challenge: string): void {
  if (
    typeof challenge !== 'string' ||
    challenge.length < MIN_PKCE_CHALLENGE_LEN ||
    challenge.length > MAX_PKCE_CHALLENGE_LEN ||
    !BASE64URL_RE.test(challenge)
  ) {
    throw new Error('INVALID_PKCE_CHALLENGE');
  }
}

export function assertCodeVerifierShape(verifier: string): void {
  if (
    typeof verifier !== 'string' ||
    verifier.length < MIN_CODE_VERIFIER_LEN ||
    verifier.length > MAX_CODE_VERIFIER_LEN ||
    !BASE64URL_RE.test(verifier)
  ) {
    throw new Error('INVALID_CODE_VERIFIER');
  }
}

export function assertTransactionIdShape(id: string): void {
  if (
    typeof id !== 'string' ||
    id.length < MIN_TRANSACTION_ID_LEN ||
    id.length > MAX_TRANSACTION_ID_LEN ||
    !BASE64URL_RE.test(id)
  ) {
    throw new Error('INVALID_TRANSACTION_ID');
  }
}

export function isHttpsUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function parseLinkedInAuthStartResponse(
  data: unknown,
): LinkedInAuthStartResponse {
  if (!data || typeof data !== 'object') {
    throw new Error('INVALID_START_RESPONSE');
  }
  const d = data as Record<string, unknown>;
  if (typeof d.transactionId !== 'string') {
    throw new Error('INVALID_START_RESPONSE');
  }
  assertTransactionIdShape(d.transactionId);
  if (typeof d.authorizationUrl !== 'string' || !isHttpsUrl(d.authorizationUrl)) {
    throw new Error('INVALID_START_RESPONSE');
  }
  if (typeof d.expiresAt !== 'number' || !Number.isFinite(d.expiresAt)) {
    throw new Error('INVALID_START_RESPONSE');
  }
  return {
    transactionId: d.transactionId,
    authorizationUrl: d.authorizationUrl,
    expiresAt: d.expiresAt,
  };
}

export function parseLinkedInAuthExchangeResponse(
  data: unknown,
): LinkedInAuthExchangeResponse {
  if (!data || typeof data !== 'object') {
    throw new Error('INVALID_EXCHANGE_RESPONSE');
  }
  const d = data as Record<string, unknown>;
  if (typeof d.customToken !== 'string' || d.customToken.length < 1) {
    throw new Error('INVALID_EXCHANGE_RESPONSE');
  }
  return { customToken: d.customToken };
}

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

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type LinkedInAuthErrorCode =
  | 'CONFIG_UNAVAILABLE'
  | 'APP_CHECK_NOT_READY'
  | 'APP_CHECK_REJECTED'
  | 'OPERATION_IN_PROGRESS'
  | 'START_RESPONSE_INVALID'
  | 'TRANSACTION_MISSING'
  | 'TRANSACTION_EXPIRED'
  | 'TRANSACTION_CORRUPT'
  | 'PROVIDER_CALLBACK_ERROR'
  | 'EXCHANGE_RESPONSE_INVALID'
  | 'CORE_DISABLED'
  | 'NETWORK'
  | 'FUNCTIONS_ERROR'
  | 'UNKNOWN';

export class LinkedInAuthError extends Error {
  readonly code: LinkedInAuthErrorCode;
  readonly httpsErrorCode?: string;
  readonly backendCode?: string;

  constructor(
    code: LinkedInAuthErrorCode,
    message: string,
    opts?: { httpsErrorCode?: string; backendCode?: string },
  ) {
    super(message);
    this.name = 'LinkedInAuthError';
    this.code = code;
    this.httpsErrorCode = opts?.httpsErrorCode;
    this.backendCode = opts?.backendCode;
  }
}

type CallableLikeError = {
  code?: unknown;
  message?: unknown;
  details?: unknown;
};

function readHttpsCode(err: unknown): string | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const code = (err as CallableLikeError).code;
  return typeof code === 'string' ? code : undefined;
}

function readDetailsCode(err: unknown): string | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const details = (err as CallableLikeError).details;
  if (details && typeof details === 'object' && 'code' in details) {
    const c = (details as { code?: unknown }).code;
    return typeof c === 'string' ? c : undefined;
  }
  return undefined;
}

export function normalizeLinkedInCallableError(err: unknown): LinkedInAuthError {
  if (err instanceof LinkedInAuthError) return err;

  const httpsCode = readHttpsCode(err);
  const backendCode = readDetailsCode(err);
  const msg =
    err instanceof Error ? err.message : 'LinkedIn authentication failed.';

  if (
    httpsCode === 'functions/unavailable' ||
    httpsCode === 'unavailable' ||
    /LinkedIn auth core is not enabled/i.test(msg) ||
    backendCode === 'CALLBACK_NOT_ENABLED'
  ) {
    return new LinkedInAuthError(
      'CORE_DISABLED',
      'LinkedIn auth core is not enabled.',
      { httpsErrorCode: httpsCode, backendCode },
    );
  }

  if (
    httpsCode === 'functions/unauthenticated' ||
    httpsCode === 'unauthenticated'
  ) {
    return new LinkedInAuthError(
      'APP_CHECK_REJECTED',
      'App Check rejected the request.',
      { httpsErrorCode: httpsCode, backendCode },
    );
  }

  if (
    httpsCode === 'functions/deadline-exceeded' ||
    httpsCode === 'deadline-exceeded' ||
    /network/i.test(msg)
  ) {
    return new LinkedInAuthError('NETWORK', 'Network request failed.', {
      httpsErrorCode: httpsCode,
      backendCode,
    });
  }

  if (backendCode === 'TX_EXPIRED') {
    return new LinkedInAuthError('TRANSACTION_EXPIRED', 'Transaction expired.', {
      httpsErrorCode: httpsCode,
      backendCode: 'TX_EXPIRED',
    });
  }

  if (
    backendCode === 'TX_INVALID' ||
    backendCode === 'TX_FAILED' ||
    backendCode === 'PKCE_INVALID' ||
    backendCode === 'OIDC_INVALID' ||
    backendCode === 'LINKEDIN_ERROR' ||
    httpsCode?.startsWith('functions/') ||
    !!httpsCode
  ) {
    return new LinkedInAuthError('FUNCTIONS_ERROR', 'LinkedIn auth failed.', {
      httpsErrorCode: httpsCode,
      backendCode,
    });
  }

  return new LinkedInAuthError('UNKNOWN', 'LinkedIn authentication failed.', {
    httpsErrorCode: httpsCode,
    backendCode,
  });
}

/** Terminal Exchange failures → clear local transaction. */
export function shouldClearTransactionAfterExchangeError(
  err: LinkedInAuthError,
): boolean {
  return (
    err.code === 'TRANSACTION_EXPIRED' ||
    err.code === 'TRANSACTION_MISSING' ||
    err.code === 'TRANSACTION_CORRUPT' ||
    err.code === 'CORE_DISABLED' ||
    err.code === 'APP_CHECK_REJECTED' ||
    err.code === 'FUNCTIONS_ERROR' ||
    err.code === 'EXCHANGE_RESPONSE_INVALID' ||
    err.code === 'PROVIDER_CALLBACK_ERROR'
  );
}

// ---------------------------------------------------------------------------
// PKCE (RFC 7636 + Functions charset [A-Za-z0-9_-])
// ---------------------------------------------------------------------------

export type PkceCrypto = {
  /** Cryptographically secure random bytes. */
  getRandomBytes: (byteCount: number) => Uint8Array | Promise<Uint8Array>;
  /** SHA-256 digest of UTF-8 string → raw 32 bytes. */
  sha256: (utf8: string) => Uint8Array | Promise<Uint8Array>;
};

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  const b64 =
    typeof globalThis.btoa === 'function'
      ? globalThis.btoa(binary)
      : Buffer.from(bytes).toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export async function generateCodeVerifier(
  crypto: PkceCrypto,
  byteCount = 32,
): Promise<string> {
  const bytes = await Promise.resolve(crypto.getRandomBytes(byteCount));
  const verifier = bytesToBase64Url(bytes);
  assertCodeVerifierShape(verifier);
  return verifier;
}

export async function createS256CodeChallenge(
  crypto: PkceCrypto,
  codeVerifier: string,
): Promise<string> {
  assertCodeVerifierShape(codeVerifier);
  const digest = await Promise.resolve(crypto.sha256(codeVerifier));
  const challenge = bytesToBase64Url(digest);
  assertPkceChallengeShape(challenge);
  return challenge;
}

export async function createPkcePair(crypto: PkceCrypto): Promise<{
  codeVerifier: string;
  codeChallenge: string;
  pkceMethod: typeof PKCE_METHOD_S256;
}> {
  const codeVerifier = await generateCodeVerifier(crypto);
  const codeChallenge = await createS256CodeChallenge(crypto, codeVerifier);
  return { codeVerifier, codeChallenge, pkceMethod: PKCE_METHOD_S256 };
}

// ---------------------------------------------------------------------------
// Transaction store (injectable secure KV)
// ---------------------------------------------------------------------------

export type SecureKv = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  deleteItem: (key: string) => Promise<void>;
};

export type LinkedInTransactionStore = {
  read: () => Promise<LinkedInStoredTransaction | null>;
  write: (tx: LinkedInStoredTransaction) => Promise<void>;
  clear: () => Promise<void>;
};

function parseStoredTransaction(raw: string): LinkedInStoredTransaction {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new LinkedInAuthError(
      'TRANSACTION_CORRUPT',
      'Stored LinkedIn transaction is corrupt.',
    );
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new LinkedInAuthError(
      'TRANSACTION_CORRUPT',
      'Stored LinkedIn transaction is corrupt.',
    );
  }
  const o = parsed as Record<string, unknown>;
  if (o.version !== 1) {
    throw new LinkedInAuthError(
      'TRANSACTION_CORRUPT',
      'Stored LinkedIn transaction is corrupt.',
    );
  }
  if (typeof o.transactionId !== 'string') {
    throw new LinkedInAuthError(
      'TRANSACTION_CORRUPT',
      'Stored LinkedIn transaction is corrupt.',
    );
  }
  try {
    assertTransactionIdShape(o.transactionId);
    if (typeof o.codeVerifier !== 'string') throw new Error('bad');
    assertCodeVerifierShape(o.codeVerifier);
  } catch {
    throw new LinkedInAuthError(
      'TRANSACTION_CORRUPT',
      'Stored LinkedIn transaction is corrupt.',
    );
  }
  if (
    typeof o.createdAt !== 'number' ||
    typeof o.expiresAt !== 'number' ||
    o.mobileReturnUrl !== LINKEDIN_MOBILE_RETURN_URL ||
    o.platform !== 'android'
  ) {
    throw new LinkedInAuthError(
      'TRANSACTION_CORRUPT',
      'Stored LinkedIn transaction is corrupt.',
    );
  }
  return {
    version: 1,
    transactionId: o.transactionId,
    codeVerifier: o.codeVerifier,
    createdAt: o.createdAt,
    expiresAt: o.expiresAt,
    mobileReturnUrl: LINKEDIN_MOBILE_RETURN_URL,
    platform: 'android',
  };
}

export function createLinkedInTransactionStore(
  kv: SecureKv,
  now: () => number = () => Date.now(),
): LinkedInTransactionStore {
  return {
    async read() {
      const raw = await kv.getItem(LINKEDIN_TX_STORAGE_KEY);
      if (raw == null || raw === '') return null;
      const tx = parseStoredTransaction(raw);
      if (tx.expiresAt <= now()) {
        await kv.deleteItem(LINKEDIN_TX_STORAGE_KEY);
        throw new LinkedInAuthError(
          'TRANSACTION_EXPIRED',
          'Transaction expired.',
        );
      }
      return tx;
    },
    async write(tx) {
      await kv.setItem(LINKEDIN_TX_STORAGE_KEY, JSON.stringify(tx));
    },
    async clear() {
      await kv.deleteItem(LINKEDIN_TX_STORAGE_KEY);
    },
  };
}

export function createMemorySecureKv(): SecureKv {
  const map = new Map<string, string>();
  return {
    async getItem(key) {
      return map.has(key) ? map.get(key)! : null;
    },
    async setItem(key, value) {
      map.set(key, value);
    },
    async deleteItem(key) {
      map.delete(key);
    },
  };
}

// ---------------------------------------------------------------------------
// Start / Exchange orchestration
// ---------------------------------------------------------------------------

export type AppCheckGate = {
  ensureReady: () => Promise<void>;
};

export type IdentityCallableInvoker = {
  call: <TReq, TRes>(name: string, data: TReq) => Promise<TRes>;
  /** Exposed for tests — must be us-central1. */
  region: string;
};

export type LinkedInAuthClientDeps = {
  crypto: PkceCrypto;
  store: LinkedInTransactionStore;
  appCheck: AppCheckGate;
  functions: IdentityCallableInvoker;
  now?: () => number;
};

/** In-process + durable gate (cold start relies on SecureStore single slot). */
let startInFlight = false;
let exchangeInFlight = false;

/** Test-only */
export function __resetLinkedInAuthClientLocksForTests(): void {
  startInFlight = false;
  exchangeInFlight = false;
}

export type LinkedInAuthStartResult = {
  transactionId: string;
  authorizationUrl: string;
  expiresAt: number;
  mobileReturnUrl: typeof LINKEDIN_MOBILE_RETURN_URL;
};

export async function linkedInAuthStart(
  deps: LinkedInAuthClientDeps,
): Promise<LinkedInAuthStartResult> {
  if (startInFlight || exchangeInFlight) {
    throw new LinkedInAuthError(
      'OPERATION_IN_PROGRESS',
      'A LinkedIn auth operation is already in progress.',
    );
  }
  startInFlight = true;
  try {
    await deps.appCheck.ensureReady();

    // Reject if a non-expired transaction already exists (no silent replace).
    try {
      const existing = await deps.store.read();
      if (existing) {
        throw new LinkedInAuthError(
          'OPERATION_IN_PROGRESS',
          'A LinkedIn auth transaction is already active.',
        );
      }
    } catch (err) {
      if (err instanceof LinkedInAuthError && err.code === 'TRANSACTION_EXPIRED') {
        // cleared by read — continue
      } else if (
        err instanceof LinkedInAuthError &&
        err.code === 'OPERATION_IN_PROGRESS'
      ) {
        throw err;
      } else if (
        err instanceof LinkedInAuthError &&
        err.code === 'TRANSACTION_CORRUPT'
      ) {
        await deps.store.clear();
      } else {
        throw err;
      }
    }

    const now = (deps.now ?? Date.now)();
    const pkce = await createPkcePair(deps.crypto);
    const request: LinkedInAuthStartRequest = {
      platform: 'android',
      pkceChallenge: pkce.codeChallenge,
      pkceMethod: PKCE_METHOD_S256,
    };

    let response: LinkedInAuthStartResponse;
    try {
      const raw = await deps.functions.call<
        LinkedInAuthStartRequest,
        unknown
      >(LINKEDIN_AUTH_START_CALLABLE, request);
      try {
        response = parseLinkedInAuthStartResponse(raw);
      } catch {
        throw new LinkedInAuthError(
          'START_RESPONSE_INVALID',
          'Start response was invalid.',
        );
      }
    } catch (err) {
      // Start failed before persistence of server tx id — nothing durable yet.
      // (Verifier never written until success.)
      throw err instanceof LinkedInAuthError
        ? err
        : normalizeLinkedInCallableError(err);
    }

    const stored: LinkedInStoredTransaction = {
      version: 1,
      transactionId: response.transactionId,
      codeVerifier: pkce.codeVerifier,
      createdAt: now,
      expiresAt: response.expiresAt,
      mobileReturnUrl: LINKEDIN_MOBILE_RETURN_URL,
      platform: 'android',
    };
    await deps.store.write(stored);

    return {
      transactionId: response.transactionId,
      authorizationUrl: response.authorizationUrl,
      expiresAt: response.expiresAt,
      mobileReturnUrl: LINKEDIN_MOBILE_RETURN_URL,
    };
  } finally {
    startInFlight = false;
  }
}

/**
 * Exchange after a validated deep-link success (A3.4.3 will supply this).
 * customToken is returned in memory only — never persisted by this module.
 */
export async function linkedInAuthExchange(
  deps: LinkedInAuthClientDeps,
  input: { transactionId: string },
): Promise<{ customToken: string }> {
  if (startInFlight || exchangeInFlight) {
    throw new LinkedInAuthError(
      'OPERATION_IN_PROGRESS',
      'A LinkedIn auth operation is already in progress.',
    );
  }
  exchangeInFlight = true;
  try {
    await deps.appCheck.ensureReady();

    let stored: LinkedInStoredTransaction;
    try {
      const tx = await deps.store.read();
      if (!tx) {
        throw new LinkedInAuthError(
          'TRANSACTION_MISSING',
          'No LinkedIn auth transaction is available.',
        );
      }
      stored = tx;
    } catch (err) {
      if (err instanceof LinkedInAuthError) throw err;
      throw new LinkedInAuthError(
        'TRANSACTION_CORRUPT',
        'Stored LinkedIn transaction is corrupt.',
      );
    }

    if (stored.transactionId !== input.transactionId) {
      throw new LinkedInAuthError(
        'TRANSACTION_MISSING',
        'No LinkedIn auth transaction is available.',
      );
    }

    const request: LinkedInAuthExchangeRequest = {
      transactionId: stored.transactionId,
      codeVerifier: stored.codeVerifier,
    };

    let customToken: string;
    try {
      const raw = await deps.functions.call<
        LinkedInAuthExchangeRequest,
        unknown
      >(LINKEDIN_AUTH_EXCHANGE_CALLABLE, request);
      try {
        customToken = parseLinkedInAuthExchangeResponse(raw).customToken;
      } catch {
        throw new LinkedInAuthError(
          'EXCHANGE_RESPONSE_INVALID',
          'Exchange response was invalid.',
        );
      }
    } catch (err) {
      const normalized =
        err instanceof LinkedInAuthError
          ? err
          : normalizeLinkedInCallableError(err);
      if (shouldClearTransactionAfterExchangeError(normalized)) {
        await deps.store.clear();
      }
      throw normalized;
    }

    await deps.store.clear();
    return { customToken };
  } finally {
    exchangeInFlight = false;
  }
}

/**
 * Clears durable state after cancel / abandon (browser cancel, user abort).
 */
export async function clearLinkedInAuthTransaction(
  store: LinkedInTransactionStore,
): Promise<void> {
  await store.clear();
}

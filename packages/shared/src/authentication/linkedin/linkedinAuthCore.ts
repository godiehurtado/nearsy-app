/**
 * LinkedIn A3 client core — confidential OAuth + client possession proof,
 * secure transaction, Start/Exchange.
 *
 * Pure / injectable: Node unit tests import this file with `.ts` suffix.
 * Android wiring lives in linkedinAuth.android.ts (lazy native deps).
 *
 * Protocol: LinkedIn confidential `/oauth/v2/*` with server `client_secret`.
 * Nearsy does **not** use LinkedIn native PKCE (`/oauth/native-pkce/*`).
 * Device↔backend binding is a separate S256 client possession proof.
 */

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

export type LinkedInMobilePlatform = 'android';

export const LINKEDIN_AUTH_START_CALLABLE = 'linkedinAuthStart' as const;
export const LINKEDIN_AUTH_EXCHANGE_CALLABLE = 'linkedinAuthExchange' as const;
export const LINKEDIN_MOBILE_RETURN_URL = 'nearsy://linkedin-auth' as const;
export const LINKEDIN_TRANSACTION_TTL_MS = 10 * 60 * 1000;
export const CLIENT_PROOF_METHOD_S256 = 'S256' as const;

export const MIN_CLIENT_PROOF_VERIFIER_LEN = 43;
export const MAX_CLIENT_PROOF_VERIFIER_LEN = 128;
export const MIN_CLIENT_PROOF_CHALLENGE_LEN = 43;
export const MAX_CLIENT_PROOF_CHALLENGE_LEN = 128;
export const MIN_TRANSACTION_ID_LEN = 8;
export const MAX_TRANSACTION_ID_LEN = 128;
export const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;

/** SecureStore keys — isolated from Google/email providers. */
/** Legacy A3.4.x key — purged by delete only; never read or migrated. */
export const LINKEDIN_TX_STORAGE_KEY_V1 = 'nearsy.linkedin.auth.tx.v1' as const;
/** Current schema key (version: 2 payload). */
export const LINKEDIN_TX_STORAGE_KEY = 'nearsy.linkedin.auth.tx.v2' as const;

export type LinkedInAuthStartRequest = {
  platform: LinkedInMobilePlatform;
  clientProofChallenge: string;
  clientProofMethod: typeof CLIENT_PROOF_METHOD_S256;
};

export type LinkedInAuthStartResponse = {
  transactionId: string;
  authorizationUrl: string;
  expiresAt: number;
};

export type LinkedInAuthExchangeRequest = {
  transactionId: string;
  clientProofVerifier: string;
};

export type LinkedInAuthExchangeResponse = {
  customToken: string;
};

/**
 * Validated deep-link shapes (A3.4.3 parser produces these).
 * See linkedinDeepLinkParser.ts — derived from Functions redirectForTx /
 * redirectUnknown @ f1a90b6, not from docs alone.
 */
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
  | LinkedInDeepLinkProviderError
  | { kind: 'unrelated' }
  | { kind: 'invalid'; reason: string };

export type LinkedInStoredTransaction = {
  version: 2;
  transactionId: string;
  clientProofVerifier: string;
  createdAt: number;
  expiresAt: number;
  mobileReturnUrl: typeof LINKEDIN_MOBILE_RETURN_URL;
  platform: LinkedInMobilePlatform;
};

export function assertClientProofChallengeShape(challenge: string): void {
  if (
    typeof challenge !== 'string' ||
    challenge.length < MIN_CLIENT_PROOF_CHALLENGE_LEN ||
    challenge.length > MAX_CLIENT_PROOF_CHALLENGE_LEN ||
    !BASE64URL_RE.test(challenge)
  ) {
    throw new Error('INVALID_CLIENT_PROOF_CHALLENGE');
  }
}

export function assertClientProofVerifierShape(verifier: string): void {
  if (
    typeof verifier !== 'string' ||
    verifier.length < MIN_CLIENT_PROOF_VERIFIER_LEN ||
    verifier.length > MAX_CLIENT_PROOF_VERIFIER_LEN ||
    !BASE64URL_RE.test(verifier)
  ) {
    throw new Error('INVALID_CLIENT_PROOF_VERIFIER');
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
  | 'SECURE_STORE_FAILED'
  | 'PROVIDER_CALLBACK_ERROR'
  | 'EXCHANGE_RESPONSE_INVALID'
  | 'CORE_DISABLED'
  | 'NETWORK'
  | 'FUNCTIONS_ERROR'
  | 'BROWSER_UNAVAILABLE'
  | 'BROWSER_CANCELLED'
  | 'BROWSER_DISMISSED'
  | 'BROWSER_FAILED'
  | 'CALLBACK_INVALID'
  | 'CALLBACK_MISMATCH'
  | 'CALLBACK_DUPLICATE'
  | 'CUSTOM_TOKEN_INVALID'
  | 'CUSTOM_TOKEN_MISMATCH'
  | 'FIREBASE_USER_DISABLED'
  | 'FIREBASE_OPERATION_NOT_ALLOWED'
  | 'FIREBASE_TOO_MANY_REQUESTS'
  | 'FIREBASE_NETWORK'
  | 'FIREBASE_UNKNOWN'
  | 'FIREBASE_UNCERTAIN_PENDING'
  | 'FIREBASE_AUTH_NOT_READY'
  | 'SESSION_ALREADY_ACTIVE'
  | 'SESSION_CHANGED_DURING_FLOW'
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
    backendCode === 'CLIENT_PROOF_INVALID' ||
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

/**
 * Browser / deep-link terminal outcomes → clear local transaction.
 * NETWORK / UNKNOWN from Exchange keep A3.4.2 policy (no auto-retry here).
 */
export function shouldClearTransactionAfterFlowError(
  err: LinkedInAuthError,
): boolean {
  if (shouldClearTransactionAfterExchangeError(err)) return true;
  return (
    err.code === 'BROWSER_UNAVAILABLE' ||
    err.code === 'BROWSER_CANCELLED' ||
    err.code === 'BROWSER_DISMISSED' ||
    err.code === 'BROWSER_FAILED' ||
    err.code === 'CALLBACK_INVALID' ||
    err.code === 'CALLBACK_MISMATCH' ||
    err.code === 'CALLBACK_DUPLICATE'
  );
}

// ---------------------------------------------------------------------------
// Client possession proof (S256; charset aligned with Functions [A-Za-z0-9_-])
// ---------------------------------------------------------------------------

export type ClientProofCrypto = {
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

export async function generateClientProofVerifier(
  crypto: ClientProofCrypto,
  byteCount = 32,
): Promise<string> {
  const bytes = await Promise.resolve(crypto.getRandomBytes(byteCount));
  const verifier = bytesToBase64Url(bytes);
  assertClientProofVerifierShape(verifier);
  return verifier;
}

export async function createS256ClientProofChallenge(
  crypto: ClientProofCrypto,
  clientProofVerifier: string,
): Promise<string> {
  assertClientProofVerifierShape(clientProofVerifier);
  const digest = await Promise.resolve(crypto.sha256(clientProofVerifier));
  const challenge = bytesToBase64Url(digest);
  assertClientProofChallengeShape(challenge);
  return challenge;
}

export async function createClientProofPair(crypto: ClientProofCrypto): Promise<{
  clientProofVerifier: string;
  clientProofChallenge: string;
  clientProofMethod: typeof CLIENT_PROOF_METHOD_S256;
}> {
  const clientProofVerifier = await generateClientProofVerifier(crypto);
  const clientProofChallenge = await createS256ClientProofChallenge(crypto, clientProofVerifier);
  return { clientProofVerifier, clientProofChallenge, clientProofMethod: CLIENT_PROOF_METHOD_S256 };
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
  /**
   * Physically delete legacy SecureStore key v1 (idempotent).
   * Must never read or copy v1 contents into v2.
   */
  purgeLegacyV1: () => Promise<void>;
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
  if (o.version !== 2) {
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
    if (typeof o.clientProofVerifier !== 'string') throw new Error('bad');
    assertClientProofVerifierShape(o.clientProofVerifier);
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
    version: 2,
    transactionId: o.transactionId,
    clientProofVerifier: o.clientProofVerifier,
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
    async purgeLegacyV1() {
      await kv.deleteItem(LINKEDIN_TX_STORAGE_KEY_V1);
    },
  };
}

/**
 * Idempotent physical purge of SecureStore key v1 before Start/Exchange.
 * Never reads v1. On failure: controlled SECURE_STORE_FAILED (retry later).
 * Does not clear a valid v2 transaction as compensation.
 */
export async function purgeLegacyLinkedInTxStorageV1(
  store: LinkedInTransactionStore,
): Promise<void> {
  try {
    await store.purgeLegacyV1();
  } catch {
    throw new LinkedInAuthError(
      'SECURE_STORE_FAILED',
      'Unable to clear legacy LinkedIn auth storage.',
    );
  }
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
  crypto: ClientProofCrypto;
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
    await purgeLegacyLinkedInTxStorageV1(deps.store);
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
    const proof = await createClientProofPair(deps.crypto);
    const request: LinkedInAuthStartRequest = {
      platform: 'android',
      clientProofChallenge: proof.clientProofChallenge,
      clientProofMethod: CLIENT_PROOF_METHOD_S256,
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
      version: 2,
      transactionId: response.transactionId,
      clientProofVerifier: proof.clientProofVerifier,
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
    await purgeLegacyLinkedInTxStorageV1(deps.store);
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
      clientProofVerifier: stored.clientProofVerifier,
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

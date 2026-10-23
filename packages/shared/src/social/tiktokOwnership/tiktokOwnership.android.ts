/**
 * Android TikTok ownership wiring (NEARSY-209 pilot).
 * Per-mode ownership — Personal and Professional connect independently.
 * Independent of login — does not mutate Firebase Auth session or link providers.
 * Requires Firebase Auth + App Check on every callable.
 * No publication-toggle callables — connect/unlink are per mode.
 */
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { firebaseAuth } from '../../config/firebaseConfig.android';
import {
  ensureAppCheckInitialized,
  getAppCheckInitStatus,
} from '../../config/appCheckBootstrap';
import {
  getIdentityFunctions,
  getIdentityFunctionsRegion,
} from '../../config/identityFunctions';
import type { ProfileMode } from '../../profile/profileModeFields.ts';
import {
  TIKTOK_OWNERSHIP_MOBILE_PLATFORM_ANDROID,
  TIKTOK_OWNERSHIP_RETURN_URL,
  TIKTOK_TX_STORAGE_KEY,
  type TiktokOwnershipGetResponse,
  type TiktokOwnershipUnlinkResponse,
  type TiktokStoredTransaction,
} from './tiktokOwnershipContract.ts';
import {
  TiktokOwnershipError,
  assertTiktokOwnershipMode,
  mapCallableError,
  parseStoredTransaction,
  serializeStoredTransaction,
  tiktokOwnershipExchange,
  tiktokOwnershipGet,
  tiktokOwnershipStart,
  tiktokOwnershipUnlink,
  type TiktokConnectOutcome,
  type TiktokOwnershipFunctionsPort,
} from './tiktokOwnershipCore.ts';

export type { TiktokConnectOutcome };
import { parseTiktokOwnershipReturnUrl } from './tiktokOwnershipDeepLink.ts';
import {
  createExpoTiktokOwnershipBrowser,
  type TiktokOwnershipBrowser,
} from './tiktokOwnershipBrowser.ts';
import type { ClientProofCrypto } from './tiktokOwnershipProof.ts';

export {
  TiktokOwnershipError,
  tiktokOwnershipErrorToI18nKey,
} from './tiktokOwnershipCore.ts';
export { parseTiktokOwnershipReturnUrl } from './tiktokOwnershipDeepLink.ts';
export {
  TIKTOK_OWNERSHIP_PLATFORM,
  TIKTOK_OWNERSHIP_RETURN_URL,
} from './tiktokOwnershipContract.ts';
export type {
  TiktokOwnershipGetResponse,
  TiktokOwnershipVerified,
} from './tiktokOwnershipContract.ts';

function createExpoClientProofCrypto(): ClientProofCrypto {
  return {
    async getRandomBytes(byteCount) {
      return Crypto.getRandomBytesAsync(byteCount);
    },
    async sha256(utf8) {
      const hex = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        utf8,
        { encoding: Crypto.CryptoEncoding.HEX },
      );
      const out = new Uint8Array(hex.length / 2);
      for (let i = 0; i < out.length; i += 1) {
        out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
      }
      return out;
    },
  };
}

const secureStoreOptions = {
  keychainService: 'nearsy.tiktok.ownership',
} as const;

async function writeStoredTx(tx: TiktokStoredTransaction): Promise<void> {
  await SecureStore.setItemAsync(
    TIKTOK_TX_STORAGE_KEY,
    serializeStoredTransaction(tx),
    secureStoreOptions,
  );
}

async function readStoredTx(): Promise<TiktokStoredTransaction | null> {
  const raw = await SecureStore.getItemAsync(
    TIKTOK_TX_STORAGE_KEY,
    secureStoreOptions,
  );
  if (!raw) return null;
  return parseStoredTransaction(raw);
}

async function clearStoredTx(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(
      TIKTOK_TX_STORAGE_KEY,
      secureStoreOptions,
    );
  } catch {
    // best-effort
  }
}

async function ensureAppCheckReady(): Promise<void> {
  const status = await ensureAppCheckInitialized();
  if (status.status === 'ready') return;
  if (status.status === 'error') {
    throw new TiktokOwnershipError(
      'APP_CHECK_NOT_READY',
      'App Check initialization failed.',
    );
  }
  const latest = getAppCheckInitStatus();
  if (latest.status !== 'ready') {
    throw new TiktokOwnershipError(
      'APP_CHECK_NOT_READY',
      'App Check is not ready.',
    );
  }
}

function createFunctionsPort(): TiktokOwnershipFunctionsPort {
  const functions = getIdentityFunctions();
  return {
    region: getIdentityFunctionsRegion(),
    async call(name, data) {
      const callable = functions.httpsCallable(name);
      try {
        const result = await callable(data ?? {});
        return result.data;
      } catch (err) {
        throw mapCallableError(err);
      }
    },
  };
}

function requireUid(): string {
  const uid = firebaseAuth.currentUser?.uid;
  if (!uid) {
    throw new TiktokOwnershipError(
      'unauthenticated',
      'Must be signed in.',
      'unauthenticated',
    );
  }
  return uid;
}

function assertSameUid(expected: string): void {
  const current = firebaseAuth.currentUser?.uid ?? null;
  if (current !== expected) {
    throw new TiktokOwnershipError(
      'session_changed',
      'Signed-in user changed during TikTok verification.',
    );
  }
}

/**
 * Start → system browser → Exchange for one editor mode.
 * Publishes verified ownership only for that mode. Does not change Firebase Auth.
 */
export async function connectTiktokOwnership(
  mode: ProfileMode,
  options?: {
    browser?: TiktokOwnershipBrowser;
    functions?: TiktokOwnershipFunctionsPort;
    crypto?: ClientProofCrypto;
  },
): Promise<TiktokConnectOutcome> {
  const scopedMode = assertTiktokOwnershipMode(mode);
  const uid = requireUid();
  await ensureAppCheckReady();
  assertSameUid(uid);

  const functions = options?.functions ?? createFunctionsPort();
  const crypto = options?.crypto ?? createExpoClientProofCrypto();
  const browser =
    options?.browser ?? createExpoTiktokOwnershipBrowser(WebBrowser);

  await clearStoredTx();

  let startResult: Awaited<ReturnType<typeof tiktokOwnershipStart>>;
  try {
    startResult = await tiktokOwnershipStart(functions, crypto, {
      mode: scopedMode,
      platform: TIKTOK_OWNERSHIP_MOBILE_PLATFORM_ANDROID,
    });
  } catch (err) {
    return {
      status: 'failed',
      error:
        err instanceof TiktokOwnershipError
          ? err
          : mapCallableError(err),
    };
  }

  assertSameUid(uid);

  const { start, clientProofVerifier } = startResult;
  if (start.mode !== scopedMode) {
    await clearStoredTx();
    return {
      status: 'failed',
      error: new TiktokOwnershipError(
        'BAD_RESPONSE',
        'Start mode echo mismatch.',
      ),
    };
  }

  await writeStoredTx({
    version: 1,
    transactionId: start.transactionId,
    clientProofVerifier,
    createdAt: Date.now(),
    expiresAt: start.expiresAt,
    uid,
    mode: scopedMode,
  });

  const browserOutcome = await browser.openAuthSession(
    start.authorizationUrl,
    TIKTOK_OWNERSHIP_RETURN_URL,
  );

  if (
    browserOutcome.type === 'cancel' ||
    browserOutcome.type === 'dismiss'
  ) {
    await clearStoredTx();
    return { status: 'cancelled' };
  }
  if (
    browserOutcome.type === 'failed' ||
    browserOutcome.type === 'unavailable'
  ) {
    await clearStoredTx();
    return {
      status: 'failed',
      error: new TiktokOwnershipError(
        'BROWSER_FAILED',
        'Could not complete browser verification.',
      ),
    };
  }

  assertSameUid(uid);

  const parsed = parseTiktokOwnershipReturnUrl(browserOutcome.url);
  if (parsed.kind === 'provider_error') {
    await clearStoredTx();
    return {
      status: 'failed',
      error: new TiktokOwnershipError(
        parsed.errorCode,
        parsed.errorCode,
        parsed.errorCode,
      ),
    };
  }
  if (parsed.kind !== 'success') {
    await clearStoredTx();
    return {
      status: 'failed',
      error: new TiktokOwnershipError(
        'TX_INVALID',
        'Invalid verification return.',
        'TX_INVALID',
      ),
    };
  }

  // Deep-link mode is informative; reject mismatches against the Start mode.
  if (parsed.mode && parsed.mode !== scopedMode) {
    await clearStoredTx();
    return {
      status: 'failed',
      error: new TiktokOwnershipError(
        'TX_INVALID',
        'Return mode does not match Start.',
        'TX_INVALID',
      ),
    };
  }

  const stored = await readStoredTx();
  if (
    !stored ||
    stored.uid !== uid ||
    stored.mode !== scopedMode ||
    stored.transactionId !== parsed.transactionId
  ) {
    await clearStoredTx();
    return {
      status: 'failed',
      error: new TiktokOwnershipError(
        'TX_INVALID',
        'Verification transaction mismatch.',
        'TX_INVALID',
      ),
    };
  }
  if (Date.now() > stored.expiresAt) {
    await clearStoredTx();
    return {
      status: 'failed',
      error: new TiktokOwnershipError(
        'TX_EXPIRED',
        'Verification expired.',
        'TX_EXPIRED',
      ),
    };
  }

  assertSameUid(uid);

  try {
    const exchange = await tiktokOwnershipExchange(
      functions,
      stored.transactionId,
      stored.clientProofVerifier,
    );
    await clearStoredTx();
    assertSameUid(uid);

    if (exchange.mode !== scopedMode) {
      return {
        status: 'failed',
        error: new TiktokOwnershipError(
          'BAD_RESPONSE',
          'Verified mode mismatch.',
        ),
      };
    }
    return { status: 'verified', verified: exchange };
  } catch (err) {
    await clearStoredTx();
    return {
      status: 'failed',
      error:
        err instanceof TiktokOwnershipError
          ? err
          : mapCallableError(err),
    };
  }
}

export async function getTiktokOwnershipState(
  mode: ProfileMode,
  options?: {
    functions?: TiktokOwnershipFunctionsPort;
  },
): Promise<TiktokOwnershipGetResponse> {
  const scopedMode = assertTiktokOwnershipMode(mode);
  requireUid();
  await ensureAppCheckReady();
  const functions = options?.functions ?? createFunctionsPort();
  return tiktokOwnershipGet(functions, scopedMode);
}

export async function unlinkTiktokOwnership(
  mode: ProfileMode,
  options?: {
    functions?: TiktokOwnershipFunctionsPort;
  },
): Promise<TiktokOwnershipUnlinkResponse> {
  const scopedMode = assertTiktokOwnershipMode(mode);
  requireUid();
  await ensureAppCheckReady();
  const functions = options?.functions ?? createFunctionsPort();
  await clearStoredTx();
  return tiktokOwnershipUnlink(functions, scopedMode);
}


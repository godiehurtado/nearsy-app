/**
 * Android X ownership wiring (NEARSY-209 pilot).
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
  X_OWNERSHIP_MOBILE_PLATFORM_ANDROID,
  X_OWNERSHIP_RETURN_URL,
  X_TX_STORAGE_KEY,
  type XOwnershipGetResponse,
  type XOwnershipUnlinkResponse,
  type XStoredTransaction,
} from './xOwnershipContract.ts';
import {
  XOwnershipError,
  assertXOwnershipMode,
  mapCallableError,
  parseStoredTransaction,
  serializeStoredTransaction,
  xOwnershipExchange,
  xOwnershipGet,
  xOwnershipStart,
  xOwnershipUnlink,
  type XConnectOutcome,
  type XOwnershipFunctionsPort,
} from './xOwnershipCore.ts';

export type { XConnectOutcome };
import { parseXOwnershipReturnUrl } from './xOwnershipDeepLink.ts';
import {
  createExpoXOwnershipBrowser,
  type XOwnershipBrowser,
} from './xOwnershipBrowser.ts';
import type { ClientProofCrypto } from './xOwnershipProof.ts';

export {
  XOwnershipError,
  xOwnershipErrorToI18nKey,
} from './xOwnershipCore.ts';
export { parseXOwnershipReturnUrl } from './xOwnershipDeepLink.ts';
export {
  X_OWNERSHIP_PLATFORM,
  X_OWNERSHIP_RETURN_URL,
} from './xOwnershipContract.ts';
export type {
  XOwnershipGetResponse,
  XOwnershipVerified,
} from './xOwnershipContract.ts';

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
  keychainService: 'nearsy.x.ownership',
} as const;

async function writeStoredTx(tx: XStoredTransaction): Promise<void> {
  await SecureStore.setItemAsync(
    X_TX_STORAGE_KEY,
    serializeStoredTransaction(tx),
    secureStoreOptions,
  );
}

async function readStoredTx(): Promise<XStoredTransaction | null> {
  const raw = await SecureStore.getItemAsync(
    X_TX_STORAGE_KEY,
    secureStoreOptions,
  );
  if (!raw) return null;
  return parseStoredTransaction(raw);
}

async function clearStoredTx(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(
      X_TX_STORAGE_KEY,
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
    throw new XOwnershipError(
      'APP_CHECK_NOT_READY',
      'App Check initialization failed.',
    );
  }
  const latest = getAppCheckInitStatus();
  if (latest.status !== 'ready') {
    throw new XOwnershipError(
      'APP_CHECK_NOT_READY',
      'App Check is not ready.',
    );
  }
}

function createFunctionsPort(): XOwnershipFunctionsPort {
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
    throw new XOwnershipError(
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
    throw new XOwnershipError(
      'session_changed',
      'Signed-in user changed during X verification.',
    );
  }
}

/**
 * Start → system browser → Exchange for one editor mode.
 * Publishes verified ownership only for that mode. Does not change Firebase Auth.
 */
export async function connectXOwnership(
  mode: ProfileMode,
  options?: {
    browser?: XOwnershipBrowser;
    functions?: XOwnershipFunctionsPort;
    crypto?: ClientProofCrypto;
  },
): Promise<XConnectOutcome> {
  const scopedMode = assertXOwnershipMode(mode);
  const uid = requireUid();
  await ensureAppCheckReady();
  assertSameUid(uid);

  const functions = options?.functions ?? createFunctionsPort();
  const crypto = options?.crypto ?? createExpoClientProofCrypto();
  const browser =
    options?.browser ?? createExpoXOwnershipBrowser(WebBrowser);

  await clearStoredTx();

  let startResult: Awaited<ReturnType<typeof xOwnershipStart>>;
  try {
    startResult = await xOwnershipStart(functions, crypto, {
      mode: scopedMode,
      platform: X_OWNERSHIP_MOBILE_PLATFORM_ANDROID,
    });
  } catch (err) {
    return {
      status: 'failed',
      error:
        err instanceof XOwnershipError
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
      error: new XOwnershipError(
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
    X_OWNERSHIP_RETURN_URL,
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
      error: new XOwnershipError(
        'BROWSER_FAILED',
        'Could not complete browser verification.',
      ),
    };
  }

  assertSameUid(uid);

  const parsed = parseXOwnershipReturnUrl(browserOutcome.url);
  if (parsed.kind === 'provider_error') {
    await clearStoredTx();
    return {
      status: 'failed',
      error: new XOwnershipError(
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
      error: new XOwnershipError(
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
      error: new XOwnershipError(
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
      error: new XOwnershipError(
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
      error: new XOwnershipError(
        'TX_EXPIRED',
        'Verification expired.',
        'TX_EXPIRED',
      ),
    };
  }

  assertSameUid(uid);

  try {
    const exchange = await xOwnershipExchange(
      functions,
      stored.transactionId,
      stored.clientProofVerifier,
    );
    await clearStoredTx();
    assertSameUid(uid);

    if (exchange.mode !== scopedMode) {
      return {
        status: 'failed',
        error: new XOwnershipError(
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
        err instanceof XOwnershipError
          ? err
          : mapCallableError(err),
    };
  }
}

export async function getXOwnershipState(
  mode: ProfileMode,
  options?: {
    functions?: XOwnershipFunctionsPort;
  },
): Promise<XOwnershipGetResponse> {
  const scopedMode = assertXOwnershipMode(mode);
  requireUid();
  await ensureAppCheckReady();
  const functions = options?.functions ?? createFunctionsPort();
  return xOwnershipGet(functions, scopedMode);
}

export async function unlinkXOwnership(
  mode: ProfileMode,
  options?: {
    functions?: XOwnershipFunctionsPort;
  },
): Promise<XOwnershipUnlinkResponse> {
  const scopedMode = assertXOwnershipMode(mode);
  requireUid();
  await ensureAppCheckReady();
  const functions = options?.functions ?? createFunctionsPort();
  await clearStoredTx();
  return xOwnershipUnlink(functions, scopedMode);
}


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
  type TiktokOwnershipVerified,
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
import { createOwnershipLinkingPort } from '../ownershipOAuth/ownershipOAuthAndroid.ts';
import {
  createOwnershipOAuthCoordinator,
  type OwnershipBrowserSessionResult,
  type OwnershipHandleResult,
} from '../ownershipOAuth/ownershipOAuthCoordinator.ts';

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

const tiktokOAuth = createOwnershipOAuthCoordinator<TiktokOwnershipVerified>({
  parseReturnUrl: parseTiktokOwnershipReturnUrl,
  readStoredTx,
  clearStoredTx,
  currentUid: () => firebaseAuth.currentUser?.uid ?? null,
  exchange: async (tx) => {
    const functions = createFunctionsPort();
    return tiktokOwnershipExchange(
      functions,
      tx.transactionId,
      tx.clientProofVerifier,
    );
  },
});

function tiktokOutcomeFromHandle(
  handled:
    | OwnershipHandleResult<TiktokOwnershipVerified>
    | OwnershipBrowserSessionResult<TiktokOwnershipVerified>,
  scopedMode: ProfileMode,
  forResume: boolean,
): TiktokConnectOutcome | { status: 'ignored' } {
  if (handled.status === 'cancelled') {
    return forResume ? { status: 'ignored' } : { status: 'cancelled' };
  }
  if (handled.status === 'ignored' || handled.status === 'duplicate') {
    return forResume
      ? { status: 'ignored' }
      : {
          status: 'failed',
          error: new TiktokOwnershipError(
            'TX_INVALID',
            'Verification return was already processed.',
            'TX_INVALID',
          ),
        };
  }
  if (handled.status === 'browser_failed') {
    return {
      status: 'failed',
      error: new TiktokOwnershipError(
        'BROWSER_FAILED',
        'Could not complete browser verification.',
      ),
    };
  }
  if (handled.status === 'provider_error') {
    return {
      status: 'failed',
      error: new TiktokOwnershipError(
        handled.errorCode,
        handled.errorCode,
        handled.errorCode,
      ),
    };
  }
  if (handled.status === 'failed') {
    return {
      status: 'failed',
      error: new TiktokOwnershipError(
        handled.code,
        handled.message,
        handled.code,
      ),
    };
  }
  if (handled.result.mode !== scopedMode) {
    return {
      status: 'failed',
      error: new TiktokOwnershipError(
        'BAD_RESPONSE',
        'Verified mode mismatch.',
      ),
    };
  }
  return { status: 'verified', verified: handled.result };
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

  const handled = await tiktokOAuth.completeBrowserSession({
    authorizationUrl: start.authorizationUrl,
    returnUrl: TIKTOK_OWNERSHIP_RETURN_URL,
    expectedUid: uid,
    expectedMode: scopedMode,
    openAuthSession: (authorizationUrl, returnUrl) =>
      browser.openAuthSession(
        authorizationUrl,
        returnUrl as typeof TIKTOK_OWNERSHIP_RETURN_URL,
      ),
    linking: createOwnershipLinkingPort(),
  });
  const outcome = tiktokOutcomeFromHandle(handled, scopedMode, false);
  if (outcome.status === 'ignored') {
    return {
      status: 'failed',
      error: new TiktokOwnershipError(
        'TX_INVALID',
        'Invalid verification return.',
        'TX_INVALID',
      ),
    };
  }
  return outcome;
}

/**
 * Cold-start / process-recreation resume. Never Starts or opens OAuth.
 */
export async function resumeTiktokOwnershipReturn(
  mode: ProfileMode,
): Promise<TiktokConnectOutcome | { status: 'ignored' }> {
  const scopedMode = assertTiktokOwnershipMode(mode);
  if (!firebaseAuth.currentUser?.uid) {
    return { status: 'ignored' };
  }
  await ensureAppCheckReady();
  const handled = await tiktokOAuth.inspectInitialReturn(
    createOwnershipLinkingPort(),
    scopedMode,
  );
  return tiktokOutcomeFromHandle(handled, scopedMode, true);
}

/**
 * Live Linking returns while the card is mounted and Connect is not in flight.
 */
export function watchTiktokOwnershipReturns(
  mode: ProfileMode,
  onOutcome: (
    outcome: Exclude<
      TiktokConnectOutcome | { status: 'ignored' },
      { status: 'ignored' }
    >,
  ) => void,
): { remove: () => void } {
  const scopedMode = assertTiktokOwnershipMode(mode);
  return tiktokOAuth.subscribeReturnUrls(
    createOwnershipLinkingPort(),
    (url) => {
      void (async () => {
        try {
          await ensureAppCheckReady();
          const handled = await tiktokOAuth.handleReturnUrl(url, {
            source: 'linking',
            expectedMode: scopedMode,
          });
          const outcome = tiktokOutcomeFromHandle(handled, scopedMode, true);
          if (outcome.status !== 'ignored') {
            onOutcome(outcome);
          }
        } catch {
          // best-effort; Get reconciliation covers the rest
        }
      })();
    },
  );
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


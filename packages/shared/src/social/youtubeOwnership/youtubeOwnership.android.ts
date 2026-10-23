/**
 * Android YouTube ownership wiring (NEARSY-209 pilot).
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
  YOUTUBE_OWNERSHIP_MOBILE_PLATFORM_ANDROID,
  YOUTUBE_OWNERSHIP_RETURN_URL,
  YOUTUBE_TX_STORAGE_KEY,
  type YoutubeOwnershipChannelCandidate,
  type YoutubeOwnershipExchangeResponse,
  type YoutubeOwnershipGetResponse,
  type YoutubeOwnershipUnlinkResponse,
  type YoutubeOwnershipVerified,
  type YoutubeStoredTransaction,
} from './youtubeOwnershipContract.ts';
import {
  YoutubeOwnershipError,
  assertYoutubeOwnershipMode,
  mapCallableError,
  parseStoredTransaction,
  serializeStoredTransaction,
  youtubeOwnershipExchange,
  youtubeOwnershipGet,
  youtubeOwnershipSelectChannel,
  youtubeOwnershipStart,
  youtubeOwnershipUnlink,
  type YoutubeConnectOutcome,
  type YoutubeOwnershipFunctionsPort,
} from './youtubeOwnershipCore.ts';
import { createOwnershipLinkingPort } from '../ownershipOAuth/ownershipOAuthAndroid.ts';
import {
  createOwnershipOAuthCoordinator,
  type OwnershipBrowserSessionResult,
  type OwnershipHandleResult,
} from '../ownershipOAuth/ownershipOAuthCoordinator.ts';

export type { YoutubeConnectOutcome };
import { parseYoutubeOwnershipReturnUrl } from './youtubeOwnershipDeepLink.ts';
import {
  createExpoYoutubeOwnershipBrowser,
  type YoutubeOwnershipBrowser,
} from './youtubeOwnershipBrowser.ts';
import type { ClientProofCrypto } from './youtubeOwnershipProof.ts';

export {
  YoutubeOwnershipError,
  youtubeOwnershipErrorToI18nKey,
} from './youtubeOwnershipCore.ts';
export { parseYoutubeOwnershipReturnUrl } from './youtubeOwnershipDeepLink.ts';
export {
  YOUTUBE_OWNERSHIP_PLATFORM,
  YOUTUBE_OWNERSHIP_RETURN_URL,
} from './youtubeOwnershipContract.ts';
export type {
  YoutubeOwnershipChannelCandidate,
  YoutubeOwnershipGetResponse,
  YoutubeOwnershipVerified,
} from './youtubeOwnershipContract.ts';

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
  keychainService: 'nearsy.youtube.ownership',
} as const;

async function writeStoredTx(tx: YoutubeStoredTransaction): Promise<void> {
  await SecureStore.setItemAsync(
    YOUTUBE_TX_STORAGE_KEY,
    serializeStoredTransaction(tx),
    secureStoreOptions,
  );
}

async function readStoredTx(): Promise<YoutubeStoredTransaction | null> {
  const raw = await SecureStore.getItemAsync(
    YOUTUBE_TX_STORAGE_KEY,
    secureStoreOptions,
  );
  if (!raw) return null;
  return parseStoredTransaction(raw);
}

async function clearStoredTx(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(
      YOUTUBE_TX_STORAGE_KEY,
      secureStoreOptions,
    );
  } catch {
    // best-effort
  }
}

const youtubeOAuth = createOwnershipOAuthCoordinator<YoutubeOwnershipExchangeResponse>(
  {
    parseReturnUrl: parseYoutubeOwnershipReturnUrl,
    readStoredTx,
    clearStoredTx,
    currentUid: () => firebaseAuth.currentUser?.uid ?? null,
    exchange: async (tx) => {
      const functions = createFunctionsPort();
      return youtubeOwnershipExchange(
        functions,
        tx.transactionId,
        tx.clientProofVerifier,
      );
    },
  },
);

function youtubeOutcomeFromHandle(
  handled:
    | OwnershipHandleResult<YoutubeOwnershipExchangeResponse>
    | OwnershipBrowserSessionResult<YoutubeOwnershipExchangeResponse>,
  scopedMode: ProfileMode,
  forResume: boolean,
): YoutubeConnectOutcome | { status: 'ignored' } {
  if (handled.status === 'cancelled') {
    return forResume ? { status: 'ignored' } : { status: 'cancelled' };
  }
  if (handled.status === 'ignored' || handled.status === 'duplicate') {
    return forResume
      ? { status: 'ignored' }
      : {
          status: 'failed',
          error: new YoutubeOwnershipError(
            'TX_INVALID',
            'Verification return was already processed.',
            'TX_INVALID',
          ),
        };
  }
  if (handled.status === 'browser_failed') {
    return {
      status: 'failed',
      error: new YoutubeOwnershipError(
        'BROWSER_FAILED',
        'Could not complete browser verification.',
      ),
    };
  }
  if (handled.status === 'provider_error') {
    return {
      status: 'failed',
      error: new YoutubeOwnershipError(
        handled.errorCode,
        handled.errorCode,
        handled.errorCode,
      ),
    };
  }
  if (handled.status === 'failed') {
    return {
      status: 'failed',
      error: new YoutubeOwnershipError(
        handled.code,
        handled.message,
        handled.code,
      ),
    };
  }
  const exchange = handled.result;
  if (exchange.result === 'verified') {
    if (exchange.mode !== scopedMode) {
      return {
        status: 'failed',
        error: new YoutubeOwnershipError(
          'BAD_RESPONSE',
          'Verified mode mismatch.',
        ),
      };
    }
    return { status: 'verified', verified: exchange };
  }
  if (exchange.mode !== scopedMode) {
    return {
      status: 'failed',
      error: new YoutubeOwnershipError(
        'BAD_RESPONSE',
        'Select-channel mode mismatch.',
      ),
    };
  }
  return {
    status: 'select_channel',
    transactionId: exchange.transactionId,
    mode: exchange.mode,
    channels: exchange.channels,
  };
}

async function ensureAppCheckReady(): Promise<void> {
  const status = await ensureAppCheckInitialized();
  if (status.status === 'ready') return;
  if (status.status === 'error') {
    throw new YoutubeOwnershipError(
      'APP_CHECK_NOT_READY',
      'App Check initialization failed.',
    );
  }
  const latest = getAppCheckInitStatus();
  if (latest.status !== 'ready') {
    throw new YoutubeOwnershipError(
      'APP_CHECK_NOT_READY',
      'App Check is not ready.',
    );
  }
}

function createFunctionsPort(): YoutubeOwnershipFunctionsPort {
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
    throw new YoutubeOwnershipError(
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
    throw new YoutubeOwnershipError(
      'session_changed',
      'Signed-in user changed during YouTube verification.',
    );
  }
}

/**
 * Start → system browser → Exchange for one editor mode.
 * Publishes verified ownership only for that mode. Does not change Firebase Auth.
 */
export async function connectYoutubeOwnership(
  mode: ProfileMode,
  options?: {
    browser?: YoutubeOwnershipBrowser;
    functions?: YoutubeOwnershipFunctionsPort;
    crypto?: ClientProofCrypto;
  },
): Promise<YoutubeConnectOutcome> {
  const scopedMode = assertYoutubeOwnershipMode(mode);
  const uid = requireUid();
  await ensureAppCheckReady();
  assertSameUid(uid);

  const functions = options?.functions ?? createFunctionsPort();
  const crypto = options?.crypto ?? createExpoClientProofCrypto();
  const browser =
    options?.browser ?? createExpoYoutubeOwnershipBrowser(WebBrowser);

  await clearStoredTx();

  let startResult: Awaited<ReturnType<typeof youtubeOwnershipStart>>;
  try {
    startResult = await youtubeOwnershipStart(functions, crypto, {
      mode: scopedMode,
      platform: YOUTUBE_OWNERSHIP_MOBILE_PLATFORM_ANDROID,
    });
  } catch (err) {
    return {
      status: 'failed',
      error:
        err instanceof YoutubeOwnershipError
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
      error: new YoutubeOwnershipError(
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

  const handled = await youtubeOAuth.completeBrowserSession({
    authorizationUrl: start.authorizationUrl,
    returnUrl: YOUTUBE_OWNERSHIP_RETURN_URL,
    expectedUid: uid,
    expectedMode: scopedMode,
    openAuthSession: (authorizationUrl, returnUrl) =>
      browser.openAuthSession(
        authorizationUrl,
        returnUrl as typeof YOUTUBE_OWNERSHIP_RETURN_URL,
      ),
    linking: createOwnershipLinkingPort(),
  });
  const outcome = youtubeOutcomeFromHandle(handled, scopedMode, false);
  if (outcome.status === 'ignored') {
    return {
      status: 'failed',
      error: new YoutubeOwnershipError(
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
export async function resumeYoutubeOwnershipReturn(
  mode: ProfileMode,
): Promise<YoutubeConnectOutcome | { status: 'ignored' }> {
  const scopedMode = assertYoutubeOwnershipMode(mode);
  if (!firebaseAuth.currentUser?.uid) {
    return { status: 'ignored' };
  }
  await ensureAppCheckReady();
  const handled = await youtubeOAuth.inspectInitialReturn(
    createOwnershipLinkingPort(),
    scopedMode,
  );
  return youtubeOutcomeFromHandle(handled, scopedMode, true);
}

/**
 * Live Linking returns while the card is mounted and Connect is not in flight.
 */
export function watchYoutubeOwnershipReturns(
  mode: ProfileMode,
  onOutcome: (
    outcome: Exclude<
      YoutubeConnectOutcome | { status: 'ignored' },
      { status: 'ignored' }
    >,
  ) => void,
): { remove: () => void } {
  const scopedMode = assertYoutubeOwnershipMode(mode);
  return youtubeOAuth.subscribeReturnUrls(
    createOwnershipLinkingPort(),
    (url) => {
      void (async () => {
        try {
          await ensureAppCheckReady();
          const handled = await youtubeOAuth.handleReturnUrl(url, {
            source: 'linking',
            expectedMode: scopedMode,
          });
          const outcome = youtubeOutcomeFromHandle(
            handled,
            scopedMode,
            true,
          );
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

export async function selectYoutubeOwnershipChannel(
  transactionId: string,
  channelId: string,
  expectedMode: ProfileMode,
  options?: { functions?: YoutubeOwnershipFunctionsPort },
): Promise<YoutubeConnectOutcome> {
  const scopedMode = assertYoutubeOwnershipMode(expectedMode);
  const uid = requireUid();
  await ensureAppCheckReady();
  assertSameUid(uid);
  const functions = options?.functions ?? createFunctionsPort();
  try {
    const verified = await youtubeOwnershipSelectChannel(
      functions,
      transactionId,
      channelId,
    );
    assertSameUid(uid);
    if (verified.mode !== scopedMode) {
      return {
        status: 'failed',
        error: new YoutubeOwnershipError(
          'BAD_RESPONSE',
          'Verified mode mismatch.',
        ),
      };
    }
    return { status: 'verified', verified };
  } catch (err) {
    return {
      status: 'failed',
      error:
        err instanceof YoutubeOwnershipError
          ? err
          : mapCallableError(err),
    };
  }
}

export async function getYoutubeOwnershipState(
  mode: ProfileMode,
  options?: {
    functions?: YoutubeOwnershipFunctionsPort;
  },
): Promise<YoutubeOwnershipGetResponse> {
  const scopedMode = assertYoutubeOwnershipMode(mode);
  requireUid();
  await ensureAppCheckReady();
  const functions = options?.functions ?? createFunctionsPort();
  return youtubeOwnershipGet(functions, scopedMode);
}

export async function unlinkYoutubeOwnership(
  mode: ProfileMode,
  options?: {
    functions?: YoutubeOwnershipFunctionsPort;
  },
): Promise<YoutubeOwnershipUnlinkResponse> {
  const scopedMode = assertYoutubeOwnershipMode(mode);
  requireUid();
  await ensureAppCheckReady();
  const functions = options?.functions ?? createFunctionsPort();
  await clearStoredTx();
  return youtubeOwnershipUnlink(functions, scopedMode);
}


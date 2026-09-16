/**
 * Android wiring for LinkedIn A3 client (A3.4.2–A3.4.4).
 * Lazy-loads native modules so Node tests never import this file.
 */
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { Linking } from 'react-native';
import { firebaseAuth } from '../../config/firebaseConfig.android';
import {
  ensureAppCheckInitialized,
  getAppCheckInitStatus,
} from '../../config/appCheckBootstrap';
import {
  getIdentityFunctions,
  getIdentityFunctionsRegion,
} from '../../config/identityFunctions';
import { createExpoLinkedInAuthBrowser } from './linkedinBrowserSession';
import {
  discardLinkedInAuthTransaction,
  handleLinkedInReturnUrl,
  inspectInitialLinkedInReturn,
  runLinkedInBrowserAuthFlow,
  subscribeLinkedInReturnUrls,
  type LinkedInBrowserFlowResult,
  type LinkedInCoordinatorDeps,
  type LinkedInReturnHandleResult,
  type LinkedInReturnSource,
} from './linkedinAuthCoordinator';
import {
  authenticateWithLinkedInBrowser,
  authenticateWithLinkedInColdStartClaim,
  reconcileLinkedInFirebaseUncertainState,
  type LinkedInSessionDeps,
  type LinkedInSessionResult,
} from './linkedinSession';
import type { LinkedInFirebaseAuthPort } from './linkedinFirebaseAuth';
import {
  clearLinkedInAuthTransaction,
  createLinkedInTransactionStore,
  linkedInAuthExchange,
  linkedInAuthStart,
  LinkedInAuthError,
  type LinkedInAuthClientDeps,
  type LinkedInAuthStartResult,
  type ClientProofCrypto,
  type SecureKv,
} from './linkedinAuthCore';

export * from './linkedinAuthCore';
export {
  parseLinkedInMobileReturnUrl,
  linkedInReturnFingerprint,
} from './linkedinDeepLinkParser';
export {
  mapExpoAuthSessionResult,
  createExpoLinkedInAuthBrowser,
} from './linkedinBrowserSession';
export {
  discardLinkedInAuthTransaction,
  handleLinkedInReturnUrl,
  inspectInitialLinkedInReturn,
  runLinkedInBrowserAuthFlow,
  subscribeLinkedInReturnUrls,
  __resetLinkedInCoordinatorForTests,
} from './linkedinAuthCoordinator';
export {
  mapFirebaseCustomTokenError,
  signInWithLinkedInCustomToken,
  isTerminalFirebaseSignInError,
  isUncertainFirebaseSignInError,
} from './linkedinFirebaseAuth';
export {
  authenticateWithLinkedInBrowser,
  authenticateWithLinkedInColdStartClaim,
  assertLinkedInPendingExchangeClaim,
  reconcileLinkedInFirebaseUncertainState,
  getLinkedInFirebaseUncertainBarrier,
  expectedLinkedInSuccessFingerprint,
  __resetLinkedInSessionForTests,
} from './linkedinSession';

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

function createSecureStoreKv(): SecureKv {
  const options = {
    keychainService: 'nearsy.linkedin.auth',
  } as const;
  return {
    getItem: (key) => SecureStore.getItemAsync(key, options),
    setItem: (key, value) => SecureStore.setItemAsync(key, value, options),
    deleteItem: (key) => SecureStore.deleteItemAsync(key, options),
  };
}

async function ensureAppCheckReady(): Promise<void> {
  const status = await ensureAppCheckInitialized();
  if (status.status === 'ready') return;
  if (status.status === 'error') {
    throw new LinkedInAuthError(
      'APP_CHECK_NOT_READY',
      'App Check initialization failed.',
    );
  }
  const latest = getAppCheckInitStatus();
  if (latest.status !== 'ready') {
    throw new LinkedInAuthError(
      'APP_CHECK_NOT_READY',
      'App Check is not ready.',
    );
  }
}

function createDefaultClientDeps(): LinkedInAuthClientDeps {
  const functions = getIdentityFunctions();
  return {
    crypto: createExpoClientProofCrypto(),
    store: createLinkedInTransactionStore(createSecureStoreKv()),
    appCheck: { ensureReady: ensureAppCheckReady },
    functions: {
      region: getIdentityFunctionsRegion(),
      async call(name, data) {
        const callable = functions.httpsCallable(name);
        try {
          const result = await callable(data);
          return result.data as never;
        } catch (err: unknown) {
          if (__DEV__) {
            const e = err as { code?: unknown; message?: unknown };
            const msg =
              typeof e.message === 'string'
                ? e.message.replace(
                    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
                    '[redacted]',
                  )
                : undefined;
            console.log('[linkedinAuth.android] callable error', {
              name,
              code: typeof e.code === 'string' ? e.code : undefined,
              message: msg,
            });
          }
          throw err;
        }
      },
    },
  };
}

/**
 * Canonical RNFirebase Auth port — same firebaseAuth as Google/email.
 * Readiness mirrors AppNavigator: first onAuthStateChanged ⇒ resolved.
 * Shared singleton so repeated entry points reuse the resolved snapshot.
 */
let sharedFirebaseAuthPort: LinkedInFirebaseAuthPort | null = null;
let sharedAuthReady: Promise<void> | null = null;

function createDefaultFirebaseAuthPort(): LinkedInFirebaseAuthPort {
  if (sharedFirebaseAuthPort) return sharedFirebaseAuthPort;

  type Resolution =
    | { status: 'pending' }
    | { status: 'resolved'; uid: string | null };

  let resolution: Resolution = { status: 'pending' };
  let unsub: (() => void) | null = null;

  sharedAuthReady = new Promise<void>((resolve) => {
    try {
      unsub = firebaseAuth.onAuthStateChanged((user) => {
        resolution = { status: 'resolved', uid: user?.uid ?? null };
        const cleanup = unsub;
        unsub = null;
        if (cleanup) {
          try {
            cleanup();
          } catch {
            // ignore
          }
        }
        resolve();
      });
    } catch {
      // Leave pending; callers still see FIREBASE_AUTH_NOT_READY after wait.
      resolve();
    }
  });

  sharedFirebaseAuthPort = {
    getCurrentUserId: () => firebaseAuth.currentUser?.uid ?? null,
    async signInWithCustomToken(customToken) {
      const cred = await firebaseAuth.signInWithCustomToken(customToken);
      return { uid: cred.user.uid };
    },
    getAuthResolution: () => resolution,
  };
  return sharedFirebaseAuthPort;
}

async function waitForDefaultAuthReady(): Promise<void> {
  createDefaultFirebaseAuthPort();
  if (sharedAuthReady) {
    await sharedAuthReady;
  }
}

function createDefaultCoordinatorDeps(): LinkedInCoordinatorDeps {
  return {
    ...createDefaultClientDeps(),
    browser: createExpoLinkedInAuthBrowser(WebBrowser),
    linking: {
      getInitialURL: () => Linking.getInitialURL(),
      addEventListener: (type, handler) =>
        Linking.addEventListener(type, handler),
    },
  };
}

function createDefaultSessionDeps(): LinkedInSessionDeps {
  return {
    ...createDefaultCoordinatorDeps(),
    firebaseAuth: createDefaultFirebaseAuthPort(),
  };
}

/** Starts LinkedIn auth (callable only). Does not open a browser. */
export async function startLinkedInAuth(
  deps: LinkedInAuthClientDeps = createDefaultClientDeps(),
): Promise<LinkedInAuthStartResult> {
  return linkedInAuthStart(deps);
}

/**
 * Exchanges a validated return for an in-memory customToken.
 * Internal/test surface — prefer authenticateWithLinkedIn* session APIs.
 */
export async function exchangeLinkedInAuth(
  transactionId: string,
  deps: LinkedInAuthClientDeps = createDefaultClientDeps(),
): Promise<{ customToken: string }> {
  return linkedInAuthExchange(deps, { transactionId });
}

export async function cancelLinkedInAuth(
  deps: LinkedInAuthClientDeps = createDefaultClientDeps(),
): Promise<void> {
  await clearLinkedInAuthTransaction(deps.store);
}

/**
 * Start → auth session → parse → Exchange (customToken in memory only).
 * Prefer authenticateWithLinkedInBrowser for session completion.
 */
export async function runLinkedInAuthWithBrowser(
  deps: LinkedInCoordinatorDeps = createDefaultCoordinatorDeps(),
): Promise<LinkedInBrowserFlowResult> {
  return runLinkedInBrowserAuthFlow(deps);
}

/** Explicit cold-start handoff (no auto Exchange / no App.tsx wiring). */
export async function inspectLinkedInInitialReturn(
  deps: LinkedInCoordinatorDeps = createDefaultCoordinatorDeps(),
): Promise<LinkedInReturnHandleResult> {
  return inspectInitialLinkedInReturn(deps);
}

export async function processLinkedInReturnUrl(
  url: string,
  options: { exchange?: boolean; source?: LinkedInReturnSource } = {},
  deps: LinkedInAuthClientDeps = createDefaultClientDeps(),
): Promise<LinkedInReturnHandleResult> {
  return handleLinkedInReturnUrl(deps, url, {
    exchange: options.exchange !== false,
    source: options.source ?? 'explicit',
  });
}

/**
 * Complete LinkedIn browser flow into a Firebase Auth session.
 * Never returns customToken.
 */
export async function signInWithLinkedInBrowser(
  deps?: LinkedInSessionDeps,
): Promise<LinkedInSessionResult> {
  if (!deps) {
    await waitForDefaultAuthReady();
  }
  return authenticateWithLinkedInBrowser(deps ?? createDefaultSessionDeps());
}

/**
 * Consume A3.4.3 pending_exchange claim into a Firebase Auth session.
 * Explicit bootstrap API — not auto-invoked from App.tsx.
 */
export async function signInWithLinkedInColdStartClaim(
  claim: unknown,
  deps?: LinkedInSessionDeps,
): Promise<LinkedInSessionResult> {
  if (!deps) {
    await waitForDefaultAuthReady();
  }
  return authenticateWithLinkedInColdStartClaim(
    deps ?? createDefaultSessionDeps(),
    claim,
  );
}

/**
 * After uncertain Firebase sign-in: consult auth.currentUser and clear barrier.
 * Does not restore or retry customToken.
 */
export function reconcileLinkedInSession(
  deps: LinkedInSessionDeps = createDefaultSessionDeps(),
) {
  return reconcileLinkedInFirebaseUncertainState(deps.firebaseAuth);
}

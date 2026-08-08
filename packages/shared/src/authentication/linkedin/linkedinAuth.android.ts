/**
 * Android wiring for LinkedIn A3 client (A3.4.2 + A3.4.3).
 * Lazy-loads native modules so Node tests never import this file.
 */
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { Linking } from 'react-native';
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
  clearLinkedInAuthTransaction,
  createLinkedInTransactionStore,
  linkedInAuthExchange,
  linkedInAuthStart,
  LinkedInAuthError,
  type LinkedInAuthClientDeps,
  type LinkedInAuthStartResult,
  type PkceCrypto,
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

function createExpoPkceCrypto(): PkceCrypto {
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
  if (status.status === 'skipped') {
    throw new LinkedInAuthError(
      'APP_CHECK_NOT_READY',
      'App Check is not available for this build/environment.',
    );
  }
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
    crypto: createExpoPkceCrypto(),
    store: createLinkedInTransactionStore(createSecureStoreKv()),
    appCheck: { ensureReady: ensureAppCheckReady },
    functions: {
      region: getIdentityFunctionsRegion(),
      async call(name, data) {
        const callable = functions.httpsCallable(name);
        const result = await callable(data);
        return result.data as never;
      },
    },
  };
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

/** Starts LinkedIn auth (callable only). Does not open a browser. */
export async function startLinkedInAuth(
  deps: LinkedInAuthClientDeps = createDefaultClientDeps(),
): Promise<LinkedInAuthStartResult> {
  return linkedInAuthStart(deps);
}

/** Exchanges a validated return for an in-memory customToken. No signIn. */
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
 * Start → auth session → parse → Exchange.
 * Returns customToken in memory only. Does not sign in.
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

export { discardLinkedInAuthTransaction, subscribeLinkedInReturnUrls };

/**
 * Android wiring for LinkedIn A3 client core (A3.4.2).
 * Lazy-loads native modules so Node tests never import this file.
 */
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import {
  ensureAppCheckInitialized,
  getAppCheckInitStatus,
} from '../../config/appCheckBootstrap';
import {
  getIdentityFunctions,
  getIdentityFunctionsRegion,
} from '../../config/identityFunctions';
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
    // Isolate LinkedIn material from other SecureStore entries.
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
  // pending/idle after await should not happen; treat as not ready
  const latest = getAppCheckInitStatus();
  if (latest.status !== 'ready') {
    throw new LinkedInAuthError(
      'APP_CHECK_NOT_READY',
      'App Check is not ready.',
    );
  }
}

function createDefaultDeps(): LinkedInAuthClientDeps {
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

/**
 * Starts LinkedIn auth (callable only). Does not open a browser.
 */
export async function startLinkedInAuth(
  deps: LinkedInAuthClientDeps = createDefaultDeps(),
): Promise<LinkedInAuthStartResult> {
  return linkedInAuthStart(deps);
}

/**
 * Exchanges a validated deep-link success for an in-memory customToken.
 * Does not call signInWithCustomToken.
 */
export async function exchangeLinkedInAuth(
  transactionId: string,
  deps: LinkedInAuthClientDeps = createDefaultDeps(),
): Promise<{ customToken: string }> {
  return linkedInAuthExchange(deps, { transactionId });
}

export async function cancelLinkedInAuth(
  deps: LinkedInAuthClientDeps = createDefaultDeps(),
): Promise<void> {
  await clearLinkedInAuthTransaction(deps.store);
}

/**
 * iOS durable adapter. Persists one active LinkedIn A3 transaction in SecureStore
 * only when the native module is present in the binary.
 *
 * The current Development IPA does not include expo-secure-store. Never evaluate
 * `import('expo-secure-store')` unless ExpoSecureStore is already registered —
 * that import calls requireNativeModule and would throw otherwise.
 * Fail-soft to process memory. Do not use AsyncStorage.
 */

import {
  createInMemoryLinkedInA3DurableStore,
  LINKEDIN_A3_DURABLE_STORE_KEY,
  parseLinkedInA3DurableRecordJson,
  serializeLinkedInA3DurableRecord,
  type LinkedInA3DurableRecord,
  type LinkedInA3DurableStore,
} from './durableTransactionStore';

type ExpoSecureStoreLike = {
  setItemAsync: (key: string, value: string, options?: object) => Promise<void>;
  getItemAsync: (key: string) => Promise<string | null>;
  deleteItemAsync: (key: string) => Promise<void>;
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY?: unknown;
};

type ExpoModulesCoreLike = {
  requireOptionalNativeModule?: (name: string) => unknown;
};

let nativeAvailability: Promise<boolean> | null = null;
let loggedAvailability = false;

async function isExpoSecureStoreNativeAvailable(): Promise<boolean> {
  if (!nativeAvailability) {
    nativeAvailability = (async () => {
      try {
        const core = (await import('expo-modules-core')) as ExpoModulesCoreLike;
        if (typeof core.requireOptionalNativeModule !== 'function') {
          return false;
        }
        return core.requireOptionalNativeModule('ExpoSecureStore') != null;
      } catch {
        return false;
      }
    })();
  }
  return nativeAvailability;
}

function logDurableBackend(nativeSecureStore: boolean): void {
  if (loggedAvailability) return;
  loggedAvailability = true;
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.log('[linkedinA3.durable]', { nativeSecureStore });
  }
}

async function loadSecureStoreModule(): Promise<ExpoSecureStoreLike | null> {
  const available = await isExpoSecureStoreNativeAvailable();
  logDurableBackend(available);
  if (!available) return null;

  try {
    const mod = (await import('expo-secure-store')) as ExpoSecureStoreLike;
    if (typeof mod?.setItemAsync !== 'function') return null;
    return mod;
  } catch {
    logDurableBackend(false);
    return null;
  }
}

export function createLinkedInA3DurableStore(): LinkedInA3DurableStore {
  const memory = createInMemoryLinkedInA3DurableStore();
  let nativePromise: Promise<ExpoSecureStoreLike | null> | null = null;

  function native(): Promise<ExpoSecureStoreLike | null> {
    nativePromise ??= loadSecureStoreModule();
    return nativePromise;
  }

  function writeOptions(store: ExpoSecureStoreLike): object | undefined {
    if (store.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY == null) return undefined;
    return {
      keychainAccessible: store.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    };
  }

  return {
    async save(record: LinkedInA3DurableRecord) {
      const payload = serializeLinkedInA3DurableRecord(record);
      const store = await native();
      if (!store) {
        await memory.save(record);
        return;
      }
      try {
        await store.setItemAsync(
          LINKEDIN_A3_DURABLE_STORE_KEY,
          payload,
          writeOptions(store),
        );
        await memory.clear();
      } catch {
        await memory.save(record);
      }
    },
    async load() {
      const store = await native();
      if (!store) return memory.load();
      try {
        const raw = await store.getItemAsync(LINKEDIN_A3_DURABLE_STORE_KEY);
        const parsed = parseLinkedInA3DurableRecordJson(raw);
        if (!parsed) {
          if (raw) await store.deleteItemAsync(LINKEDIN_A3_DURABLE_STORE_KEY);
          return memory.load();
        }
        return parsed;
      } catch {
        return memory.load();
      }
    },
    async clear() {
      await memory.clear();
      const store = await native();
      if (!store) return;
      try {
        await store.deleteItemAsync(LINKEDIN_A3_DURABLE_STORE_KEY);
      } catch {
        // Fail-soft.
      }
    },
  };
}

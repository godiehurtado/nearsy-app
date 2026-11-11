/**
 * SecureStore-backed pending reevaluate flag. Never stores address-book rows.
 */

// Explicit .ts: on iOS, Metro resolves './reevaluatePendingStore' to this file,
// so an extensionless import here would import itself.
import type { ReevaluatePendingStore } from './reevaluatePendingStore.ts';
import {
  createMemoryReevaluatePendingStore,
  registerReevaluatePendingStore,
} from './reevaluatePendingStore.ts';

// Shared modules import './reevaluatePendingStore' without an extension and get
// this file on iOS: it must expose the same API.
export {
  createMemoryReevaluatePendingStore,
  getReevaluatePendingStore,
  registerReevaluatePendingStore,
  type ReevaluatePendingStore,
} from './reevaluatePendingStore.ts';

/** Single slot from before per-UID markers. Still honored for its own UID. */
const LEGACY_KEY = 'nearsy.alerts.v1.reevaluatePendingUid';

function keyForUid(uid: string): string {
  const encoded = uid.replace(
    /[^A-Za-z0-9]/g,
    (ch) => `_${ch.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
  return `nearsy.alerts.v1.reevaluatePending.uid.${encoded}`;
}

type ExpoSecureStoreLike = {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
};

async function loadSecureStore(): Promise<ExpoSecureStoreLike | null> {
  try {
    return (await import('expo-secure-store')) as ExpoSecureStoreLike;
  } catch {
    return null;
  }
}

export function createSecureReevaluatePendingStore(
  getStore: () => Promise<ExpoSecureStoreLike | null> = loadSecureStore,
): ReevaluatePendingStore {
  const fallback = createMemoryReevaluatePendingStore();
  return {
    async markPending(uid: string) {
      if (!uid) return;
      await fallback.markPending(uid);
      const store = await getStore();
      if (!store) return;
      try {
        await store.setItemAsync(keyForUid(uid), '1');
      } catch {
        /* memory fallback remains */
      }
    },
    async clearIfUid(uid: string) {
      await fallback.clearIfUid(uid);
      const store = await getStore();
      if (!store) return;
      try {
        await store.deleteItemAsync(keyForUid(uid));
        if ((await store.getItemAsync(LEGACY_KEY)) === uid) {
          await store.deleteItemAsync(LEGACY_KEY);
        }
      } catch {
        /* ignore */
      }
    },
    async isPending(uid: string) {
      const store = await getStore();
      if (store) {
        try {
          if ((await store.getItemAsync(keyForUid(uid))) != null) return true;
          if ((await store.getItemAsync(LEGACY_KEY)) === uid) return true;
        } catch {
          /* fall through */
        }
      }
      return fallback.isPending(uid);
    },
  };
}

let registered = false;

export function ensureReevaluatePendingStoreRegistered(): void {
  if (registered) return;
  registered = true;
  registerReevaluatePendingStore(createSecureReevaluatePendingStore());
}

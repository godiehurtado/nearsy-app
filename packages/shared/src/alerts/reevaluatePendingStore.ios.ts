/**
 * SecureStore-backed pending reevaluate flag. Never stores address-book rows.
 */

import type { ReevaluatePendingStore } from './reevaluatePendingStore';
import {
  createMemoryReevaluatePendingStore,
  registerReevaluatePendingStore,
} from './reevaluatePendingStore';

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

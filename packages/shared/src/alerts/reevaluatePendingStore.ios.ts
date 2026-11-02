/**
 * SecureStore-backed pending reevaluate flag. Never stores address-book rows.
 */

import type { ReevaluatePendingStore } from './reevaluatePendingStore';
import {
  createMemoryReevaluatePendingStore,
  registerReevaluatePendingStore,
} from './reevaluatePendingStore';

const KEY = 'nearsy.alerts.v1.reevaluatePendingUid';

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

export function createSecureReevaluatePendingStore(): ReevaluatePendingStore {
  const fallback = createMemoryReevaluatePendingStore();
  return {
    async markPending(uid: string) {
      if (!uid) return;
      await fallback.markPending(uid);
      const store = await loadSecureStore();
      if (!store) return;
      try {
        await store.setItemAsync(KEY, uid);
      } catch {
        /* memory fallback remains */
      }
    },
    async clearIfUid(uid: string) {
      const current = await this.loadPendingUid();
      if (current !== uid) return;
      await fallback.clearIfUid(uid);
      const store = await loadSecureStore();
      if (!store) return;
      try {
        await store.deleteItemAsync(KEY);
      } catch {
        /* ignore */
      }
    },
    async loadPendingUid() {
      const store = await loadSecureStore();
      if (store) {
        try {
          const raw = await store.getItemAsync(KEY);
          if (typeof raw === 'string' && raw.trim()) return raw.trim();
        } catch {
          /* fall through */
        }
      }
      return fallback.loadPendingUid();
    },
  };
}

let registered = false;

export function ensureReevaluatePendingStoreRegistered(): void {
  if (registered) return;
  registered = true;
  registerReevaluatePendingStore(createSecureReevaluatePendingStore());
}

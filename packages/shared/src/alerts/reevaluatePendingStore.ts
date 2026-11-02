/**
 * Durable pending flag for Functions reevaluateProximityNotices.
 * Isolated by Auth uid so another account cannot flush or steal the flag.
 * Survives process death; cleared only after a successful invoke for that uid.
 * An Identity idempotent result must not clear a prior pending mark.
 */

export type ReevaluatePendingStore = {
  markPending(uid: string): Promise<void>;
  clearIfUid(uid: string): Promise<void>;
  loadPendingUid(): Promise<string | null>;
};

let memoryUid: string | null = null;

export function createMemoryReevaluatePendingStore(
  seed?: string | null,
): ReevaluatePendingStore & { peek(): string | null } {
  memoryUid = seed ?? null;
  return {
    async markPending(uid: string) {
      if (!uid) return;
      memoryUid = uid;
    },
    async clearIfUid(uid: string) {
      if (memoryUid && memoryUid === uid) memoryUid = null;
    },
    async loadPendingUid() {
      return memoryUid;
    },
    peek() {
      return memoryUid;
    },
  };
}

let impl: ReevaluatePendingStore = createMemoryReevaluatePendingStore();

export function registerReevaluatePendingStore(
  store: ReevaluatePendingStore,
): void {
  impl = store;
}

export function getReevaluatePendingStore(): ReevaluatePendingStore {
  return impl;
}

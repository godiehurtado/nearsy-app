/**
 * Durable pending flag for Functions reevaluateProximityNotices.
 * Isolated by Auth uid so another account cannot flush or steal the flag.
 * Survives process death; cleared only after a successful invoke for that uid.
 * An Identity idempotent result must not clear a prior pending mark.
 */

export type ReevaluatePendingStore = {
  markPending(uid: string): Promise<void>;
  clearIfUid(uid: string): Promise<void>;
  isPending(uid: string): Promise<boolean>;
};

export function createMemoryReevaluatePendingStore(
  seed?: string | null,
): ReevaluatePendingStore & { peek(): string | null } {
  const pending = new Set<string>(seed ? [seed] : []);
  return {
    async markPending(uid: string) {
      if (!uid) return;
      pending.add(uid);
    },
    async clearIfUid(uid: string) {
      pending.delete(uid);
    },
    async isPending(uid: string) {
      return pending.has(uid);
    },
    peek() {
      return pending.values().next().value ?? null;
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

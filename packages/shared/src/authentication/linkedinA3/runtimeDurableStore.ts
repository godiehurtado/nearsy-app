import { createLinkedInA3DurableStore } from './createLinkedInA3DurableStore';
import type { LinkedInA3DurableStore } from './durableTransactionStore';

let shared: LinkedInA3DurableStore | undefined;

/**
 * One process-wide durable adapter so live Start and App-root resume
 * share the same SecureStore (and memory fail-soft) instance.
 */
export function getSharedLinkedInA3DurableStore(): LinkedInA3DurableStore {
  shared ??= createLinkedInA3DurableStore();
  return shared;
}

export function resetSharedLinkedInA3DurableStoreForTests(): void {
  shared = undefined;
}

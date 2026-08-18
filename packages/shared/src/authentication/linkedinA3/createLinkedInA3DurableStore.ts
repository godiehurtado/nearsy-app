/**
 * Non-iOS / tsc fallback: process-memory only.
 * Kill/relaunch recovery requires the iOS SecureStore adapter.
 */

import {
  createInMemoryLinkedInA3DurableStore,
  type LinkedInA3DurableStore,
} from './durableTransactionStore';

export function createLinkedInA3DurableStore(): LinkedInA3DurableStore {
  return createInMemoryLinkedInA3DurableStore();
}

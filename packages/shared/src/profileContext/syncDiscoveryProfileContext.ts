/**
 * Soft-invoke syncDiscoveryProfileContext after owner context writes.
 * synced:false is success; transport/contract errors are soft failures.
 */

import { buildSyncDiscoveryProfileContextRequest } from '../visibility/callables/requests';
import type { VisibilityDiscoveryClient } from '../visibility/callables/port';
import type { SyncDiscoveryProfileContextResponse } from '../visibility/callables/wireTypes';
import { isVisibilityDiscoveryClientError } from '../visibility/callables/errors';

export type SyncDiscoveryProfileContextOutcome =
  | { kind: 'synced'; response: SyncDiscoveryProfileContextResponse }
  | { kind: 'not_synced'; response: SyncDiscoveryProfileContextResponse }
  | { kind: 'failed'; error: unknown };

export async function syncDiscoveryProfileContextAfterSave(
  client: VisibilityDiscoveryClient,
): Promise<SyncDiscoveryProfileContextOutcome> {
  try {
    const response = await client.syncDiscoveryProfileContext(
      buildSyncDiscoveryProfileContextRequest(),
    );
    if (response.synced) {
      return { kind: 'synced', response };
    }
    return { kind: 'not_synced', response };
  } catch (error) {
    return { kind: 'failed', error };
  }
}

export function isSoftSyncFailure(
  outcome: SyncDiscoveryProfileContextOutcome,
): boolean {
  return outcome.kind === 'failed';
}

export { isVisibilityDiscoveryClientError };

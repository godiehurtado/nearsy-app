/**
 * Re-project user-doc profile context into Discovery via syncDiscoveryProfileContext.
 *
 * `synced: false` is still a successful callable outcome from the user-save
 * perspective (e.g. Discovery projection skipped because visibility is off).
 * Only thrown / transport errors are treated as failure.
 */

import {
  buildSyncDiscoveryProfileContextRequest,
  normalizeVisibilityCallableError,
  type SyncDiscoveryProfileContextResponse,
  type VisibilityDiscoveryClient,
  type VisibilityDiscoveryClientError,
} from './callables';

export type SyncDiscoveryProfileContextOutcome =
  | { ok: true; response: SyncDiscoveryProfileContextResponse }
  | { ok: false; error: VisibilityDiscoveryClientError };

export async function syncDiscoveryProfileContextFlow(
  client: VisibilityDiscoveryClient,
): Promise<SyncDiscoveryProfileContextOutcome> {
  try {
    const response = await client.syncDiscoveryProfileContext(
      buildSyncDiscoveryProfileContextRequest(),
    );
    return { ok: true, response };
  } catch (err) {
    return {
      ok: false,
      error: normalizeVisibilityCallableError(err),
    };
  }
}

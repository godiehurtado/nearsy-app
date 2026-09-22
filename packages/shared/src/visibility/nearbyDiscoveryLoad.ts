/**
 * Nearby Discovery load with contractual location refresh (BUG-DISC-02 / BUG-DISC-05).
 * publishLocation (when due) → discoverNearby. Never writes authoritative location to Firestore.
 */

import {
  buildDiscoverNearbyRequest,
  isVisibilityDiscoveryClientError,
  normalizeVisibilityCallableError,
  type DiscoverNearbyResult,
  type VisibilityDiscoveryClient,
  type VisibilityDiscoveryClientError,
} from './callables';
import {
  noteContractualPublishSuccess,
  shouldAttemptContractualPublish,
} from './contractualLocationRefresh';

export type NearbyDiscoveryLoadFailureKind =
  | 'unauthenticated'
  | 'inactive'
  | 'permission-denied'
  | 'unavailable'
  | 'invalid-accuracy'
  | 'callable';

export type NearbyDiscoveryPublishOutcome =
  | { ok: true; response?: unknown }
  | {
      ok: false;
      kind:
        | 'permission-denied'
        | 'unavailable'
        | 'invalid-accuracy'
        | 'callable';
      error?: VisibilityDiscoveryClientError;
      canAskAgain?: boolean;
    };

export type NearbyDiscoveryLoadOutcome =
  | { ok: true; results: DiscoverNearbyResult[]; published: boolean }
  | {
      ok: false;
      kind: NearbyDiscoveryLoadFailureKind;
      error?: VisibilityDiscoveryClientError;
      canAskAgain?: boolean;
    };

export type LoadNearbyWithContractualRefreshInput = {
  uid: string | null | undefined;
  visibility: boolean;
  client: VisibilityDiscoveryClient;
  limit?: number;
  /**
   * When true (default), always publishLocation before discoverNearby.
   * When false, publish only if the shared contractual guard says a publish is due
   * (avoids doubling ContractualLocationPublisher’s 2-min FG cadence).
   * discoverNearby always runs after a successful/skipped publish path.
   */
  forcePublish?: boolean;
  /**
   * Injectable for tests / composition. Defaults to publishLocationFlow
   * (lazy-loaded so Node unit tests can avoid expo-location).
   */
  publish?: (
    client: VisibilityDiscoveryClient,
  ) => Promise<NearbyDiscoveryPublishOutcome>;
};

function mapPublishFailure(
  outcome: Extract<NearbyDiscoveryPublishOutcome, { ok: false }>,
): NearbyDiscoveryLoadOutcome {
  if (outcome.kind === 'permission-denied') {
    return {
      ok: false,
      kind: 'permission-denied',
      ...(outcome.canAskAgain !== undefined
        ? { canAskAgain: outcome.canAskAgain }
        : {}),
    };
  }
  if (outcome.kind === 'unavailable') {
    return { ok: false, kind: 'unavailable' };
  }
  if (outcome.kind === 'invalid-accuracy') {
    return { ok: false, kind: 'invalid-accuracy' };
  }
  return {
    ok: false,
    kind: 'callable',
    error:
      outcome.error ??
      normalizeVisibilityCallableError(outcome.error),
  };
}

/**
 * Visibility ON → (optional) publish current contractual location → discoverNearby.
 * Visibility OFF → inactive (never activates Visibility).
 */
export async function loadNearbyWithContractualRefresh(
  input: LoadNearbyWithContractualRefreshInput,
): Promise<NearbyDiscoveryLoadOutcome> {
  if (!input.uid) {
    return { ok: false, kind: 'unauthenticated' };
  }
  if (!input.visibility) {
    return { ok: false, kind: 'inactive' };
  }

  const forcePublish = input.forcePublish !== false;
  const nowMs = Date.now();
  const needPublish =
    forcePublish || shouldAttemptContractualPublish(nowMs);

  let published = false;
  if (needPublish) {
    const publishStartedAt = Date.now();
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      // Redacted: no uid / coords.
      console.log('[NearbyDiscover] publishLocation start', {
        forcePublish,
      });
    }
    const publish =
      input.publish ??
      (await import('./orchestration')).publishLocationFlow;
    const publishOutcome = await publish(input.client);
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.log('[NearbyDiscover] publishLocation end', {
        ok: publishOutcome.ok,
        kind: publishOutcome.ok === false ? publishOutcome.kind : undefined,
        ms: Date.now() - publishStartedAt,
      });
    }
    if (publishOutcome.ok === false) {
      return mapPublishFailure(publishOutcome);
    }
    noteContractualPublishSuccess(Date.now());
    published = true;
  } else if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.log('[NearbyDiscover] publishLocation skipped', { forcePublish });
  }

  const discoverStartedAt = Date.now();
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.log('[NearbyDiscover] discoverNearby start', {
      limit: input.limit ?? null,
    });
  }
  try {
    const response = await input.client.discoverNearby(
      buildDiscoverNearbyRequest(
        input.limit !== undefined ? { limit: input.limit } : undefined,
      ),
    );
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.log('[NearbyDiscover] discoverNearby end', {
        ok: true,
        resultCount: Array.isArray(response.results)
          ? response.results.length
          : 0,
        published,
        ms: Date.now() - discoverStartedAt,
      });
    }
    return { ok: true, results: response.results, published };
  } catch (err) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      const normalized = isVisibilityDiscoveryClientError(err)
        ? err
        : normalizeVisibilityCallableError(err);
      console.log('[NearbyDiscover] discoverNearby end', {
        ok: false,
        retryable: normalized.retryable,
        ms: Date.now() - discoverStartedAt,
      });
    }
    return {
      ok: false,
      kind: 'callable',
      error: isVisibilityDiscoveryClientError(err)
        ? err
        : normalizeVisibilityCallableError(err),
    };
  }
}

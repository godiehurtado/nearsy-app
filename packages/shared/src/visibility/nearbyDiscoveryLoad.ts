/**
 * Nearby Discovery load with contractual location refresh (BUG-DISC-02).
 * publishLocation → discoverNearby. Never writes authoritative location to Firestore.
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
  FOREGROUND_CONTRACTUAL_CADENCE_MS,
  noteContractualPublishSuccess,
  shouldAttemptContractualPublish,
} from './contractualLocationRefresh';

export type NearbyDiscoveryLoadFailureKind =
  | 'unauthenticated'
  | 'inactive'
  | 'permission-denied'
  | 'unavailable'
  | 'invalid-accuracy'
  | 'callable'
  | 'session-closed';

export type NearbyDiscoveryPublishOutcome =
  | { ok: true; response?: unknown }
  | {
      ok: false;
      kind:
        | 'permission-denied'
        | 'unavailable'
        | 'invalid-accuracy'
        | 'callable'
        | 'session-closed';
      error?: VisibilityDiscoveryClientError;
      canAskAgain?: boolean;
    };

export type NearbyDiscoveryLoadOutcome =
  | { ok: true; results: DiscoverNearbyResult[] }
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
   * When true (default), always publishLocation before discoverNearby
   * (Nearby open / Retry / pull-to-refresh).
   * When false (soft rediscover: focus / foreground / interval), skip
   * publish if a successful publish already happened within the FG cadence
   * window — still run discoverNearby so the list renews without doubling
   * ContractualLocationPublisher’s 2-minute publish.
   */
  forcePublish?: boolean;
  /**
   * Injectable for tests / composition. Defaults to publishLocationFlow
   * (sync require — avoids Metro lazy `import()` chunk resolution under
   * EXPO_NO_METRO_WORKSPACE_ROOT, and keeps Node tests free of expo-location).
   */
  publish?: (
    client: VisibilityDiscoveryClient,
  ) => Promise<NearbyDiscoveryPublishOutcome>;
  /**
   * Publication session check (location/publicationSession). When it reports
   * false nothing is published or discovered, and a session that closes
   * mid-load never surfaces results.
   */
  sessionIsCurrent?: () => boolean;
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
  if (outcome.kind === 'session-closed') {
    return { ok: false, kind: 'session-closed' };
  }
  return {
    ok: false,
    kind: 'callable',
    error:
      outcome.error ??
      normalizeVisibilityCallableError(outcome.error),
  };
}

type GuardedPublish = (
  client: VisibilityDiscoveryClient,
  coords: undefined,
  guard: { isCurrent: () => boolean },
) => Promise<NearbyDiscoveryPublishOutcome>;

function defaultPublishLocationFlow(): GuardedPublish {
  // Sync require matches initialCrjVisibilityActivation; do not use import().
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const orchestration = require('./orchestration') as {
    publishLocationFlow: GuardedPublish;
  };
  return orchestration.publishLocationFlow;
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
  const sessionIsCurrent = input.sessionIsCurrent ?? (() => true);
  if (!sessionIsCurrent()) {
    return { ok: false, kind: 'session-closed' };
  }

  const forcePublish = input.forcePublish !== false;
  const shouldPublish =
    forcePublish ||
    shouldAttemptContractualPublish(
      Date.now(),
      FOREGROUND_CONTRACTUAL_CADENCE_MS,
    );

  if (shouldPublish) {
    const publishOutcome = input.publish
      ? await input.publish(input.client)
      : await defaultPublishLocationFlow()(input.client, undefined, {
          isCurrent: sessionIsCurrent,
        });
    if (publishOutcome.ok === false) {
      return mapPublishFailure(publishOutcome);
    }
    if (!sessionIsCurrent()) {
      return { ok: false, kind: 'session-closed' };
    }
    noteContractualPublishSuccess(Date.now());
  }

  try {
    const response = await input.client.discoverNearby(
      buildDiscoverNearbyRequest(
        input.limit !== undefined ? { limit: input.limit } : undefined,
      ),
    );
    if (!sessionIsCurrent()) {
      return { ok: false, kind: 'session-closed' };
    }
    return { ok: true, results: response.results };
  } catch (err) {
    return {
      ok: false,
      kind: 'callable',
      error: isVisibilityDiscoveryClientError(err)
        ? err
        : normalizeVisibilityCallableError(err),
    };
  }
}

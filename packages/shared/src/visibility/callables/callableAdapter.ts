/**
 * Firebase-callable adapter for Visibility/Discovery.
 * Domain never imports Firebase — inject an invoker from a composition root.
 */

import { normalizeVisibilityCallableError } from './errors';
import { VISIBILITY_CALLABLE_NAMES, type VisibilityCallableName } from './names';
import type { VisibilityDiscoveryClient } from './port';
import {
  parseActivateVisibilityResponse,
  parseDeactivateVisibilityResponse,
  parseDiscoverNearbyResponse,
  parseGetBlockedPeopleResponse,
  parseGetDiscoveryProfileResponse,
  parsePublishLocationResponse,
  parseSetActiveProfileModeResponse,
} from './parse';
import { serializeVisibilityRequest } from './requests';
import type {
  ActivateVisibilityRequest,
  DeactivateVisibilityRequest,
  DiscoverNearbyRequest,
  GetBlockedPeopleRequest,
  GetDiscoveryProfileRequest,
  PublishLocationRequest,
  SetActiveProfileModeRequest,
} from './wireTypes';

export type VisibilityCallableInvoker = (
  name: VisibilityCallableName,
  data: Record<string, unknown>,
) => Promise<unknown>;

/**
 * Configuration for the callable adapter.
 * `functionsRegion` is injectable metadata for composition roots
 * (observed canonical value in-repo: `us-central1`); the invoker binds transport.
 */
export type VisibilityDiscoveryCallableClientConfig = {
  invoke: VisibilityCallableInvoker;
  functionsRegion?: string;
};

export function createVisibilityDiscoveryCallableClient(
  config: VisibilityDiscoveryCallableClientConfig,
): VisibilityDiscoveryClient {
  const invoke = config.invoke;

  async function callParsed<T>(
    name: VisibilityCallableName,
    request: Record<string, unknown>,
    parse: (data: unknown) => T,
  ): Promise<T> {
    try {
      const data = await invoke(name, request);
      return parse(data);
    } catch (err) {
      throw normalizeVisibilityCallableError(err);
    }
  }

  return {
    activateVisibility(request: ActivateVisibilityRequest) {
      return callParsed(
        VISIBILITY_CALLABLE_NAMES.activateVisibility,
        serializeVisibilityRequest(request),
        parseActivateVisibilityResponse,
      );
    },
    publishLocation(request: PublishLocationRequest) {
      return callParsed(
        VISIBILITY_CALLABLE_NAMES.publishLocation,
        serializeVisibilityRequest(request),
        parsePublishLocationResponse,
      );
    },
    deactivateVisibility(request: DeactivateVisibilityRequest) {
      return callParsed(
        VISIBILITY_CALLABLE_NAMES.deactivateVisibility,
        serializeVisibilityRequest(request),
        parseDeactivateVisibilityResponse,
      );
    },
    discoverNearby(request: DiscoverNearbyRequest) {
      return callParsed(
        VISIBILITY_CALLABLE_NAMES.discoverNearby,
        serializeVisibilityRequest(request),
        parseDiscoverNearbyResponse,
      );
    },
    getDiscoveryProfile(request: GetDiscoveryProfileRequest) {
      return callParsed(
        VISIBILITY_CALLABLE_NAMES.getDiscoveryProfile,
        serializeVisibilityRequest(request),
        parseGetDiscoveryProfileResponse,
      );
    },
    setActiveProfileMode(request: SetActiveProfileModeRequest) {
      return callParsed(
        VISIBILITY_CALLABLE_NAMES.setActiveProfileMode,
        serializeVisibilityRequest(request),
        parseSetActiveProfileModeResponse,
      );
    },
    getBlockedPeople(request: GetBlockedPeopleRequest) {
      return callParsed(
        VISIBILITY_CALLABLE_NAMES.getBlockedPeople,
        serializeVisibilityRequest(request),
        parseGetBlockedPeopleResponse,
      );
    },
  };
}

/**
 * Request builders — only contractual fields; no caller UID, prefs, geohash, etc.
 */

import { CONTRACT_VERSION } from '../constants';
import type { ProfileMode } from '../types';
import type {
  ActivateVisibilityRequest,
  DeactivateVisibilityRequest,
  DiscoverNearbyRequest,
  GetDiscoveryProfileRequest,
  PublishLocationRequest,
  SetActiveProfileModeRequest,
  VisibilityLocationPayload,
} from './wireTypes';

export function buildLocationPayload(input: {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  observedAt: number;
}): VisibilityLocationPayload {
  return {
    latitude: input.latitude,
    longitude: input.longitude,
    accuracyMeters: input.accuracyMeters,
    observedAt: input.observedAt,
  };
}

export function buildActivateVisibilityRequest(
  location: VisibilityLocationPayload,
): ActivateVisibilityRequest {
  return {
    contractVersion: CONTRACT_VERSION,
    location: { ...location },
  };
}

export function buildPublishLocationRequest(
  location: VisibilityLocationPayload,
): PublishLocationRequest {
  return {
    contractVersion: CONTRACT_VERSION,
    location: { ...location },
  };
}

export function buildDeactivateVisibilityRequest(): DeactivateVisibilityRequest {
  return { contractVersion: CONTRACT_VERSION };
}

export function buildDiscoverNearbyRequest(input?: {
  limit?: number;
  cursor?: null;
}): DiscoverNearbyRequest {
  const request: DiscoverNearbyRequest = {
    contractVersion: CONTRACT_VERSION,
  };
  if (input?.limit !== undefined) {
    request.limit = input.limit;
  }
  if (input && Object.prototype.hasOwnProperty.call(input, 'cursor')) {
    request.cursor = null;
  }
  return request;
}

export function buildGetDiscoveryProfileRequest(
  candidateUid: string,
): GetDiscoveryProfileRequest {
  return {
    contractVersion: CONTRACT_VERSION,
    candidateUid,
  };
}

export function buildSetActiveProfileModeRequest(
  mode: ProfileMode,
): SetActiveProfileModeRequest {
  return {
    contractVersion: CONTRACT_VERSION,
    mode,
  };
}

/** Plain JSON-serializable body for callable invoke. */
export function serializeVisibilityRequest(
  request:
    | ActivateVisibilityRequest
    | PublishLocationRequest
    | DeactivateVisibilityRequest
    | DiscoverNearbyRequest
    | GetDiscoveryProfileRequest
    | SetActiveProfileModeRequest,
): Record<string, unknown> {
  return { ...request } as Record<string, unknown>;
}

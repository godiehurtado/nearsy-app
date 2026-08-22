/**
 * Deterministic fake VisibilityDiscoveryClient — no Firebase / network.
 */

import { CONTRACT_VERSION } from '../constants';
import type { VisibilityDiscoveryClient } from './port';
import type {
  ActivateVisibilityRequest,
  ActivateVisibilityResponse,
  DeactivateVisibilityRequest,
  DeactivateVisibilityResponse,
  DiscoverNearbyRequest,
  DiscoverNearbyResponse,
  DiscoveryProfileSummary,
  GetDiscoveryProfileRequest,
  GetDiscoveryProfileResponse,
  PublishLocationRequest,
  PublishLocationResponse,
} from './wireTypes';

const DEFAULT_PROFILE: DiscoveryProfileSummary = {
  mode: 'personal',
  displayName: 'Alex R.',
  profileImage: null,
  occupation: '',
  interestIds: ['sports_outdoors_soccer'],
  ageYears: 28,
};

const DEFAULT_DETAIL = {
  ...DEFAULT_PROFILE,
  company: '',
  bio: '',
};

export type FakeVisibilityDiscoveryHandlers = Partial<{
  activateVisibility: (
    request: ActivateVisibilityRequest,
  ) => Promise<ActivateVisibilityResponse>;
  publishLocation: (
    request: PublishLocationRequest,
  ) => Promise<PublishLocationResponse>;
  deactivateVisibility: (
    request: DeactivateVisibilityRequest,
  ) => Promise<DeactivateVisibilityResponse>;
  discoverNearby: (
    request: DiscoverNearbyRequest,
  ) => Promise<DiscoverNearbyResponse>;
  getDiscoveryProfile: (
    request: GetDiscoveryProfileRequest,
  ) => Promise<GetDiscoveryProfileResponse>;
}>;

export type FakeVisibilityDiscoveryClient = VisibilityDiscoveryClient & {
  readonly calls: Array<{ name: string; request: unknown }>;
};

export function createFakeVisibilityDiscoveryClient(
  handlers: FakeVisibilityDiscoveryHandlers = {},
  options?: { serverNow?: number },
): FakeVisibilityDiscoveryClient {
  const serverNow = options?.serverNow ?? 1_700_000_000_000;
  const calls: Array<{ name: string; request: unknown }> = [];

  const client: FakeVisibilityDiscoveryClient = {
    calls,
    async activateVisibility(request) {
      calls.push({ name: 'activateVisibility', request });
      if (handlers.activateVisibility) {
        return handlers.activateVisibility(request);
      }
      return {
        contractVersion: CONTRACT_VERSION,
        visibility: true,
        observedAt: request.location.observedAt,
        confirmedAt: serverNow,
        updatedAt: serverNow,
        accuracyMeters: request.location.accuracyMeters,
        serverTime: serverNow,
      };
    },
    async publishLocation(request) {
      calls.push({ name: 'publishLocation', request });
      if (handlers.publishLocation) {
        return handlers.publishLocation(request);
      }
      return {
        contractVersion: CONTRACT_VERSION,
        visibility: true,
        observedAt: request.location.observedAt,
        confirmedAt: serverNow,
        updatedAt: serverNow,
        accuracyMeters: request.location.accuracyMeters,
        serverTime: serverNow,
      };
    },
    async deactivateVisibility(request) {
      calls.push({ name: 'deactivateVisibility', request });
      if (handlers.deactivateVisibility) {
        return handlers.deactivateVisibility(request);
      }
      return {
        contractVersion: CONTRACT_VERSION,
        visibility: false,
        serverTime: serverNow,
      };
    },
    async discoverNearby(request) {
      calls.push({ name: 'discoverNearby', request });
      if (handlers.discoverNearby) {
        return handlers.discoverNearby(request);
      }
      return {
        contractVersion: CONTRACT_VERSION,
        results: [
          {
            uid: 'candidate-1',
            distanceMeters: 12.5,
            profile: DEFAULT_PROFILE,
          },
        ],
        nextCursor: null,
        serverTime: serverNow,
      };
    },
    async getDiscoveryProfile(request) {
      calls.push({ name: 'getDiscoveryProfile', request });
      if (handlers.getDiscoveryProfile) {
        return handlers.getDiscoveryProfile(request);
      }
      return {
        contractVersion: CONTRACT_VERSION,
        uid: request.candidateUid,
        distanceMeters: 12.5,
        profile: DEFAULT_DETAIL,
        gallery: [],
        serverTime: serverNow,
      };
    },
  };

  return client;
}

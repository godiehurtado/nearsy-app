/**
 * Injectable Visibility/Discovery client port (no Firebase imports).
 */

import type {
  ActivateVisibilityRequest,
  ActivateVisibilityResponse,
  DeactivateVisibilityRequest,
  DeactivateVisibilityResponse,
  DiscoverNearbyRequest,
  DiscoverNearbyResponse,
  GetBlockedPeopleRequest,
  GetBlockedPeopleResponse,
  GetDiscoveryProfileRequest,
  GetDiscoveryProfileResponse,
  PublishLocationRequest,
  PublishLocationResponse,
  SetActiveProfileModeRequest,
  SetActiveProfileModeResponse,
} from './wireTypes';

export type VisibilityDiscoveryClient = {
  activateVisibility(
    request: ActivateVisibilityRequest,
  ): Promise<ActivateVisibilityResponse>;
  publishLocation(
    request: PublishLocationRequest,
  ): Promise<PublishLocationResponse>;
  deactivateVisibility(
    request: DeactivateVisibilityRequest,
  ): Promise<DeactivateVisibilityResponse>;
  discoverNearby(
    request: DiscoverNearbyRequest,
  ): Promise<DiscoverNearbyResponse>;
  getDiscoveryProfile(
    request: GetDiscoveryProfileRequest,
  ): Promise<GetDiscoveryProfileResponse>;
  setActiveProfileMode(
    request: SetActiveProfileModeRequest,
  ): Promise<SetActiveProfileModeResponse>;
  getBlockedPeople(
    request: GetBlockedPeopleRequest,
  ): Promise<GetBlockedPeopleResponse>;
};

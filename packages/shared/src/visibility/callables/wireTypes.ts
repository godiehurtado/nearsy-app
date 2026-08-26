/**
 * Wire DTOs for Visibility/Discovery callables.
 * Authoritative: Contract Freeze V3.0/V3.0.1 + business decision (no profile `status`).
 *
 * Timestamps: epoch milliseconds. Distances: meters.
 */

import { CONTRACT_VERSION } from '../constants';
import type { ProfileMode } from '../types';
import type { DiscoveryPublicAffiliation } from '../discoveryAffiliations';
import type { DiscoveryPublicSocialLink } from '../discoverySocialLinks';

export type VisibilityContractVersion = typeof CONTRACT_VERSION;

/** Client-submitted location sample (never echoed with coords in responses). */
export type VisibilityLocationPayload = {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  observedAt: number;
};

export type ActivateVisibilityRequest = {
  contractVersion: VisibilityContractVersion;
  location: VisibilityLocationPayload;
};

export type PublishLocationRequest = {
  contractVersion: VisibilityContractVersion;
  location: VisibilityLocationPayload;
};

export type DeactivateVisibilityRequest = {
  contractVersion: VisibilityContractVersion;
};

/** MVP: cursor omitted or null only. */
export type DiscoverNearbyRequest = {
  contractVersion: VisibilityContractVersion;
  limit?: number;
  cursor?: null;
};

export type GetDiscoveryProfileRequest = {
  contractVersion: VisibilityContractVersion;
  candidateUid: string;
};

export type SetActiveProfileModeRequest = {
  contractVersion: VisibilityContractVersion;
  mode: ProfileMode;
};

export type SetActiveProfileModeResponse = {
  contractVersion: VisibilityContractVersion;
  mode: ProfileMode;
  visibility: boolean;
  targetProfileComplete: boolean;
  discoverySynced: boolean;
  serverTime: number;
};

/**
 * Public Discovery card summary.
 * No profile `status`. Age is not part of the public UI model (legacy wire
 * may still send ageYears; parser validates + discards).
 */
export type DiscoveryProfileSummary = {
  mode: ProfileMode;
  displayName: string;
  profileImage: string | null;
  occupation: string;
  interestIds: string[];
};

/** Profile Detail wire profile = Summary + company + bio. */
export type DiscoveryProfileDetail = DiscoveryProfileSummary & {
  company: string;
  bio: string;
};

/** Gallery entry — `url` only; `path` is not part of the public contract. */
export type DiscoveryGalleryItem = {
  url: string;
};

export type DiscoverNearbyResult = {
  uid: string;
  distanceMeters: number;
  profile: DiscoveryProfileSummary;
};

export type ActivateVisibilityResponse = {
  contractVersion: VisibilityContractVersion;
  visibility: true;
  observedAt: number;
  confirmedAt: number;
  updatedAt: number;
  accuracyMeters: number;
  serverTime: number;
};

export type PublishLocationResponse = {
  contractVersion: VisibilityContractVersion;
  visibility: true;
  observedAt: number;
  confirmedAt: number;
  updatedAt: number;
  accuracyMeters: number;
  serverTime: number;
};

export type DeactivateVisibilityResponse = {
  contractVersion: VisibilityContractVersion;
  visibility: false;
  serverTime: number;
};

export type DiscoverNearbyResponse = {
  contractVersion: VisibilityContractVersion;
  results: DiscoverNearbyResult[];
  nextCursor: null;
  serverTime: number;
};

export type GetDiscoveryProfileResponse = {
  contractVersion: VisibilityContractVersion;
  uid: string;
  distanceMeters: number;
  profile: DiscoveryProfileDetail;
  gallery: DiscoveryGalleryItem[];
  /** Active-profile public links only; absent on older backends → parse to []. */
  socialLinks: DiscoveryPublicSocialLink[];
  /** Active-profile public affiliations; absent on older backends → parse to []. */
  affiliations: DiscoveryPublicAffiliation[];
  serverTime: number;
};

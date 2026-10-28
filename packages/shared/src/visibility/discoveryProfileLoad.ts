/**
 * Public Discovery Profile Detail load / focus-refresh decisions.
 * Pure — no React / Expo. Does not read private social bags.
 *
 * Client refetch does not enable Functions Instagram (or other) pilots.
 */

import type { GetDiscoveryProfileResponse } from './callables';
import type { DiscoverySocialPlatform } from './discoverySocialLinks';

export type DiscoveryProfileErrorKind =
  | 'none'
  | 'missing'
  | 'unavailable'
  | 'load';

export type DiscoveryProfileLoadView = {
  loading: boolean;
  errorKind: DiscoveryProfileErrorKind;
  data: GetDiscoveryProfileResponse | null;
};

/** Silent when the screen already has a successful public payload. */
export function shouldSilentDiscoveryProfileRefresh(
  data: GetDiscoveryProfileResponse | null | undefined,
): boolean {
  return data != null;
}

export function shouldApplyDiscoveryProfileLoadResult(input: {
  requestId: number;
  latestRequestId: number;
}): boolean {
  return input.requestId === input.latestRequestId;
}

export function applyDiscoveryProfileSuccess(
  response: GetDiscoveryProfileResponse,
): Pick<DiscoveryProfileLoadView, 'data' | 'errorKind' | 'loading'> {
  return {
    data: response,
    errorKind: 'none',
    loading: false,
  };
}

/**
 * Network / contract failure. A valid previous payload stays on screen;
 * error chrome is only for the first load (no data yet).
 */
export function applyDiscoveryProfileFailure(
  previous: GetDiscoveryProfileResponse | null | undefined,
  errorKind: Exclude<DiscoveryProfileErrorKind, 'none' | 'missing'>,
): Pick<DiscoveryProfileLoadView, 'data' | 'errorKind' | 'loading'> {
  if (previous) {
    return {
      data: previous,
      errorKind: 'none',
      loading: false,
    };
  }
  return {
    data: null,
    errorKind,
    loading: false,
  };
}

export function discoveryPublicHasPlatform(
  data: GetDiscoveryProfileResponse | null | undefined,
  platform: DiscoverySocialPlatform,
): boolean {
  return !!data?.socialLinks.some((link) => link.platform === platform);
}

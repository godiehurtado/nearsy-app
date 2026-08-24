/**
 * Firebase callable names for Visibility / Discovery (V3.0 contract).
 */

export const VISIBILITY_CALLABLE_NAMES = {
  activateVisibility: 'activateVisibility',
  publishLocation: 'publishLocation',
  deactivateVisibility: 'deactivateVisibility',
  discoverNearby: 'discoverNearby',
  getDiscoveryProfile: 'getDiscoveryProfile',
} as const;

export type VisibilityCallableName =
  (typeof VISIBILITY_CALLABLE_NAMES)[keyof typeof VISIBILITY_CALLABLE_NAMES];

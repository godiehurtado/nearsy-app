/**
 * Visibility lifecycle orchestration — permission, location sample, callables.
 */

import * as Location from 'expo-location';

import {
  buildActivateVisibilityRequest,
  buildDeactivateVisibilityRequest,
  buildLocationPayload,
  buildPublishLocationRequest,
  normalizeVisibilityCallableError,
  isVisibilityDiscoveryClientError,
  type ActivateVisibilityResponse,
  type DeactivateVisibilityResponse,
  type PublishLocationResponse,
  type VisibilityDiscoveryClient,
  type VisibilityLocationPayload,
  VisibilityDiscoveryClientError,
} from './callables';
import { MAX_LOCATION_ACCURACY_METERS } from './constants';
import { isAccuracyValid } from './freshness';

export type LocationSampleResult =
  | { ok: true; location: VisibilityLocationPayload }
  | {
      ok: false;
      kind: 'permission-denied' | 'unavailable' | 'invalid-accuracy';
    };

export async function ensureForegroundPermission(): Promise<
  'granted' | 'denied' | 'undetermined'
> {
  let perm = await Location.getForegroundPermissionsAsync();
  if (perm.status === 'granted') return 'granted';
  if (perm.status === 'undetermined' || perm.canAskAgain) {
    perm = await Location.requestForegroundPermissionsAsync();
  }
  if (perm.status === 'granted') return 'granted';
  return perm.status === 'undetermined' ? 'undetermined' : 'denied';
}

export async function obtainValidLocationSample(): Promise<LocationSampleResult> {
  const permission = await ensureForegroundPermission();
  if (permission !== 'granted') {
    return { ok: false, kind: 'permission-denied' };
  }

  try {
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Highest,
    });
    const accuracyMeters =
      typeof pos.coords.accuracy === 'number' &&
      Number.isFinite(pos.coords.accuracy)
        ? pos.coords.accuracy
        : Number.POSITIVE_INFINITY;

    if (!isAccuracyValid(accuracyMeters)) {
      return { ok: false, kind: 'invalid-accuracy' };
    }

    return {
      ok: true,
      location: buildLocationPayload({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracyMeters,
        observedAt: Date.now(),
      }),
    };
  } catch {
    return { ok: false, kind: 'unavailable' };
  }
}

export type ActivateOutcome =
  | { ok: true; response: ActivateVisibilityResponse }
  | {
      ok: false;
      kind:
        | 'permission-denied'
        | 'unavailable'
        | 'invalid-accuracy'
        | 'callable';
      error?: VisibilityDiscoveryClientError;
    };

export async function activateVisibilityFlow(
  client: VisibilityDiscoveryClient,
): Promise<ActivateOutcome> {
  const sample = await obtainValidLocationSample();
  if (sample.ok === false) {
    return { ok: false as const, kind: sample.kind };
  }
  try {
    const response = await client.activateVisibility(
      buildActivateVisibilityRequest(sample.location),
    );
    return { ok: true as const, response };
  } catch (err) {
    return {
      ok: false as const,
      kind: 'callable',
      error: normalizeVisibilityCallableError(err),
    };
  }
}

export type DeactivateOutcome =
  | { ok: true; response: DeactivateVisibilityResponse }
  | { ok: false; error: VisibilityDiscoveryClientError };

export async function deactivateVisibilityFlow(
  client: VisibilityDiscoveryClient,
): Promise<DeactivateOutcome> {
  try {
    const response = await client.deactivateVisibility(
      buildDeactivateVisibilityRequest(),
    );
    return { ok: true, response };
  } catch (err) {
    return {
      ok: false,
      error: normalizeVisibilityCallableError(err),
    };
  }
}

export type PublishOutcome =
  | { ok: true; response: PublishLocationResponse }
  | {
      ok: false;
      kind: 'permission-denied' | 'unavailable' | 'invalid-accuracy' | 'callable';
      error?: VisibilityDiscoveryClientError;
    };

export async function publishLocationFlow(
  client: VisibilityDiscoveryClient,
  coords?: {
    latitude: number;
    longitude: number;
    accuracyMeters: number;
    observedAt?: number;
  },
): Promise<PublishOutcome> {
  let location: VisibilityLocationPayload;
  if (coords) {
    if (!isAccuracyValid(coords.accuracyMeters)) {
      return { ok: false as const, kind: 'invalid-accuracy' };
    }
    location = buildLocationPayload({
      latitude: coords.latitude,
      longitude: coords.longitude,
      accuracyMeters: coords.accuracyMeters,
      observedAt: coords.observedAt ?? Date.now(),
    });
  } else {
    const sample = await obtainValidLocationSample();
    if (sample.ok === false) {
      return { ok: false as const, kind: sample.kind };
    }
    location = sample.location;
  }

  try {
    const response = await client.publishLocation(
      buildPublishLocationRequest(location),
    );
    return { ok: true, response };
  } catch (err) {
    return {
      ok: false,
      kind: 'callable',
      error: normalizeVisibilityCallableError(err),
    };
  }
}

/**
 * If remote visibility is true but foreground permission is not granted,
 * deactivate via backend. Does not deactivate for stale location alone.
 */
export async function reconcileVisibilityWithForegroundPermission(
  remoteVisibility: boolean,
  client: VisibilityDiscoveryClient,
): Promise<{
  visibility: boolean;
  reconciled: boolean;
  error?: VisibilityDiscoveryClientError;
}> {
  if (!remoteVisibility) {
    return { visibility: false, reconciled: false };
  }
  const perm = await Location.getForegroundPermissionsAsync();
  if (perm.status === 'granted') {
    return { visibility: true, reconciled: false };
  }
  const outcome = await deactivateVisibilityFlow(client);
  if (outcome.ok === true) {
    return { visibility: false, reconciled: true };
  }
  return {
    visibility: true,
    reconciled: false,
    error: outcome.error,
  };
}

export function isRetryableVisibilityFailure(err: unknown): boolean {
  if (isVisibilityDiscoveryClientError(err)) return err.retryable;
  return false;
}

export { MAX_LOCATION_ACCURACY_METERS };

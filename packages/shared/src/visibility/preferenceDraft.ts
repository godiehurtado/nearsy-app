/**
 * Pure preference-draft helpers — field patches never drop sibling fields.
 */

import type { ProfileMode } from '../profile/profileModeFields';
import type {
  VisibilitySearchPreferences,
  VisibilitySearchPreferencesByMode,
} from './types';

export type PrefsFieldPatch =
  | { kind: 'age'; ageMin: number; ageMax: number }
  | { kind: 'distance'; maxDistanceMeters: number }
  | { kind: 'interests'; interestIds: string[] };

export function applyPrefsFieldPatch(
  current: VisibilitySearchPreferences,
  patch: PrefsFieldPatch,
): VisibilitySearchPreferences {
  switch (patch.kind) {
    case 'age':
      return {
        ...current,
        ageMin: patch.ageMin,
        ageMax: patch.ageMax,
      };
    case 'distance':
      return {
        ...current,
        maxDistanceMeters: patch.maxDistanceMeters,
      };
    case 'interests':
      return {
        ...current,
        interestIds: [...patch.interestIds],
      };
  }
}

export function applyModeFieldPatch(
  byMode: VisibilitySearchPreferencesByMode,
  mode: ProfileMode,
  patch: PrefsFieldPatch,
): VisibilitySearchPreferencesByMode {
  return {
    ...byMode,
    [mode]: applyPrefsFieldPatch(byMode[mode], patch),
  };
}

/**
 * Remote snapshots must not overwrite local draft while writes are in flight
 * or a local epoch has advanced past the last acknowledged remote apply.
 */
export function shouldApplyRemotePreferences(input: {
  inFlightWrites: number;
  localEpoch: number;
  appliedEpoch: number;
}): boolean {
  if (input.inFlightWrites > 0) return false;
  if (input.localEpoch > input.appliedEpoch) return false;
  return true;
}

/** Sequential draft simulation for regression tests. */
export function reducePrefsPatches(
  initial: VisibilitySearchPreferencesByMode,
  mode: ProfileMode,
  patches: readonly PrefsFieldPatch[],
): VisibilitySearchPreferencesByMode {
  let next = initial;
  for (const patch of patches) {
    next = applyModeFieldPatch(next, mode, patch);
  }
  return next;
}

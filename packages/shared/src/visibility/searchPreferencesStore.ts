/**
 * Persist searchPreferences on users/{uid} (owner-writable).
 */

import type { ProfileMode } from '../profile/profileModeFields';
import { updateUserProfilePartial } from '../services/firestoreService';
import {
  parseSearchPreferencesFromUserDoc,
  resolveDistanceDisplayUnit,
} from './searchPreferencesParse';
import type {
  VisibilitySearchPreferences,
  VisibilitySearchPreferencesByMode,
} from './types';

export {
  parseSearchPreferencesFromUserDoc,
  resolveDistanceDisplayUnit,
} from './searchPreferencesParse';

export async function persistSearchPreferences(
  uid: string,
  byMode: VisibilitySearchPreferencesByMode,
): Promise<void> {
  await updateUserProfilePartial(uid, {
    searchPreferences: {
      personal: { ...byMode.personal },
      professional: { ...byMode.professional },
    },
  });
}

export async function persistSearchPreferencesForMode(
  uid: string,
  byMode: VisibilitySearchPreferencesByMode,
  mode: ProfileMode,
  next: VisibilitySearchPreferences,
): Promise<VisibilitySearchPreferencesByMode> {
  const updated = { ...byMode, [mode]: { ...next, updatedAt: Date.now() } };
  await persistSearchPreferences(uid, updated);
  return updated;
}

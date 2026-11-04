/**
 * Persist searchPreferences on users/{uid} (owner-writable).
 *
 * Active-mode updates use a nested field path so the client's local copy of the
 * inactive mode is never sent. Rules still validate the post-merge
 * `searchPreferences` bag, so an invalid inactive bag already STORED on the
 * server rejects the write (verified against the real rules in the emulator —
 * see __tests__/searchPreferencesRules.emulator.test.ts). Visibility is never
 * written here.
 */

import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';

import { firestoreDb } from '../config/firebaseConfig';
import { flattenCatalogInterestItems } from '../interests/onboardingInterestCatalog';
import type { ProfileMode } from '../profile/profileModeFields';
import { updateUserProfilePartial } from '../services/firestoreService';
import {
  buildSearchPreferencesModeUpdate,
  prepareSearchPreferencesForPersist,
} from './preferences';
import type {
  VisibilitySearchPreferences,
  VisibilitySearchPreferencesByMode,
} from './types';

export {
  parseSearchPreferencesFromUserDoc,
  resolveDistanceDisplayUnit,
} from './searchPreferencesParse';

export function officialCatalogInterestIdSet(): ReadonlySet<string> {
  return new Set(
    flattenCatalogInterestItems()
      .filter((item) => !item.id.startsWith('custom_'))
      .map((item) => item.id),
  );
}

function requirePersistable(
  prefs: VisibilitySearchPreferences,
  knownIds: ReadonlySet<string>,
): VisibilitySearchPreferences {
  const prepared = prepareSearchPreferencesForPersist(prefs, knownIds);
  if (prepared.ok === false) {
    throw new Error(prepared.reasons.join(',') || 'invalid-search-preferences');
  }
  return prepared.prefs;
}

/**
 * Full dual-mode write — used when both faces must be replaced together
 * (e.g. first hydration repair). Prefer {@link persistSearchPreferencesForMode}
 * for Home slider patches.
 */
export async function persistSearchPreferences(
  uid: string,
  byMode: VisibilitySearchPreferencesByMode,
): Promise<void> {
  const knownIds = officialCatalogInterestIdSet();
  const personal = requirePersistable(byMode.personal, knownIds);
  const professional = requirePersistable(byMode.professional, knownIds);
  await updateUserProfilePartial(uid, {
    searchPreferences: {
      personal: { ...personal },
      professional: { ...professional },
    },
  });
}

/**
 * Persist only the active mode via nested update. Does not touch visibility
 * or the sibling mode document fields.
 */
export async function persistSearchPreferencesForMode(
  uid: string,
  byMode: VisibilitySearchPreferencesByMode,
  mode: ProfileMode,
  next: VisibilitySearchPreferences,
): Promise<VisibilitySearchPreferencesByMode> {
  const knownIds = officialCatalogInterestIdSet();
  const prepared = requirePersistable(
    { ...next, updatedAt: Date.now() },
    knownIds,
  );
  const updated = { ...byMode, [mode]: prepared };
  const ref = doc(firestoreDb, 'users', uid);
  await updateDoc(
    ref,
    buildSearchPreferencesModeUpdate(mode, prepared, serverTimestamp()),
  );
  return updated;
}

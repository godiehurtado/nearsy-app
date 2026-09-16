/**
 * Persist searchPreferences on users/{uid} (owner-writable).
 */

import { flattenCatalogInterestItems } from '../interests/onboardingInterestCatalog';
import type { ProfileMode } from '../profile/profileModeFields';
import { updateUserProfilePartial } from '../services/firestoreService';
import { prepareSearchPreferencesForPersist } from './preferences';
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
  await persistSearchPreferences(uid, updated);
  return updated;
}

/**
 * Persist searchPreferences on users/{uid} (owner-writable).
 */

import { flattenCatalogInterestItems } from '../interests/onboardingInterestCatalog';
import type { ProfileMode } from '../profile/profileModeFields';
import { updateUserProfilePartial } from '../services/firestoreService';
import {
  buildSearchPreferencesModeWrite,
  type SearchPreferenceFields,
} from './searchPreferencesWriter';

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

/** Writes only the given fields of one mode; stored siblings are left alone. */
export async function persistSearchPreferencesForMode(
  uid: string,
  mode: ProfileMode,
  fields: SearchPreferenceFields,
  updatedAt: number,
): Promise<void> {
  await updateUserProfilePartial(
    uid,
    buildSearchPreferencesModeWrite(mode, fields, updatedAt),
  );
}

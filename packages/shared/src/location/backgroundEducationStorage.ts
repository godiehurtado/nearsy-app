/**
 * Local-only flag: user has seen the full background-location disclosure.
 * Never written to Firestore.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export const NEARSY_BG_LOCATION_EDUCATION_SEEN =
  'NEARSY_BG_LOCATION_EDUCATION_SEEN';

export async function hasSeenBackgroundLocationEducation(
  storage: Pick<typeof AsyncStorage, 'getItem'> = AsyncStorage,
): Promise<boolean> {
  try {
    const raw = await storage.getItem(NEARSY_BG_LOCATION_EDUCATION_SEEN);
    return raw === '1' || raw === 'true';
  } catch {
    return false;
  }
}

export async function markBackgroundLocationEducationSeen(
  storage: Pick<typeof AsyncStorage, 'setItem'> = AsyncStorage,
): Promise<void> {
  await storage.setItem(NEARSY_BG_LOCATION_EDUCATION_SEEN, '1');
}

export type BackgroundDisclosureVariant = 'full' | 'brief';

export async function resolveBackgroundDisclosureVariant(
  storage: Pick<typeof AsyncStorage, 'getItem'> = AsyncStorage,
): Promise<BackgroundDisclosureVariant> {
  const seen = await hasSeenBackgroundLocationEducation(storage);
  return seen ? 'brief' : 'full';
}

/**
 * CHG-INT-01 — legacy / deprecated interest display resolution.
 *
 * Selectable catalog lives in onboardingInterestCatalog.ts (2.0.4).
 * IDs listed here are NOT selectable, but keep resolving for profiles
 * that still store them until DATA-INT-01 runs.
 *
 * Do not write Firestore merges here.
 */

import type { OnboardingInterestItem } from './onboardingInterestCatalog';

function legacyItem(
  id: string,
  name: string,
  icon: string,
  iconColor: string,
): OnboardingInterestItem {
  return {
    id,
    name,
    nameKey: id,
    icon,
    iconColor,
  };
}

/**
 * Historical labels retained for display of unmigrated 2.0.3 rows.
 * IDs must never be reused for a different concept.
 */
export const LEGACY_DISPLAY_INTEREST_ITEMS: readonly OnboardingInterestItem[] = [
  // Business
  legacyItem(
    'business_women_in_business',
    'Women in Business',
    'woman-outline',
    '#C026D3',
  ),
  legacyItem(
    'business_family_business',
    'Family Business',
    'people-outline',
    '#0D9488',
  ),

  // Technology (including pending merge source)
  legacyItem(
    'technology_app_development',
    'App Development',
    'phone-portrait-outline',
    '#2563EB',
  ),
  legacyItem(
    'technology_digital_marketing',
    'Digital Marketing',
    'analytics-outline',
    '#DB2777',
  ),
  legacyItem(
    'technology_content_creation',
    'Content Creation',
    'create-outline',
    '#EA580C',
  ),

  // Music genres
  legacyItem(
    'music_genre_hiphop_rnb',
    'Hip-Hop & R&B',
    'headset-outline',
    '#C026D3',
  ),
  legacyItem(
    'music_genre_caribbean_global',
    'Caribbean & Global Music',
    'globe-outline',
    '#0D9488',
  ),

  // Music dance (including pending merge source)
  legacyItem('music_dance_dancing', 'Dancing', 'musical-notes-outline', '#DB2777'),
  legacyItem('music_dance_latin', 'Latin Dance', 'flame-outline', '#EA580C'),
  legacyItem('music_dance_social', 'Social Dance', 'people-outline', '#2563EB'),
  legacyItem(
    'music_dance_cultural',
    'Cultural Dance',
    'globe-outline',
    '#0D9488',
  ),
  legacyItem('music_dance_modern', 'Modern Dance', 'flash-outline', '#C026D3'),
  legacyItem(
    'music_dance_brazilian',
    'Brazilian Dance',
    'sunny-outline',
    '#CA8A04',
  ),

  // Music live
  legacyItem(
    'music_live_bands',
    'Live Bands',
    'musical-notes-outline',
    '#7C3AED',
  ),
  legacyItem('music_live_local', 'Local Music', 'location-outline', '#059669'),
  legacyItem(
    'music_live_open_mic',
    'Open-Mic Nights',
    'mic-circle-outline',
    '#0891B2',
  ),

  // Food
  legacyItem(
    'food_dietary_pescatarian',
    'Pescatarian',
    'fish-outline',
    '#0891B2',
  ),
  legacyItem(
    'food_cuisine_costa_rican',
    'Costa Rican',
    'flag-outline',
    '#0891B2',
  ),
  legacyItem(
    'food_cuisine_colombian',
    'Colombian',
    'flag-outline',
    '#CA8A04',
  ),
  legacyItem(
    'food_cuisine_brazilian',
    'Brazilian',
    'football-outline',
    '#16A34A',
  ),
  legacyItem('food_cuisine_seafood', 'Seafood', 'star-outline', '#CA8A04'),
];

const legacyById = new Map(
  LEGACY_DISPLAY_INTEREST_ITEMS.map((item) => [item.id, item]),
);

export const DEPRECATED_INTEREST_IDS: readonly string[] =
  LEGACY_DISPLAY_INTEREST_ITEMS.map((item) => item.id);

export function isLegacyDisplayInterestId(id: string): boolean {
  return legacyById.has(id);
}

export function resolveLegacyDisplayInterestItem(
  id: string,
): OnboardingInterestItem | undefined {
  return legacyById.get(id);
}

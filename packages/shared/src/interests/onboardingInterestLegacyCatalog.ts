/**
 * Deprecated CRJ interest IDs — display / editor preservation only (CHG-INT-01).
 * Not selectable in the 2.0.4 catalog. Removed after DATA-INT-01 migration.
 */

import type {
  OnboardingInterestCategoryId,
  OnboardingInterestItem,
  OnboardingSelectedInterest,
} from './onboardingInterestCatalog.ts';
import { flattenCatalogInterestItems } from './onboardingInterestCatalog.ts';

export type LegacyInterestDisplayItem = OnboardingInterestItem & {
  categoryId: OnboardingInterestCategoryId;
  groupId?: string;
};

function legacy(
  categoryId: OnboardingInterestCategoryId,
  id: string,
  name: string,
  icon: string,
  iconColor: string,
  groupId?: string,
): LegacyInterestDisplayItem {
  return {
    id,
    name,
    nameKey: id,
    icon,
    iconColor,
    categoryId,
    ...(groupId ? { groupId } : {}),
  };
}

/**
 * Historical labels for IDs no longer selectable.
 * Future merge sources stay readable until DATA-INT-01 rewrites Firestore.
 */
export const DEPRECATED_INTEREST_DISPLAY_ITEMS: readonly LegacyInterestDisplayItem[] =
  [
    // Business
    legacy(
      'business',
      'business_women_in_business',
      'Women in Business',
      'woman-outline',
      '#C026D3',
    ),
    legacy(
      'business',
      'business_family_business',
      'Family Business',
      'people-outline',
      '#0D9488',
    ),
    // Technology (incl. future merge → technology_software)
    legacy(
      'technology',
      'technology_app_development',
      'App Development',
      'phone-portrait-outline',
      '#2563EB',
    ),
    legacy(
      'technology',
      'technology_digital_marketing',
      'Digital Marketing',
      'analytics-outline',
      '#DB2777',
    ),
    legacy(
      'technology',
      'technology_content_creation',
      'Content Creation',
      'create-outline',
      '#EA580C',
    ),
    // Arts
    legacy(
      'arts',
      'arts_dancing',
      'Dancing',
      'musical-notes-outline',
      '#DB2777',
    ),
    // Music genres
    legacy(
      'music',
      'music_genre_hiphop_rnb',
      'Hip-Hop & R&B',
      'headset-outline',
      '#C026D3',
      'music_group_genres',
    ),
    legacy(
      'music',
      'music_genre_caribbean_global',
      'Caribbean & Global Music',
      'globe-outline',
      '#0D9488',
      'music_group_genres',
    ),
    legacy(
      'music',
      'music_genre_reggaeton',
      'Reggaeton',
      'radio-outline',
      '#C026D3',
      'music_group_genres',
    ),
    // Music dance (incl. future merge → music_dance_contemporary)
    legacy(
      'music',
      'music_dance_dancing',
      'Dancing',
      'musical-notes-outline',
      '#DB2777',
      'music_group_dance',
    ),
    legacy(
      'music',
      'music_dance_latin',
      'Latin Dance',
      'flame-outline',
      '#EA580C',
      'music_group_dance',
    ),
    legacy(
      'music',
      'music_dance_social',
      'Social Dance',
      'people-outline',
      '#2563EB',
      'music_group_dance',
    ),
    legacy(
      'music',
      'music_dance_cultural',
      'Cultural Dance',
      'globe-outline',
      '#0D9488',
      'music_group_dance',
    ),
    legacy(
      'music',
      'music_dance_modern',
      'Modern Dance',
      'flash-outline',
      '#C026D3',
      'music_group_dance',
    ),
    legacy(
      'music',
      'music_dance_brazilian',
      'Brazilian Dance',
      'sunny-outline',
      '#CA8A04',
      'music_group_dance',
    ),
    // Music live
    legacy(
      'music',
      'music_live_bands',
      'Live Bands',
      'musical-notes-outline',
      '#7C3AED',
      'music_group_live',
    ),
    legacy(
      'music',
      'music_live_local',
      'Local Music',
      'location-outline',
      '#059669',
      'music_group_live',
    ),
    legacy(
      'music',
      'music_live_open_mic',
      'Open-Mic Nights',
      'mic-circle-outline',
      '#0891B2',
      'music_group_live',
    ),
    // Food dietary / cuisines (incl. future merges → latin_american)
    legacy(
      'food',
      'food_cuisine_costa_rican',
      'Costa Rican',
      'flag-outline',
      '#0891B2',
      'food_group_cuisines',
    ),
    legacy(
      'food',
      'food_cuisine_colombian',
      'Colombian',
      'flag-outline',
      '#CA8A04',
      'food_group_cuisines',
    ),
    legacy(
      'food',
      'food_cuisine_brazilian',
      'Brazilian',
      'football-outline',
      '#16A34A',
      'food_group_cuisines',
    ),
    legacy(
      'food',
      'food_cuisine_seafood',
      'Seafood',
      'star-outline',
      '#CA8A04',
      'food_group_cuisines',
    ),
    // Travel
    legacy(
      'travel',
      'travel_immigration',
      'Immigration Stories',
      'earth-outline',
      '#059669',
    ),
  ];

const deprecatedById = new Map<string, LegacyInterestDisplayItem>(
  DEPRECATED_INTEREST_DISPLAY_ITEMS.map((item) => [item.id, item]),
);

let selectableIdSet: Set<string> | null = null;

function selectableIds(): Set<string> {
  if (!selectableIdSet) {
    selectableIdSet = new Set(flattenCatalogInterestItems().map((i) => i.id));
  }
  return selectableIdSet;
}

/** Test helper — clear caches after catalog mutations in tests. */
export function resetInterestCatalogLookupCaches(): void {
  selectableIdSet = null;
}

export function isDeprecatedInterestId(id: string): boolean {
  return deprecatedById.has(id);
}

export function isSelectableCatalogInterestId(id: string): boolean {
  return selectableIds().has(id);
}

export function getDeprecatedInterestDisplayItem(
  id: string,
): LegacyInterestDisplayItem | undefined {
  return deprecatedById.get(id);
}

/**
 * Resolve selectable or deprecated catalog rows for display.
 * Unknown IDs return null (Discovery / chips omit safely).
 */
export function lookupInterestItemForDisplay(
  id: string,
): OnboardingInterestItem | null {
  const selectable = flattenCatalogInterestItems().find((i) => i.id === id);
  if (selectable) return selectable;
  return getDeprecatedInterestDisplayItem(id) ?? null;
}

/**
 * Editor load: keep customs, selectable, and deprecated rows.
 * Drop truly unknown IDs so they are not silently re-saved.
 */
export function preserveOnboardingInterestsForEditor(
  selected: OnboardingSelectedInterest[],
): OnboardingSelectedInterest[] {
  return selected.filter((row) => {
    if (!row?.id) return false;
    if (row.isCustom === true) return true;
    if (isSelectableCatalogInterestId(row.id)) return true;
    if (isDeprecatedInterestId(row.id)) return true;
    return false;
  });
}

export function listDeprecatedInterestIds(): string[] {
  return DEPRECATED_INTEREST_DISPLAY_ITEMS.map((i) => i.id);
}

/**
 * CRJ onboarding interests catalog (isolated from in-app InterestsScreen).
 *
 * ID scheme (stable, deterministic):
 *   {categoryId}_{slug}              e.g. business_entrepreneurship
 *   music_{groupSlug}_{slug}         e.g. music_genre_pop
 *   custom_{categoryId}_{slug}_{ts}  e.g. custom_sports_pickle_171000
 *
 * INTERNAL INTERESTS MIGRATION — pending
 * The authenticated InterestsScreen still uses the legacy InterestLabel catalog.
 */

export const MIN_ONBOARDING_INTERESTS = 7;
export const CUSTOM_INTEREST_MAX_LENGTH = 40;

/** Coherent mid-saturation palette — readable on light and dark backgrounds. */
export const CRJ_ICON_COLOR_PALETTE = [
  '#2563EB', // blue
  '#0891B2', // cyan
  '#0D9488', // teal
  '#059669', // emerald
  '#16A34A', // green
  '#CA8A04', // gold
  '#EA580C', // orange
  '#DC2626', // red
  '#7C3AED', // violet
  '#C026D3', // fuchsia
  '#DB2777', // pink
  '#4F46E5', // indigo
] as const;

const OTHER_ICON = 'add-circle-outline';
const OTHER_COLOR = '#64748B'; // slate — neutral for Other chips

export type OnboardingInterestCategoryId =
  | 'business'
  | 'technology'
  | 'arts'
  | 'music'
  | 'food'
  | 'fitness'
  | 'sports'
  | 'outdoors'
  | 'travel'
  | 'learning'
  | 'social'
  | 'community';

export type OnboardingInterestItem = {
  id: string;
  /** i18n key suffix under onboarding.profileCompletion.interests.items.* */
  nameKey: string;
  /** English fallback / persistence display name */
  name: string;
  /** Ionicons name */
  icon: string;
  /** Hex color */
  iconColor: string;
  isOther?: boolean;
};

export type OnboardingMusicGroup = {
  id: string;
  nameKey: string;
  name: string;
  icon: string;
  iconColor: string;
  items: OnboardingInterestItem[];
};

export type OnboardingInterestCategory = {
  id: OnboardingInterestCategoryId;
  nameKey: string;
  name: string;
  /** Flat chips (all categories except music). */
  items?: OnboardingInterestItem[];
  /** Music & Entertainment two-level model. */
  groups?: OnboardingMusicGroup[];
};

function item(
  id: string,
  name: string,
  icon: string,
  iconColor: string,
  opts?: { isOther?: boolean },
): OnboardingInterestItem {
  return {
    id,
    name,
    nameKey: id,
    icon,
    iconColor,
    isOther: opts?.isOther,
  };
}

function group(
  id: string,
  name: string,
  icon: string,
  iconColor: string,
  items: OnboardingInterestItem[],
): OnboardingMusicGroup {
  return { id, name, nameKey: id, icon, iconColor, items };
}

export const ONBOARDING_INTEREST_CATEGORIES: OnboardingInterestCategory[] = [
  {
    id: 'business',
    name: 'Business & Career',
    nameKey: 'business',
    items: [
      item('business_entrepreneurship', 'Entrepreneurship', 'rocket-outline', '#7C3AED'),
      item('business_small_business', 'Small Business', 'storefront-outline', '#EA580C'),
      item('business_startups', 'Startups', 'flash-outline', '#CA8A04'),
      item('business_leadership', 'Leadership', 'ribbon-outline', '#2563EB'),
      item('business_marketing', 'Marketing', 'megaphone-outline', '#DB2777'),
      item('business_sales', 'Sales', 'cash-outline', '#16A34A'),
      item('business_real_estate', 'Real Estate', 'home-outline', '#0891B2'),
      item('business_investing', 'Investing', 'trending-up-outline', '#059669'),
      item('business_networking', 'Networking', 'git-network-outline', '#4F46E5'),
      item('business_women_in_business', 'Women in Business', 'woman-outline', '#C026D3'),
      item('business_family_business', 'Family Business', 'people-outline', '#0D9488'),
      item('business_franchising', 'Franchising', 'business-outline', '#DC2626'),
      item('business_other', 'Other', OTHER_ICON, OTHER_COLOR, { isOther: true }),
    ],
  },
  {
    id: 'technology',
    name: 'Technology & Innovation',
    nameKey: 'technology',
    items: [
      item('technology_ai', 'Artificial Intelligence', 'hardware-chip-outline', '#7C3AED'),
      item('technology_app_development', 'App Development', 'phone-portrait-outline', '#2563EB'),
      item('technology_software', 'Software', 'code-slash-outline', '#4F46E5'),
      item('technology_cybersecurity', 'Cybersecurity', 'shield-checkmark-outline', '#DC2626'),
      item('technology_digital_marketing', 'Digital Marketing', 'analytics-outline', '#DB2777'),
      item('technology_social_media', 'Social Media', 'share-social-outline', '#0891B2'),
      item('technology_content_creation', 'Content Creation', 'create-outline', '#EA580C'),
      item('technology_gaming', 'Gaming Technology', 'game-controller-outline', '#C026D3'),
      item('technology_web_design', 'Web Design', 'desktop-outline', '#0D9488'),
      item('technology_emerging', 'Emerging Technology', 'bulb-outline', '#CA8A04'),
      item('technology_other', 'Other', OTHER_ICON, OTHER_COLOR, { isOther: true }),
    ],
  },
  {
    id: 'arts',
    name: 'Arts & Creativity',
    nameKey: 'arts',
    items: [
      item('arts_photography', 'Photography', 'camera-outline', '#2563EB'),
      item('arts_painting', 'Painting', 'color-palette-outline', '#DB2777'),
      item('arts_drawing', 'Drawing', 'pencil-outline', '#EA580C'),
      item('arts_graphic_design', 'Graphic Design', 'color-wand-outline', '#7C3AED'),
      item('arts_fashion', 'Fashion', 'shirt-outline', '#C026D3'),
      item('arts_interior_design', 'Interior Design', 'bed-outline', '#0D9488'),
      item('arts_writing', 'Writing', 'document-text-outline', '#4F46E5'),
      item('arts_crafts', 'Crafts', 'cut-outline', '#CA8A04'),
      item('arts_acting', 'Acting', 'happy-outline', '#DC2626'),
      item('arts_dancing', 'Dancing', 'body-outline', '#DB2777'),
      item('arts_filmmaking', 'Filmmaking', 'videocam-outline', '#0891B2'),
      item('arts_architecture', 'Architecture', 'business-outline', '#059669'),
      item('arts_other', 'Other', OTHER_ICON, OTHER_COLOR, { isOther: true }),
    ],
  },
  {
    id: 'music',
    name: 'Music & Entertainment',
    nameKey: 'music',
    groups: [
      group('music_group_genres', 'Music Genres', 'musical-notes-outline', '#7C3AED', [
        item('music_genre_rock_alternative', 'Rock & Alternative', 'flash-outline', '#DC2626'),
        item('music_genre_latin', 'Latin Music', 'musical-note-outline', '#EA580C'),
        item('music_genre_pop', 'Pop', 'sparkles-outline', '#DB2777'),
        item('music_genre_hiphop_rnb', 'Hip-Hop & R&B', 'headset-outline', '#C026D3'),
        item('music_genre_electronic', 'Electronic Music', 'radio-outline', '#4F46E5'),
        item('music_genre_country_folk', 'Country & Folk', 'leaf-outline', '#16A34A'),
        item('music_genre_jazz_blues', 'Jazz & Blues', 'wine-outline', '#0891B2'),
        item('music_genre_classical', 'Classical & Instrumental', 'musical-notes-outline', '#7C3AED'),
        item('music_genre_caribbean_global', 'Caribbean & Global Music', 'globe-outline', '#0D9488'),
        item('music_genre_faith', 'Faith-Based Music', 'heart-outline', '#CA8A04'),
      ]),
      group('music_group_dance', 'Dance', 'footsteps-outline', '#DB2777', [
        item('music_dance_latin', 'Latin Dance', 'flame-outline', '#EA580C'),
        item('music_dance_ballroom', 'Ballroom Dance', 'diamond-outline', '#7C3AED'),
        item('music_dance_social', 'Social Dance', 'people-outline', '#2563EB'),
        item('music_dance_cultural', 'Cultural Dance', 'globe-outline', '#0D9488'),
        item('music_dance_modern', 'Modern Dance', 'flash-outline', '#C026D3'),
        item('music_dance_brazilian', 'Brazilian Dance', 'sunny-outline', '#CA8A04'),
      ]),
      group('music_group_live', 'Live Entertainment', 'mic-outline', '#EA580C', [
        item('music_live_events', 'Music Events', 'calendar-outline', '#2563EB'),
        item('music_live_concerts', 'Concerts', 'mic-outline', '#DB2777'),
        item('music_live_bands', 'Live Bands', 'musical-notes-outline', '#7C3AED'),
        item('music_live_festivals', 'Music Festivals', 'balloon-outline', '#EA580C'),
        item('music_live_local', 'Local Music', 'location-outline', '#059669'),
        item('music_live_open_mic', 'Open-Mic Nights', 'mic-circle-outline', '#0891B2'),
        item('music_live_karaoke', 'Karaoke', 'musical-note-outline', '#C026D3'),
      ]),
      group('music_group_performing', 'Performing Arts', 'ticket-outline', '#4F46E5', [
        item('music_performing_theater', 'Theater', 'ticket-outline', '#7C3AED'),
        item('music_performing_musicals', 'Musicals', 'musical-notes-outline', '#DB2777'),
        item('music_performing_opera', 'Opera', 'mic-outline', '#C026D3'),
        item('music_performing_ballet', 'Ballet', 'flower-outline', '#DB2777'),
        item('music_performing_dance', 'Dance Performances', 'body-outline', '#EA580C'),
      ]),
      group('music_group_movies_tv', 'Movies & Television', 'film-outline', '#0891B2', [
        item('music_movies_action', 'Action', 'flash-outline', '#DC2626'),
        item('music_movies_adventure', 'Adventure', 'compass-outline', '#EA580C'),
        item('music_movies_animation', 'Animation', 'sparkles-outline', '#C026D3'),
        item('music_movies_comedy', 'Comedy', 'happy-outline', '#CA8A04'),
        item('music_movies_crime', 'Crime', 'skull-outline', '#4F46E5'),
        item('music_movies_documentary', 'Documentary', 'newspaper-outline', '#0891B2'),
        item('music_movies_drama', 'Drama', 'film-outline', '#7C3AED'),
        item('music_movies_family', 'Family', 'people-outline', '#16A34A'),
        item('music_movies_fantasy', 'Fantasy', 'planet-outline', '#C026D3'),
        item('music_movies_horror', 'Horror', 'moon-outline', '#7C3AED'),
        item('music_movies_mystery', 'Mystery', 'search-outline', '#0D9488'),
        item('music_movies_romance', 'Romance', 'heart-outline', '#DB2777'),
        item('music_movies_scifi', 'Science Fiction', 'rocket-outline', '#2563EB'),
        item('music_movies_thriller', 'Thriller', 'pulse-outline', '#DC2626'),
        item('music_movies_western', 'Western', 'sunny-outline', '#CA8A04'),
        item('music_movies_tv_series', 'TV Series', 'tv-outline', '#4F46E5'),
        item('music_movies_reality', 'Reality TV', 'eye-outline', '#EA580C'),
        item('music_movies_talk', 'Talk Shows', 'chatbubbles-outline', '#0891B2'),
        item('music_movies_game', 'Game Shows', 'trophy-outline', '#CA8A04'),
        item('music_movies_streaming', 'Streaming Shows', 'play-circle-outline', '#059669'),
      ]),
    ],
  },
  {
    id: 'food',
    name: 'Food & Drink',
    nameKey: 'food',
    items: [
      item('food_cooking', 'Cooking', 'restaurant-outline', '#EA580C'),
      item('food_baking', 'Baking', 'cafe-outline', '#CA8A04'),
      item('food_restaurants', 'Restaurants', 'storefront-outline', '#DC2626'),
      item('food_coffee', 'Coffee', 'cafe-outline', '#7C3AED'),
      item('food_brunch', 'Brunch', 'sunny-outline', '#CA8A04'),
      item('food_trucks', 'Food Trucks', 'bus-outline', '#0891B2'),
      item('food_international', 'International Cuisine', 'globe-outline', '#0D9488'),
      item('food_healthy', 'Healthy Eating', 'nutrition-outline', '#16A34A'),
      item('food_bbq', 'Barbecue & Grilling', 'flame-outline', '#DC2626'),
      item('food_desserts', 'Desserts', 'ice-cream-outline', '#DB2777'),
      item('food_wine', 'Wine', 'wine-outline', '#C026D3'),
      item('food_craft_beverages', 'Craft Beverages', 'beer-outline', '#EA580C'),
      item('food_other', 'Other', OTHER_ICON, OTHER_COLOR, { isOther: true }),
    ],
  },
  {
    id: 'fitness',
    name: 'Fitness & Wellness',
    nameKey: 'fitness',
    items: [
      item('fitness_gym', 'Gym & Strength Training', 'barbell-outline', '#DC2626'),
      item('fitness_walking', 'Walking', 'walk-outline', '#16A34A'),
      item('fitness_running', 'Running', 'fitness-outline', '#EA580C'),
      item('fitness_yoga', 'Yoga', 'leaf-outline', '#059669'),
      item('fitness_pilates', 'Pilates', 'body-outline', '#7C3AED'),
      item('fitness_cycling', 'Cycling', 'bicycle-outline', '#2563EB'),
      item('fitness_swimming', 'Swimming', 'water-outline', '#0891B2'),
      item('fitness_meditation', 'Meditation', 'flower-outline', '#C026D3'),
      item('fitness_mental', 'Mental Wellness', 'happy-outline', '#4F46E5'),
      item('fitness_nutrition', 'Nutrition', 'nutrition-outline', '#16A34A'),
      item('fitness_personal_dev', 'Personal Development', 'trending-up-outline', '#0D9488'),
      item('fitness_spa', 'Spa & Self-Care', 'sparkles-outline', '#DB2777'),
      item('fitness_other', 'Other', OTHER_ICON, OTHER_COLOR, { isOther: true }),
    ],
  },
  {
    id: 'sports',
    name: 'Sports',
    nameKey: 'sports',
    items: [
      item('sports_football', 'Football', 'american-football-outline', '#EA580C'),
      item('sports_basketball', 'Basketball', 'basketball-outline', '#DC2626'),
      item('sports_baseball', 'Baseball', 'baseball-outline', '#2563EB'),
      item('sports_soccer', 'Soccer', 'football-outline', '#16A34A'),
      item('sports_tennis', 'Tennis', 'tennisball-outline', '#CA8A04'),
      item('sports_golf', 'Golf', 'golf-outline', '#059669'),
      item('sports_volleyball', 'Volleyball', 'football-outline', '#0891B2'),
      item('sports_hockey', 'Hockey', 'snow-outline', '#4F46E5'),
      item('sports_pickleball', 'Pickleball', 'tennisball-outline', '#0D9488'),
      item('sports_boxing', 'Boxing', 'fitness-outline', '#DC2626'),
      item('sports_motorsports', 'Motorsports', 'speedometer-outline', '#EA580C'),
      item('sports_college', 'College Sports', 'school-outline', '#7C3AED'),
      item('sports_other', 'Other', OTHER_ICON, OTHER_COLOR, { isOther: true }),
    ],
  },
  {
    id: 'outdoors',
    name: 'Outdoors & Adventure',
    nameKey: 'outdoors',
    items: [
      item('outdoors_hiking', 'Hiking', 'trail-sign-outline', '#16A34A'),
      item('outdoors_camping', 'Camping', 'bonfire-outline', '#EA580C'),
      item('outdoors_fishing', 'Fishing', 'fish-outline', '#0891B2'),
      item('outdoors_boating', 'Boating', 'boat-outline', '#2563EB'),
      item('outdoors_beaches', 'Beaches', 'umbrella-outline', '#CA8A04'),
      item('outdoors_parks', 'Parks', 'leaf-outline', '#059669'),
      item('outdoors_skiing', 'Skiing', 'snow-outline', '#4F46E5'),
      item('outdoors_snowboarding', 'Snowboarding', 'snow-outline', '#0891B2'),
      item('outdoors_gardening', 'Gardening', 'flower-outline', '#16A34A'),
      item('outdoors_nature', 'Nature', 'earth-outline', '#0D9488'),
      item('outdoors_road_trips', 'Road Trips', 'car-outline', '#DC2626'),
      item('outdoors_adventures', 'Outdoor Adventures', 'compass-outline', '#7C3AED'),
      item('outdoors_other', 'Other', OTHER_ICON, OTHER_COLOR, { isOther: true }),
    ],
  },
  {
    id: 'travel',
    name: 'Travel & Culture',
    nameKey: 'travel',
    items: [
      item('travel_international', 'International Travel', 'airplane-outline', '#2563EB'),
      item('travel_weekend', 'Weekend Getaways', 'calendar-outline', '#EA580C'),
      item('travel_luxury', 'Luxury Travel', 'diamond-outline', '#C026D3'),
      item('travel_budget', 'Budget Travel', 'wallet-outline', '#16A34A'),
      item('travel_cruises', 'Cruises', 'boat-outline', '#0891B2'),
      item('travel_local', 'Local Exploration', 'map-outline', '#0D9488'),
      item('travel_languages', 'Languages', 'language-outline', '#7C3AED'),
      item('travel_cultural', 'Cultural Experiences', 'globe-outline', '#DB2777'),
      item('travel_museums', 'Museums', 'library-outline', '#4F46E5'),
      item('travel_history', 'History', 'time-outline', '#CA8A04'),
      item('travel_immigration', 'Immigration Stories', 'earth-outline', '#059669'),
      item('travel_latin_culture', 'Latin Culture', 'flag-outline', '#DC2626'),
      item('travel_other', 'Other', OTHER_ICON, OTHER_COLOR, { isOther: true }),
    ],
  },
  {
    id: 'learning',
    name: 'Learning & Growth',
    nameKey: 'learning',
    items: [
      item('learning_books', 'Books', 'book-outline', '#2563EB'),
      item('learning_audiobooks', 'Audiobooks', 'headset-outline', '#7C3AED'),
      item('learning_personal_growth', 'Personal Growth', 'trending-up-outline', '#16A34A'),
      item('learning_professional', 'Professional Development', 'briefcase-outline', '#4F46E5'),
      item('learning_public_speaking', 'Public Speaking', 'mic-outline', '#EA580C'),
      item('learning_financial', 'Financial Education', 'cash-outline', '#059669'),
      item('learning_languages', 'Learning Languages', 'language-outline', '#0891B2'),
      item('learning_workshops', 'Workshops', 'construct-outline', '#CA8A04'),
      item('learning_mentorship', 'Mentorship', 'people-outline', '#0D9488'),
      item('learning_coaching', 'Coaching', 'ribbon-outline', '#DB2777'),
      item('learning_science', 'Science', 'flask-outline', '#C026D3'),
      item('learning_history', 'History', 'library-outline', '#DC2626'),
      item('learning_other', 'Other', OTHER_ICON, OTHER_COLOR, { isOther: true }),
    ],
  },
  {
    id: 'social',
    name: 'Social Life & Activities',
    nameKey: 'social',
    items: [
      item('social_meeting_people', 'Meeting New People', 'hand-left-outline', '#2563EB'),
      item('social_coffee_meetups', 'Coffee Meetups', 'cafe-outline', '#CA8A04'),
      item('social_dining_out', 'Dining Out', 'restaurant-outline', '#EA580C'),
      item('social_nightlife', 'Nightlife', 'moon-outline', '#7C3AED'),
      item('social_dancing', 'Dancing', 'musical-notes-outline', '#DB2777'),
      item('social_board_games', 'Board Games', 'dice-outline', '#4F46E5'),
      item('social_trivia', 'Trivia', 'help-circle-outline', '#0891B2'),
      item('social_community_events', 'Community Events', 'calendar-outline', '#0D9488'),
      item('social_festivals', 'Festivals', 'balloon-outline', '#C026D3'),
      item('social_shopping', 'Shopping', 'bag-handle-outline', '#DC2626'),
      item('social_networking_events', 'Networking Events', 'people-circle-outline', '#059669'),
      item('social_local_adventures', 'Local Adventures', 'compass-outline', '#16A34A'),
      item('social_other', 'Other', OTHER_ICON, OTHER_COLOR, { isOther: true }),
    ],
  },
  {
    id: 'community',
    name: 'Community, Family & Lifestyle',
    nameKey: 'community',
    items: [
      item('community_volunteering', 'Volunteering', 'heart-outline', '#DB2777'),
      item('community_service', 'Community Service', 'hand-left-outline', '#2563EB'),
      item('community_animal_welfare', 'Animal Welfare', 'paw-outline', '#EA580C'),
      item('community_sustainability', 'Sustainability', 'leaf-outline', '#16A34A'),
      item('community_parenting', 'Parenting', 'people-outline', '#7C3AED'),
      item('community_family', 'Family Activities', 'home-outline', '#0891B2'),
      item('community_pets', 'Pets', 'paw-outline', '#CA8A04'),
      item('community_dogs', 'Dogs', 'paw-outline', '#EA580C'),
      item('community_cats', 'Cats', 'paw-outline', '#C026D3'),
      item('community_home', 'Home Improvement', 'hammer-outline', '#4F46E5'),
      item('community_gardening', 'Gardening', 'flower-outline', '#059669'),
      item('community_local_causes', 'Local Causes', 'flag-outline', '#0D9488'),
      item('community_other', 'Other', OTHER_ICON, OTHER_COLOR, { isOther: true }),
    ],
  },
];

/** Controlled Ionicons catalog for custom interests (no free-text icons). */
export const ONBOARDING_CUSTOM_INTEREST_ICONS = [
  'star-outline',
  'heart-outline',
  'flame-outline',
  'leaf-outline',
  'musical-notes-outline',
  'camera-outline',
  'bicycle-outline',
  'airplane-outline',
  'book-outline',
  'briefcase-outline',
  'cafe-outline',
  'game-controller-outline',
  'globe-outline',
  'home-outline',
  'people-outline',
  'rocket-outline',
  'football-outline',
  'color-palette-outline',
  'hardware-chip-outline',
  'restaurant-outline',
] as const;

export type OnboardingCustomIconName =
  (typeof ONBOARDING_CUSTOM_INTEREST_ICONS)[number];

export type OnboardingSelectedInterest = {
  id: string;
  name: string;
  categoryId: OnboardingInterestCategoryId;
  icon: string;
  iconColor: string;
  isCustom?: boolean;
  /** Music group id when selected from Music & Entertainment level 2. */
  groupId?: string;
};

export function deterministicIconColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return CRJ_ICON_COLOR_PALETTE[hash % CRJ_ICON_COLOR_PALETTE.length]!;
}

/**
 * Strip undefined/null optionals so Firestore never receives undefined keys.
 * Required: id, name, categoryId, icon, iconColor.
 * Optional only when defined: isCustom (true only), groupId (non-empty string).
 */
export function sanitizeOnboardingInterestForPersistence(
  item: OnboardingSelectedInterest,
): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {
    id: item.id,
    name: item.name,
    categoryId: item.categoryId,
    icon: item.icon || 'star-outline',
    iconColor:
      item.iconColor || deterministicIconColor(item.id || item.name || 'interest'),
  };
  if (item.isCustom === true) {
    out.isCustom = true;
  }
  if (typeof item.groupId === 'string' && item.groupId.length > 0) {
    out.groupId = item.groupId;
  }
  return out;
}

export function assertNoUndefinedDeep(value: unknown, path = '$'): void {
  if (value === undefined) {
    throw new Error(`Undefined value at ${path}`);
  }
  if (value === null || typeof value !== 'object') {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      assertNoUndefinedDeep(entry, `${path}[${index}]`);
    });
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    assertNoUndefinedDeep(child, `${path}.${key}`);
  }
}

export function payloadContainsUndefined(value: unknown): boolean {
  if (value === undefined) return true;
  if (value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) {
    return value.some((entry) => payloadContainsUndefined(entry));
  }
  return Object.values(value as Record<string, unknown>).some((child) =>
    payloadContainsUndefined(child),
  );
}

/** Throws if any catalog item or music group is missing icon / iconColor. */
export function assertCatalogIconCoverage(): void {
  for (const cat of ONBOARDING_INTEREST_CATEGORIES) {
    if (cat.items) {
      for (const it of cat.items) {
        if (!it.icon?.trim() || !it.iconColor?.trim()) {
          throw new Error(
            `Catalog item missing icon/iconColor: ${it.id} (${cat.id})`,
          );
        }
      }
    }
    if (cat.groups) {
      for (const g of cat.groups) {
        if (!g.icon?.trim() || !g.iconColor?.trim()) {
          throw new Error(
            `Music group missing icon/iconColor: ${g.id}`,
          );
        }
        for (const it of g.items) {
          if (!it.icon?.trim() || !it.iconColor?.trim()) {
            throw new Error(
              `Catalog item missing icon/iconColor: ${it.id} (group ${g.id})`,
            );
          }
        }
      }
    }
  }
}

export function getOnboardingCategory(
  id: OnboardingInterestCategoryId,
): OnboardingInterestCategory {
  const found = ONBOARDING_INTEREST_CATEGORIES.find((c) => c.id === id);
  if (!found) {
    throw new Error(`Unknown onboarding interest category: ${id}`);
  }
  return found;
}

export function listOnboardingCategoryIds(): OnboardingInterestCategoryId[] {
  return ONBOARDING_INTEREST_CATEGORIES.map((c) => c.id);
}

export function slugifyInterestName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);
}

export function buildCustomInterestId(
  categoryId: OnboardingInterestCategoryId,
  name: string,
  nowMs: number = Date.now(),
): string {
  const slug = slugifyInterestName(name) || 'interest';
  return `custom_${categoryId}_${slug}_${nowMs}`;
}

export function normalizeCustomInterestName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

export function validateCustomInterestInput(input: {
  name: string;
  icon?: string | null;
  iconColor?: string | null;
  categoryId: OnboardingInterestCategoryId;
  existingInCategory: OnboardingSelectedInterest[];
}):
  | { ok: true; name: string; icon: string; iconColor: string }
  | { ok: false; reason: string } {
  const name = normalizeCustomInterestName(input.name);
  if (!name) {
    return { ok: false, reason: 'nameRequired' };
  }
  if (name.length > CUSTOM_INTEREST_MAX_LENGTH) {
    return { ok: false, reason: 'nameTooLong' };
  }
  if (!input.icon || !ONBOARDING_CUSTOM_INTEREST_ICONS.includes(input.icon as any)) {
    return { ok: false, reason: 'iconRequired' };
  }
  const duplicate = input.existingInCategory.some(
    (s) => s.name.trim().toLowerCase() === name.toLowerCase(),
  );
  if (duplicate) {
    return { ok: false, reason: 'duplicate' };
  }
  const iconColor =
    typeof input.iconColor === 'string' && input.iconColor.trim()
      ? input.iconColor.trim()
      : deterministicIconColor(name);
  return { ok: true, name, icon: input.icon, iconColor };
}

export function countSelectedInterests(
  selected: OnboardingSelectedInterest[],
): number {
  return countFinalOnboardingInterests(selected);
}

/**
 * Final selectable interests only (unique by id).
 * Music Level-1 groups are navigation-only and never enter `selected`.
 * The Other chip is not an interest until a custom entry is added.
 */
export function countFinalOnboardingInterests(
  selected: OnboardingSelectedInterest[],
): number {
  const ids = new Set<string>();
  for (const s of selected) {
    if (!s?.id) continue;
    // Guard: never count the Other placeholder chip (isOther catalog items
    // are not written into selected — only customs are).
    if (s.id.endsWith('_other') && !s.isCustom) continue;
    // Music Level-1 groups are navigation-only.
    if (s.id.startsWith('music_group_')) continue;
    ids.add(s.id);
  }
  return ids.size;
}

export function meetsMinimumOnboardingInterests(
  selected: OnboardingSelectedInterest[],
): boolean {
  return countFinalOnboardingInterests(selected) >= MIN_ONBOARDING_INTERESTS;
}

export function interestsRemainingToMinimum(
  selected: OnboardingSelectedInterest[],
): number {
  return Math.max(
    0,
    MIN_ONBOARDING_INTERESTS - countFinalOnboardingInterests(selected),
  );
}

/**
 * Flat catalog items for lookup (excludes Other placeholders).
 * Each item includes icon + iconColor.
 */
export function flattenCatalogInterestItems(): OnboardingInterestItem[] {
  const out: OnboardingInterestItem[] = [];
  for (const cat of ONBOARDING_INTEREST_CATEGORIES) {
    if (cat.items) {
      for (const it of cat.items) {
        if (!it.isOther) out.push(it);
      }
    }
    if (cat.groups) {
      for (const g of cat.groups) {
        out.push(...g.items);
      }
    }
  }
  return out;
}

/**
 * Bridge for MVP matching readers (Alerts / Nearby affinity):
 * case-insensitive string labels in personalInterests / professionalInterests.
 *
 * Detailed CRJ context (categoryId, groupId, icon, iconColor, isCustom) is stored separately
 * in personalOnboardingInterests / professionalOnboardingInterests.
 *
 * Does NOT write personalInterestAffiliations / professionalInterestAffiliations —
 * those remain legacy InterestLabel maps for the in-app InterestsScreen / ProfileDetail.
 * INTERNAL INTERESTS MIGRATION — pending
 * CUSTOM INTEREST MATCHING — pending (customs persist + string-match only)
 */
export function selectedInterestsToLabelList(
  selected: OnboardingSelectedInterest[],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of selected) {
    if (s.id.endsWith('_other') && !s.isCustom) continue;
    if (s.id.startsWith('music_group_')) continue;
    const name = (s.name || '').trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

export type CrjInterestPersistencePatch = {
  personalInterests?: string[];
  professionalInterests?: string[];
  personalOnboardingInterests?: Record<string, string | boolean>[];
  professionalOnboardingInterests?: Record<string, string | boolean>[];
  profileSetupCompleted: false;
};

/**
 * Minimal CRJ write for matching compatibility.
 * Writes labels for active mode only; never contaminates the opposite mode;
 * never invents legacy InterestAffiliations.
 * Detailed rows are sanitized so Firestore never receives undefined keys.
 */
export function buildCrjInterestPersistencePatch(
  mode: 'personal' | 'professional',
  selected: OnboardingSelectedInterest[],
): CrjInterestPersistencePatch {
  const labels = selectedInterestsToLabelList(selected);
  const detailed = selected
    .filter(
      (s) =>
        !(s.id.endsWith('_other') && !s.isCustom) &&
        !s.id.startsWith('music_group_'),
    )
    .map(sanitizeOnboardingInterestForPersistence);

  if (mode === 'personal') {
    return {
      profileSetupCompleted: false,
      personalInterests: labels,
      personalOnboardingInterests: detailed,
    };
  }
  return {
    profileSetupCompleted: false,
    professionalInterests: labels,
    professionalOnboardingInterests: detailed,
  };
}

/** True when a Music selection retained hierarchy context. */
export function isMusicHierarchySelection(
  item: OnboardingSelectedInterest,
): boolean {
  return item.categoryId === 'music' && !!item.groupId && !!item.id;
}

/**
 * CHG-INT-01 — selectable 2.0.4 catalog + legacy display compatibility.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ONBOARDING_INTEREST_CATEGORIES,
  buildPostCrjInterestPersistencePatch,
  flattenCatalogInterestItems,
  getOnboardingCategory,
  getSelectableCatalogInterestIdSet,
  isSelectableCatalogInterestId,
  type OnboardingSelectedInterest,
} from '../interests/onboardingInterestCatalog';
import {
  DEPRECATED_INTEREST_IDS,
  LEGACY_DISPLAY_INTEREST_ITEMS,
  isLegacyDisplayInterestId,
  resolveLegacyDisplayInterestItem,
} from '../interests/interestLegacyCatalog';
import {
  readOnboardingInterestsFromDoc,
} from '../interests/postCrjInterestEditor';
import {
  resolveCatalogOrLegacyInterestItem,
  resolveInterestChip,
  resolveInterestChips,
} from '../visibility/interestDisplay';
import enOnboarding from '../i18n/resources/onboarding';
import es from '../i18n/locales/es';

const translateItem = (nameKey: string, fallback: string) => fallback;

function namesOf(categoryId: string, groupId?: string): string[] {
  const cat = getOnboardingCategory(categoryId as any);
  if (groupId) {
    const group = cat.groups!.find((g) => g.id === groupId)!;
    return group.items.filter((i) => !i.isOther).map((i) => i.name);
  }
  return (cat.items ?? []).filter((i) => !i.isOther).map((i) => i.name);
}

function idsOf(categoryId: string, groupId?: string): string[] {
  const cat = getOnboardingCategory(categoryId as any);
  if (groupId) {
    const group = cat.groups!.find((g) => g.id === groupId)!;
    return group.items.filter((i) => !i.isOther).map((i) => i.id);
  }
  return (cat.items ?? []).filter((i) => !i.isOther).map((i) => i.id);
}

test('CHG-INT-01: Business selectable catalog matches objective', () => {
  assert.deepEqual(namesOf('business'), [
    'Entrepreneurship',
    'Small businesses',
    'Startups',
    'Leadership',
    'Marketing',
    'Sales',
    'Real estate',
    'Investments',
    'Networking',
    'Franchises',
  ]);
});

test('CHG-INT-01: Technology selectable catalog matches objective', () => {
  assert.deepEqual(namesOf('technology'), [
    'Artificial intelligence',
    'Software development',
    'Cybersecurity',
    'Digital innovation',
    'Robotics',
    'Gaming',
    'Crypto',
    'Social media',
    'Web design',
    'Emerging technology',
  ]);
});

test('CHG-INT-01: Music genres / dance / live match objective', () => {
  assert.deepEqual(namesOf('music', 'music_group_genres'), [
    'Rock and alternative',
    'Pop',
    'Electronic music',
    'Country and folk',
    'Jazz and blues',
    'Instrumental music',
    'Faith music',
    'Latin music',
  ]);
  assert.deepEqual(namesOf('music', 'music_group_dance'), [
    'Salsa',
    'Bachata',
    'Hip hop',
    'Contemporary dance',
    'Ballroom',
    'Ballet',
  ]);
  assert.deepEqual(namesOf('music', 'music_group_live'), [
    'Musical events',
    'Concerts',
    'Music festivals',
    'Karaoke',
  ]);
});

test('CHG-INT-01: Food dietary + cuisines match objective; 4 groups retained', () => {
  const food = getOnboardingCategory('food');
  assert.equal(food.groups!.length, 4);
  assert.deepEqual(namesOf('food', 'food_group_dietary'), [
    'Vegan',
    'Vegetarian',
    'Keto',
    'Kosher',
    'Gluten-free',
    'Dairy-free',
    'Organic',
    'Halal',
    'Plant-based',
    'Flexitarian',
    'Pescatarian',
  ]);
  assert.deepEqual(namesOf('food', 'food_group_cuisines'), [
    'Italian',
    'Mexican',
    'Latin American',
    'Caribbean',
    'Mediterranean',
    'Indian',
    'Japanese',
    'Chinese',
    'Thai',
    'American',
    'Middle Eastern',
    'African',
  ]);
});

test('CHG-INT-01: Fitness selectable catalog matches objective', () => {
  assert.deepEqual(namesOf('fitness'), [
    'Neighborhood activities',
    'Gym and strength training',
    'Walking',
    'Running',
    'Yoga',
    'Pilates',
    'Cycling',
    'Swimming',
    'Meditation',
    'Mental well-being',
    'Nutrition',
    'Personal development',
    'Spa and self-care',
  ]);
});

test('CHG-INT-01: Music keeps six groups; out-of-scope groups intact', () => {
  const music = getOnboardingCategory('music');
  assert.equal(music.groups!.length, 6);
  assert.ok(music.groups!.some((g) => g.id === 'music_group_performing'));
  assert.ok(music.groups!.some((g) => g.id === 'music_group_movies_tv'));
  assert.ok(music.groups!.some((g) => g.id === 'music_group_anime'));
  const performing = music.groups!.find((g) => g.id === 'music_group_performing')!;
  assert.deepEqual(
    performing.items.filter((i) => !i.isOther).map((i) => i.id),
    [
      'music_performing_theater',
      'music_performing_musicals',
      'music_performing_opera',
      'music_performing_dance',
    ],
  );
});

test('CHG-INT-01: Other remains composer-only (isOther, not in flatten)', () => {
  const flat = new Set(flattenCatalogInterestItems().map((i) => i.id));
  for (const cat of ONBOARDING_INTEREST_CATEGORIES) {
    for (const it of cat.items ?? []) {
      if (it.isOther) {
        assert.equal(flat.has(it.id), false);
      }
    }
    for (const g of cat.groups ?? []) {
      for (const it of g.items) {
        if (it.isOther) {
          assert.equal(flat.has(it.id), false);
        }
      }
    }
  }
});

test('CHG-INT-01: deprecated IDs are not selectable', () => {
  for (const id of DEPRECATED_INTEREST_IDS) {
    assert.equal(isSelectableCatalogInterestId(id), false);
    assert.equal(getSelectableCatalogInterestIdSet().has(id), false);
  }
});

test('CHG-INT-01: deprecated IDs resolve display without crash', () => {
  for (const id of DEPRECATED_INTEREST_IDS) {
    const chip = resolveInterestChip(id, translateItem);
    assert.ok(chip, id);
    assert.equal(chip!.id, id);
    assert.ok(chip!.label);
  }
});

test('CHG-INT-01: transitional merge sources resolve temporally', () => {
  assert.ok(resolveLegacyDisplayInterestItem('technology_app_development'));
  assert.ok(resolveInterestChip('technology_app_development', translateItem));
  assert.ok(resolveInterestChip('food_cuisine_costa_rican', translateItem));
  assert.ok(resolveInterestChip('food_cuisine_colombian', translateItem));
  assert.ok(resolveInterestChip('food_cuisine_brazilian', translateItem));
  assert.ok(resolveInterestChip('music_dance_modern', translateItem));
});

test('CHG-INT-01: ballet only in Dance and keeps ID', () => {
  assert.deepEqual(idsOf('music', 'music_group_dance').filter((id) => id.includes('ballet')), [
    'music_performing_ballet',
  ]);
  const performing = idsOf('music', 'music_group_performing');
  assert.equal(performing.includes('music_performing_ballet'), false);
  assert.equal(isSelectableCatalogInterestId('music_performing_ballet'), true);
});

test('CHG-INT-01: Instrumental music keeps music_genre_classical', () => {
  const classical = flattenCatalogInterestItems().find(
    (i) => i.id === 'music_genre_classical',
  );
  assert.ok(classical);
  assert.equal(classical!.name, 'Instrumental music');
});

test('CHG-INT-01: new IDs unique vs selectable + legacy + customs prefix', () => {
  const newIds = [
    'technology_digital_innovation',
    'technology_robotics',
    'technology_crypto',
    'music_dance_salsa',
    'music_dance_bachata',
    'music_dance_hip_hop',
    'music_dance_contemporary',
    'food_dietary_organic',
    'food_dietary_pescatarian',
    'food_cuisine_latin_american',
    'fitness_neighborhood_activities',
  ];
  const selectable = flattenCatalogInterestItems().map((i) => i.id);
  const legacy = LEGACY_DISPLAY_INTEREST_ITEMS.map((i) => i.id);
  const all = [...selectable, ...legacy];
  assert.equal(all.length, new Set(all).size);
  for (const id of newIds) {
    assert.ok(selectable.includes(id), id);
    assert.equal(isLegacyDisplayInterestId(id), false);
    assert.ok(!id.startsWith('custom_'));
  }
  assert.equal(isSelectableCatalogInterestId('music_genre_reggaeton'), false);
  assert.equal(isLegacyDisplayInterestId('music_genre_reggaeton'), true);
});

test('CHG-INT-01: new/renamed IDs have EN and ES i18n', () => {
  const keys = [
    'technology_digital_innovation',
    'technology_robotics',
    'technology_crypto',
    'music_genre_reggaeton',
    'music_dance_salsa',
    'music_dance_bachata',
    'music_dance_hip_hop',
    'music_dance_contemporary',
    'food_dietary_organic',
    'food_dietary_pescatarian',
    'food_cuisine_latin_american',
    'fitness_neighborhood_activities',
    'music_genre_classical',
    'business_small_business',
    'technology_software',
    'fitness_mental',
  ];
  const enItems = (enOnboarding as any).profileCompletion.interests.items;
  const esItems = (es as any).onboarding.profileCompletion.interests.items;
  for (const key of keys) {
    assert.equal(typeof enItems[key], 'string', `EN missing ${key}`);
    assert.equal(typeof esItems[key], 'string', `ES missing ${key}`);
    assert.ok(enItems[key].length > 0);
    assert.ok(esItems[key].length > 0);
  }
});

test('CHG-INT-01: unknown ID still omitted safely', () => {
  const pills = resolveInterestChips(
    ['technology_ai', 'not_in_catalog_xyz', 'business_women_in_business'],
    translateItem,
  );
  assert.deepEqual(
    pills.map((p) => p.id),
    ['technology_ai', 'business_women_in_business'],
  );
  assert.equal(resolveCatalogOrLegacyInterestItem('totally_unknown'), undefined);
});

test('CHG-INT-01: post-CRJ edit preserves deprecated + custom on save', () => {
  const loaded = readOnboardingInterestsFromDoc(
    {
      personalOnboardingInterests: [
        {
          id: 'business_women_in_business',
          name: 'Women in Business',
          categoryId: 'business',
          icon: 'woman-outline',
          iconColor: '#C026D3',
        },
        {
          id: 'technology_ai',
          name: 'Artificial intelligence',
          categoryId: 'technology',
          icon: 'hardware-chip-outline',
          iconColor: '#7C3AED',
        },
        {
          id: 'custom_business_my_thing_1',
          name: 'My Thing',
          categoryId: 'business',
          icon: 'star-outline',
          iconColor: '#CA8A04',
          isCustom: true,
        },
        {
          id: 'technology_app_development',
          name: 'App Development',
          categoryId: 'technology',
          icon: 'phone-portrait-outline',
          iconColor: '#2563EB',
        },
      ],
    },
    'personal',
  );
  assert.equal(loaded.length, 4);

  // Simulate editing another selectable interest while keeping deprecated rows.
  const draft: OnboardingSelectedInterest[] = [
    ...loaded,
    {
      id: 'business_networking',
      name: 'Networking',
      categoryId: 'business',
      icon: 'git-network-outline',
      iconColor: '#4F46E5',
    },
  ];
  const patch = buildPostCrjInterestPersistencePatch('personal', draft);
  const ids = (patch.personalOnboardingInterests ?? []).map((r) => r.id);
  assert.ok(ids.includes('business_women_in_business'));
  assert.ok(ids.includes('technology_app_development'));
  assert.ok(ids.includes('custom_business_my_thing_1'));
  assert.ok(ids.includes('business_networking'));
  assert.ok(ids.includes('technology_ai'));
  assert.equal(isSelectableCatalogInterestId('business_women_in_business'), false);
});

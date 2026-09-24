import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ONBOARDING_INTEREST_CATEGORIES,
  flattenCatalogInterestItems,
  getOnboardingCategory,
  buildCustomInterestId,
  countFinalOnboardingInterests,
  selectedInterestsToLabelList,
  type OnboardingSelectedInterest,
} from '../interests/onboardingInterestCatalog.ts';
import {
  DEPRECATED_INTEREST_DISPLAY_ITEMS,
  getDeprecatedInterestDisplayItem,
  isDeprecatedInterestId,
  isSelectableCatalogInterestId,
  listDeprecatedInterestIds,
  lookupInterestItemForDisplay,
  preserveOnboardingInterestsForEditor,
  resetInterestCatalogLookupCaches,
} from '../interests/onboardingInterestLegacyCatalog.ts';
import {
  assertKnownHierarchicalCategories,
  getHierarchicalGroups,
} from '../interests/interestHierarchy.ts';
import { isOtherComposerOpen } from '../components/registration/interestOtherScope.ts';
import { onboardingTranslations } from '../i18n/resources/onboarding.ts';

resetInterestCatalogLookupCaches();

function resolveChipsForTest(
  ids: readonly string[],
  translateItem: (nameKey: string, fallback: string) => string,
) {
  const out: { id: string; label: string }[] = [];
  for (const id of ids) {
    const item = lookupInterestItemForDisplay(id);
    if (!item) continue;
    out.push({ id, label: translateItem(item.nameKey, item.name) });
  }
  return out;
}

const NEW_IDS = [
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
] as const;

function idsOf(categoryId: string): string[] {
  const cat = getOnboardingCategory(categoryId as any);
  if (cat.items) return cat.items.filter((i) => !i.isOther).map((i) => i.id);
  return [];
}

function groupItemIds(categoryId: string, groupId: string): string[] {
  const cat = getOnboardingCategory(categoryId as any);
  const group = cat.groups?.find((g) => g.id === groupId);
  assert.ok(group, `missing group ${groupId}`);
  return group!.items.filter((i) => !i.isOther).map((i) => i.id);
}

function itemName(categoryId: string, id: string): string {
  const flat = flattenCatalogInterestItems();
  const found = flat.find((i) => i.id === id);
  if (found) return found.name;
  const cat = getOnboardingCategory(categoryId as any);
  const fromFlat = cat.items?.find((i) => i.id === id);
  if (fromFlat) return fromFlat.name;
  for (const g of cat.groups ?? []) {
    const it = g.items.find((i) => i.id === id);
    if (it) return it.name;
  }
  throw new Error(`missing ${id}`);
}

test('CHG-INT-01: Business selectable catalog exact', () => {
  assert.deepEqual(idsOf('business'), [
    'business_entrepreneurship',
    'business_small_business',
    'business_startups',
    'business_leadership',
    'business_marketing',
    'business_sales',
    'business_real_estate',
    'business_investing',
    'business_networking',
    'business_franchising',
  ]);
  assert.equal(itemName('business', 'business_small_business'), 'Small businesses');
  assert.equal(itemName('business', 'business_investing'), 'Investments');
  assert.equal(itemName('business', 'business_franchising'), 'Franchises');
});

test('CHG-INT-01: Technology selectable catalog exact', () => {
  assert.deepEqual(idsOf('technology'), [
    'technology_ai',
    'technology_software',
    'technology_cybersecurity',
    'technology_digital_innovation',
    'technology_robotics',
    'technology_gaming',
    'technology_crypto',
    'technology_social_media',
    'technology_web_design',
    'technology_emerging',
  ]);
  assert.equal(itemName('technology', 'technology_software'), 'Software development');
  assert.equal(itemName('technology', 'technology_gaming'), 'Gaming');
});

test('CHG-INT-01: Music genres / dance / live exact', () => {
  assert.deepEqual(groupItemIds('music', 'music_group_genres'), [
    'music_genre_rock_alternative',
    'music_genre_pop',
    'music_genre_electronic',
    'music_genre_country_folk',
    'music_genre_jazz_blues',
    'music_genre_classical',
    'music_genre_faith',
    'music_genre_latin',
  ]);
  assert.equal(itemName('music', 'music_genre_classical'), 'Instrumental music');
  assert.deepEqual(groupItemIds('music', 'music_group_dance'), [
    'music_dance_salsa',
    'music_dance_bachata',
    'music_dance_hip_hop',
    'music_dance_contemporary',
    'music_dance_ballroom',
    'music_performing_ballet',
  ]);
  assert.deepEqual(groupItemIds('music', 'music_group_live'), [
    'music_live_events',
    'music_live_concerts',
    'music_live_festivals',
    'music_live_karaoke',
  ]);
});

test('CHG-INT-01: Food dietary / cuisines exact', () => {
  assert.deepEqual(groupItemIds('food', 'food_group_dietary'), [
    'food_dietary_vegan',
    'food_dietary_vegetarian',
    'food_dietary_keto',
    'food_dietary_kosher',
    'food_dietary_gluten_free',
    'food_dietary_dairy_free',
    'food_dietary_organic',
    'food_dietary_halal',
    'food_dietary_plant_based',
    'food_dietary_flexitarian',
    'food_dietary_pescatarian',
  ]);
  assert.deepEqual(groupItemIds('food', 'food_group_cuisines'), [
    'food_cuisine_italian',
    'food_cuisine_mexican',
    'food_cuisine_latin_american',
    'food_cuisine_caribbean',
    'food_cuisine_mediterranean',
    'food_cuisine_indian',
    'food_cuisine_japanese',
    'food_cuisine_chinese',
    'food_cuisine_thai',
    'food_cuisine_american',
    'food_cuisine_middle_eastern',
    'food_cuisine_african',
  ]);
});

test('CHG-INT-01: Fitness selectable catalog exact', () => {
  assert.deepEqual(idsOf('fitness'), [
    'fitness_neighborhood_activities',
    'fitness_gym',
    'fitness_walking',
    'fitness_running',
    'fitness_yoga',
    'fitness_pilates',
    'fitness_cycling',
    'fitness_swimming',
    'fitness_meditation',
    'fitness_mental',
    'fitness_nutrition',
    'fitness_personal_dev',
    'fitness_spa',
  ]);
  assert.equal(itemName('fitness', 'fitness_mental'), 'Mental well-being');
});

test('CHG-INT-01: Music keeps 6 groups; Food keeps 4; out-of-scope intact', () => {
  const music = getOnboardingCategory('music');
  const food = getOnboardingCategory('food');
  assert.equal(getHierarchicalGroups(music).length, 6);
  assert.equal(getHierarchicalGroups(food).length, 4);
  assert.doesNotThrow(() =>
    assertKnownHierarchicalCategories(ONBOARDING_INTEREST_CATEGORIES),
  );
  const performing = music.groups!.find((g) => g.id === 'music_group_performing')!;
  assert.ok(performing.items.some((i) => i.id === 'music_performing_theater'));
  assert.ok(!performing.items.some((i) => i.id === 'music_performing_ballet'));
  assert.ok(music.groups!.some((g) => g.id === 'music_group_movies_tv'));
  assert.ok(music.groups!.some((g) => g.id === 'music_group_anime'));
  assert.ok(food.groups!.some((g) => g.id === 'food_group_experiences'));
  assert.ok(food.groups!.some((g) => g.id === 'food_group_beverages'));
  for (const id of [
    'arts',
    'sports_outdoors',
    'travel',
    'learning',
    'social',
    'community',
  ]) {
    assert.ok(ONBOARDING_INTEREST_CATEGORIES.some((c) => c.id === id));
  }
});

test('CHG-INT-01: Ballet selectable only in Dance with stable ID', () => {
  const dance = groupItemIds('music', 'music_group_dance');
  assert.ok(dance.includes('music_performing_ballet'));
  const performing = groupItemIds('music', 'music_group_performing');
  assert.ok(!performing.includes('music_performing_ballet'));
  assert.equal(isSelectableCatalogInterestId('music_performing_ballet'), true);
});

test('CHG-INT-01: new IDs unique and selectable', () => {
  const all = flattenCatalogInterestItems().map((i) => i.id);
  const set = new Set(all);
  assert.equal(set.size, all.length);
  for (const id of NEW_IDS) {
    assert.ok(set.has(id), `missing new id ${id}`);
    assert.equal(isDeprecatedInterestId(id), false);
  }
});

test('CHG-INT-01: deprecated not selectable but resolvable', () => {
  for (const id of listDeprecatedInterestIds()) {
    assert.equal(isSelectableCatalogInterestId(id), false, id);
    assert.equal(isDeprecatedInterestId(id), true, id);
    assert.ok(lookupInterestItemForDisplay(id), id);
  }
  assert.ok(getDeprecatedInterestDisplayItem('technology_app_development'));
  assert.ok(getDeprecatedInterestDisplayItem('food_cuisine_costa_rican'));
  assert.ok(getDeprecatedInterestDisplayItem('music_dance_modern'));
});

test('CHG-INT-01: future merge sources remain legacy-readable', () => {
  assert.equal(
    lookupInterestItemForDisplay('technology_app_development')?.name,
    'App Development',
  );
  assert.equal(
    lookupInterestItemForDisplay('food_cuisine_colombian')?.name,
    'Colombian',
  );
  assert.equal(
    lookupInterestItemForDisplay('music_dance_modern')?.name,
    'Modern Dance',
  );
});

test('CHG-INT-01: Other is composer-only and not persisted as interest', () => {
  assert.equal(isOtherComposerOpen(null), false);
  const other: OnboardingSelectedInterest = {
    id: 'business_other',
    name: 'Other',
    categoryId: 'business',
    icon: 'add-circle-outline',
    iconColor: '#0891B2',
  };
  assert.equal(countFinalOnboardingInterests([other]), 0);
  assert.deepEqual(selectedInterestsToLabelList([other]), []);
});

test('CHG-INT-01: unknown IDs omitted; deprecated resolve in Discovery chips', () => {
  const translate = (_k: string, fb: string) => fb;
  const chips = resolveChipsForTest(
    [
      'technology_ai',
      'technology_app_development',
      'not_in_catalog_xyz',
      'music_genre_classical',
    ],
    translate,
  );
  assert.deepEqual(
    chips.map((c) => c.id),
    ['technology_ai', 'technology_app_development', 'music_genre_classical'],
  );
  assert.equal(
    chips.find((c) => c.id === 'music_genre_classical')?.label,
    'Instrumental music',
  );
});

test('CHG-INT-01: editor preserves deprecated + customs; drops unknown', () => {
  const rows: OnboardingSelectedInterest[] = [
    {
      id: 'technology_ai',
      name: 'Artificial intelligence',
      categoryId: 'technology',
      icon: 'hardware-chip-outline',
      iconColor: '#7C3AED',
    },
    {
      id: 'technology_app_development',
      name: 'App Development',
      categoryId: 'technology',
      icon: 'phone-portrait-outline',
      iconColor: '#2563EB',
    },
    {
      id: buildCustomInterestId('technology', 'My gadget'),
      name: 'My gadget',
      categoryId: 'technology',
      icon: 'star-outline',
      iconColor: '#CA8A04',
      isCustom: true,
    },
    {
      id: 'totally_unknown_zzz',
      name: 'Ghost',
      categoryId: 'technology',
      icon: 'star-outline',
      iconColor: '#000',
    },
  ];
  const kept = preserveOnboardingInterestsForEditor(rows);
  assert.deepEqual(
    kept.map((r) => r.id).filter((id) => !id.startsWith('custom_')),
    ['technology_ai', 'technology_app_development'],
  );
  assert.equal(kept.some((r) => r.isCustom), true);
  assert.ok(!kept.some((r) => r.id === 'totally_unknown_zzz'));
});

test('CHG-INT-01: i18n EN/ES coverage for focal keys', () => {
  const en = onboardingTranslations.en.profileCompletion.interests
    .items as Record<string, string>;
  const es = onboardingTranslations.es.profileCompletion.interests
    .items as Record<string, string>;
  const required: Record<string, { en: string; es: string }> = {
    business_small_business: { en: 'Small businesses', es: 'Pequeños negocios' },
    business_investing: { en: 'Investments', es: 'Inversiones' },
    business_franchising: { en: 'Franchises', es: 'Franquicias' },
    technology_ai: { en: 'Artificial intelligence', es: 'Inteligencia artificial' },
    technology_software: { en: 'Software development', es: 'Desarrollo de software' },
    technology_digital_innovation: {
      en: 'Digital innovation',
      es: 'Innovación digital',
    },
    technology_robotics: { en: 'Robotics', es: 'Robótica' },
    technology_gaming: { en: 'Gaming', es: 'Gaming' },
    technology_crypto: { en: 'Crypto', es: 'Cripto' },
    technology_social_media: { en: 'Social media', es: 'Redes sociales' },
    music_genre_classical: {
      en: 'Instrumental music',
      es: 'Música instrumental',
    },
    music_genre_faith: { en: 'Faith music', es: 'Música de fe' },
    music_genre_reggaeton: { en: 'Reggaeton', es: 'Reguetón' },
    music_dance_contemporary: {
      en: 'Contemporary dance',
      es: 'Danza contemporánea',
    },
    music_dance_ballroom: { en: 'Ballroom', es: 'Baile de salón' },
    music_live_events: { en: 'Musical events', es: 'Eventos musicales' },
    food_dietary_organic: { en: 'Organic', es: 'Orgánico' },
    food_dietary_pescatarian: { en: 'Pescatarian', es: 'Pescetariano' },
    food_cuisine_latin_american: {
      en: 'Latin American',
      es: 'Latinoamericana',
    },
    fitness_neighborhood_activities: {
      en: 'Neighborhood activities',
      es: 'Actividades del barrio',
    },
    fitness_gym: {
      en: 'Gym and strength training',
      es: 'Gimnasio y entrenamiento de fuerza',
    },
    fitness_mental: { en: 'Mental well-being', es: 'Bienestar mental' },
  };
  for (const [key, expected] of Object.entries(required)) {
    assert.equal(en[key], expected.en, `EN ${key}`);
    assert.equal(es[key], expected.es, `ES ${key}`);
  }
  for (const id of NEW_IDS) {
    assert.ok(en[id], `EN missing ${id}`);
    assert.ok(es[id], `ES missing ${id}`);
  }
  for (const item of DEPRECATED_INTEREST_DISPLAY_ITEMS) {
    assert.ok(en[item.id] || item.name, `legacy display ${item.id}`);
  }
});

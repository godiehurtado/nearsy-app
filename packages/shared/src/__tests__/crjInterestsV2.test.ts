import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MIN_ONBOARDING_INTERESTS,
  ONBOARDING_INTEREST_CATEGORIES,
  assertCatalogIconCoverage,
  assertNoUndefinedDeep,
  buildCrjInterestPersistencePatch,
  buildCustomInterestId,
  countFinalOnboardingInterests,
  flattenCatalogInterestItems,
  getOnboardingCategory,
  interestsRemainingToMinimum,
  listOnboardingCategoryIds,
  meetsMinimumOnboardingInterests,
  payloadContainsUndefined,
  validateCustomInterestInput,
  ONBOARDING_CUSTOM_INTEREST_ICON_OPTIONS,
  ONBOARDING_CUSTOM_INTEREST_ICONS,
  resolveCustomInterestIconColor,
  type OnboardingSelectedInterest,
} from '../interests/onboardingInterestCatalog';
import {
  FLAT_OTHER_SCOPE,
  isOtherComposerOpen,
  otherScopeForGroup,
} from '../components/registration/interestOtherScope';

test('CRJ-I5 catalog: exactly 11 top-level categories', () => {
  assert.equal(ONBOARDING_INTEREST_CATEGORIES.length, 11);
  assert.equal(listOnboardingCategoryIds().length, 11);
});

test('CRJ-I5 catalog: no separate Sports or Outdoors categories', () => {
  const ids = listOnboardingCategoryIds();
  assert.ok(!ids.includes('sports' as any));
  assert.ok(!ids.includes('outdoors' as any));
  assert.ok(ids.includes('sports_outdoors'));
});

test('CRJ-I5 catalog: merged Sports, Outdoors & Adventure name', () => {
  const cat = getOnboardingCategory('sports_outdoors');
  assert.equal(cat.name, 'Sports, Outdoors & Adventure');
});

test('CRJ-I5 catalog: Music hierarchical with 6 groups including Anime', () => {
  const music = getOnboardingCategory('music');
  assert.ok(music.groups);
  assert.equal(music.groups.length, 6);
  assert.ok(music.groups.some((g) => g.id === 'music_group_anime'));
  const anime = music.groups.find((g) => g.id === 'music_group_anime')!;
  assert.ok(anime.items.some((i) => i.id === 'music_anime_series'));
});

test('CRJ-I5 catalog: Food hierarchical with 4 groups / 42 items', () => {
  const food = getOnboardingCategory('food');
  assert.ok(food.groups);
  assert.equal(food.groups.length, 4);
  const itemCount = food.groups.reduce((n, g) => n + g.items.filter((i) => !i.isOther).length, 0);
  assert.equal(itemCount, 42);
  assert.equal(food.name, 'Food, Dining & Dietary Lifestyle');
});

test('CRJ-I5 catalog: Sports/Outdoors hierarchical with 2 groups / 24 items', () => {
  const cat = getOnboardingCategory('sports_outdoors');
  assert.ok(cat.groups);
  assert.equal(cat.groups.length, 2);
  const itemCount = cat.groups.reduce(
    (n, g) => n + g.items.filter((i) => !i.isOther).length,
    0,
  );
  assert.equal(itemCount, 24);
});

test('CRJ-I5 catalog: all flat categories have Other', () => {
  for (const cat of ONBOARDING_INTEREST_CATEGORIES) {
    if (cat.items) {
      assert.ok(cat.items.some((i) => i.isOther), `${cat.id} missing Other`);
    }
  }
});

test('CRJ-I5 catalog: all hierarchical groups have Other', () => {
  for (const cat of ONBOARDING_INTEREST_CATEGORIES) {
    for (const group of cat.groups ?? []) {
      assert.ok(
        group.items.some((i) => i.isOther),
        `${cat.id}/${group.id} missing Other`,
      );
    }
  }
});

test('CRJ-I5 catalog: icon coverage for all items and groups', () => {
  assert.doesNotThrow(() => assertCatalogIconCoverage());
});

test('CRJ-I5 catalog: globally unique canonical item ids', () => {
  const ids = flattenCatalogInterestItems().map((i) => i.id);
  assert.equal(ids.length, new Set(ids).size);
});

test('CRJ-I5 catalog: every item has id, name, icon, iconColor', () => {
  for (const item of flattenCatalogInterestItems()) {
    assert.ok(item.id);
    assert.ok(item.name);
    assert.ok(item.icon);
    assert.ok(item.iconColor);
  }
});

test('CRJ-I5 selection: global minimum is 10', () => {
  assert.equal(MIN_ONBOARDING_INTERESTS, 10);
});

function sample(id: string, categoryId: any, groupId?: string): OnboardingSelectedInterest {
  return {
    id,
    name: id,
    categoryId,
    icon: 'star-outline',
    iconColor: '#2563EB',
    ...(groupId ? { groupId } : {}),
  };
}

test('CRJ-I5 selection: Other placeholder and group pills do not count', () => {
  const selected = [
    sample('music_group_genres', 'music'),
    sample('music_group_genres_other', 'music', 'music_group_genres'),
    sample('business_entrepreneurship', 'business'),
  ];
  assert.equal(countFinalOnboardingInterests(selected), 1);
});

test('CRJ-I5 selection: custom counts once; duplicates do not inflate', () => {
  const custom: OnboardingSelectedInterest = {
    id: buildCustomInterestId('music', 'My Anime', 'music_group_anime'),
    name: 'My Anime',
    categoryId: 'music',
    groupId: 'music_group_anime',
    icon: 'star-outline',
    iconColor: '#2563EB',
    isCustom: true,
  };
  const selected = [
    custom,
    { ...custom },
    sample('music_anime_series', 'music', 'music_group_anime'),
  ];
  assert.equal(countFinalOnboardingInterests(selected), 2);
});

test('CRJ-I5 selection: gate 9 blocked, 10 allowed, >10 allowed', () => {
  const nine = Array.from({ length: 9 }, (_, i) =>
    sample(`business_item_${i}`, 'business'),
  );
  const ten = [...nine, sample('business_item_9', 'business')];
  assert.equal(meetsMinimumOnboardingInterests(nine), false);
  assert.equal(interestsRemainingToMinimum(nine), 1);
  assert.equal(meetsMinimumOnboardingInterests(ten), true);
  assert.equal(meetsMinimumOnboardingInterests([...ten, sample('business_item_10', 'business')]), true);
});

test('CRJ-I5 persistence: personal mode writes personal fields only', () => {
  const selected = Array.from({ length: 10 }, (_, i) =>
    sample(`business_item_${i}`, 'business'),
  );
  const patch = buildCrjInterestPersistencePatch('personal', selected);
  assert.equal(patch.profileSetupCompleted, false);
  assert.ok(patch.personalInterests);
  assert.ok(patch.personalOnboardingInterests);
  assert.equal(patch.professionalInterests, undefined);
  assert.equal(patch.professionalOnboardingInterests, undefined);
  assert.equal(payloadContainsUndefined(patch), false);
  assert.doesNotThrow(() => assertNoUndefinedDeep(patch));
});

test('CRJ-I5 persistence: professional mode writes professional fields only', () => {
  const selected = [
    sample('music_anime_series', 'music', 'music_group_anime'),
    ...Array.from({ length: 9 }, (_, i) => sample(`travel_item_${i}`, 'travel')),
  ];
  const patch = buildCrjInterestPersistencePatch('professional', selected);
  assert.ok(patch.professionalInterests);
  assert.ok(patch.professionalOnboardingInterests);
  assert.equal(patch.personalInterests, undefined);
  assert.equal(
    patch.professionalOnboardingInterests?.[0]?.groupId,
    'music_group_anime',
  );
});

test('CRJ-I5 persistence: custom retains categoryId and groupId', () => {
  const result = validateCustomInterestInput({
    name: 'Cosplay',
    icon: 'star-outline',
    categoryId: 'music',
    groupId: 'music_group_anime',
    existingInCategory: [],
  });
  assert.equal(result.ok, true);
});

test('CRJ-I5 celebration logic: cannot meet minimum below 10', () => {
  assert.equal(meetsMinimumOnboardingInterests([]), false);
  assert.equal(meetsMinimumOnboardingInterests(Array.from({ length: 9 }, (_, i) => sample(`x_${i}`, 'social'))), false);
});

test('CRJ-I5 celebration logic: persistence patch never completes profile', () => {
  const patch = buildCrjInterestPersistencePatch(
    'personal',
    Array.from({ length: 10 }, (_, i) => sample(`x_${i}`, 'community')),
  );
  assert.equal(patch.profileSetupCompleted, false);
});

test('CRJ-I5 UX: Other composer default closed for flat and hierarchical scopes', () => {
  assert.equal(isOtherComposerOpen(null), false);
  assert.equal(isOtherComposerOpen(null, 'music_group_anime'), false);
  assert.equal(isOtherComposerOpen(FLAT_OTHER_SCOPE), true);
  assert.equal(isOtherComposerOpen('music_group_anime', 'music_group_anime'), true);
  assert.equal(
    isOtherComposerOpen('music_group_anime', 'music_group_genres'),
    false,
  );
});

test('CRJ-I5 UX: switching hierarchical scope token does not imply open composer', () => {
  assert.equal(
    isOtherComposerOpen(FLAT_OTHER_SCOPE, 'music_group_dance'),
    false,
  );
  assert.equal(otherScopeForGroup(undefined), FLAT_OTHER_SCOPE);
  assert.equal(otherScopeForGroup('music_group_anime'), 'music_group_anime');
});

test('CRJ-I5 UX: custom icon picker options all include iconColor', () => {
  assert.equal(
    ONBOARDING_CUSTOM_INTEREST_ICON_OPTIONS.length,
    ONBOARDING_CUSTOM_INTEREST_ICONS.length,
  );
  for (const entry of ONBOARDING_CUSTOM_INTEREST_ICON_OPTIONS) {
    assert.ok(entry.icon);
    assert.match(entry.iconColor, /^#[0-9A-Fa-f]{6}$/);
  }
  assert.equal(resolveCustomInterestIconColor('star-outline'), '#CA8A04');
});

test('CRJ-I5 UX: custom validation preserves picker iconColor', () => {
  const result = validateCustomInterestInput({
    name: 'Birdwatching',
    icon: 'leaf-outline',
    iconColor: '#16A34A',
    categoryId: 'community',
    existingInCategory: [],
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.iconColor, '#16A34A');
  }
});

test('CRJ-I5 UX: Level 1 group ids do not count as final interests', () => {
  const selected = [
    sample('music_group_anime', 'music'),
    sample('food_group_dietary', 'food'),
    sample('sports_outdoors_group_sports', 'sports_outdoors'),
  ];
  assert.equal(countFinalOnboardingInterests(selected), 0);
});

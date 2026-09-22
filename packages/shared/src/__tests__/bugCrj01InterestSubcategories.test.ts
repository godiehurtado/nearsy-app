/**
 * BUG-CRJ-01 — CRJ interest subcategory navigation via Next/Back.
 *
 * Acceptance: Next walks catalog subcategories in order before the next
 * category; Back reverses; chip toggle never advances.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCrjInterestPersistencePatch,
  getOnboardingCategory,
  type OnboardingSelectedInterest,
} from '../interests/onboardingInterestCatalog.ts';
import {
  enterCrjInterestSubcategory,
  leaveCrjInterestSubcategory,
  listCrjSubcategoryIds,
  readCrjActiveSubcategory,
  resolveCrjInterestBackAction,
  resolveCrjInterestNextAction,
  selectionsInCategory,
  toggleCrjInterestSelection,
  type CrjActiveGroupMap,
} from '../interests/crjInterestSubcategoryNavigation.ts';
import { onboardingTranslations } from '../i18n/resources/onboarding.ts';

function sample(
  id: string,
  categoryId: OnboardingSelectedInterest['categoryId'],
  groupId: string,
  name = id,
): OnboardingSelectedInterest {
  return {
    id,
    name,
    categoryId,
    groupId,
    icon: 'star-outline',
    iconColor: '#2563EB',
  };
}

function applyNext(
  map: CrjActiveGroupMap,
  categoryId: 'music' | 'food' | 'business',
): { map: CrjActiveGroupMap; leavesCategory: boolean } {
  const category = getOnboardingCategory(categoryId);
  const action = resolveCrjInterestNextAction({
    category,
    activeGroupMap: map,
  });
  if (action.kind === 'leave_category') {
    return { map, leavesCategory: true };
  }
  return {
    map: enterCrjInterestSubcategory(map, category, action.groupId),
    leavesCategory: false,
  };
}

function applyBack(
  map: CrjActiveGroupMap,
  categoryId: 'music' | 'food' | 'business',
): { map: CrjActiveGroupMap; previousStep: boolean } {
  const category = getOnboardingCategory(categoryId);
  const action = resolveCrjInterestBackAction({
    category,
    activeGroupMap: map,
  });
  if (action.kind === 'previous_step') {
    return { map, previousStep: true };
  }
  if (action.kind === 'show_overview') {
    return {
      map: leaveCrjInterestSubcategory(map, categoryId),
      previousStep: false,
    };
  }
  return {
    map: enterCrjInterestSubcategory(map, category, action.groupId),
    previousStep: false,
  };
}

test('BUG-CRJ-01 catalog sequences: Music and Food subcategory order', () => {
  assert.deepEqual(listCrjSubcategoryIds(getOnboardingCategory('music')), [
    'music_group_genres',
    'music_group_dance',
    'music_group_live',
    'music_group_performing',
    'music_group_movies_tv',
    'music_group_anime',
  ]);
  assert.deepEqual(listCrjSubcategoryIds(getOnboardingCategory('food')), [
    'food_group_dietary',
    'food_group_cuisines',
    'food_group_experiences',
    'food_group_beverages',
  ]);
  assert.deepEqual(listCrjSubcategoryIds(getOnboardingCategory('business')), []);
});

test('BUG-CRJ-01 Next: Music overview → each group → Food', () => {
  let map: CrjActiveGroupMap = {};
  assert.equal(readCrjActiveSubcategory(map, 'music'), null);

  const musicGroups = listCrjSubcategoryIds(getOnboardingCategory('music'));
  for (const expected of musicGroups) {
    const step = applyNext(map, 'music');
    assert.equal(step.leavesCategory, false, `should enter ${expected}`);
    map = step.map;
    assert.equal(readCrjActiveSubcategory(map, 'music'), expected);
  }

  const leaveMusic = applyNext(map, 'music');
  assert.equal(leaveMusic.leavesCategory, true);
  // Active group retained so Back can reverse into the last Music group.
  assert.equal(
    readCrjActiveSubcategory(leaveMusic.map, 'music'),
    'music_group_anime',
  );

  // Arrive at Food overview.
  map = leaveMusic.map;
  assert.equal(readCrjActiveSubcategory(map, 'food'), null);
  const firstFood = applyNext(map, 'food');
  assert.equal(firstFood.leavesCategory, false);
  assert.equal(
    readCrjActiveSubcategory(firstFood.map, 'food'),
    'food_group_dietary',
  );
});

test('BUG-CRJ-01 Back reverses Music path and keeps selections', () => {
  let map: CrjActiveGroupMap = {};
  let selected: OnboardingSelectedInterest[] = [];

  // Walk Music with a selection in genres; chip toggle must not change nav.
  map = applyNext(map, 'music').map; // genres
  selected = toggleCrjInterestSelection(
    selected,
    sample('music_genre_pop', 'music', 'music_group_genres', 'Pop'),
  );
  assert.equal(readCrjActiveSubcategory(map, 'music'), 'music_group_genres');
  assert.equal(selectionsInCategory(selected, 'music').length, 1);

  map = applyNext(map, 'music').map; // dance
  selected = toggleCrjInterestSelection(
    selected,
    sample('music_dance_salsa', 'music', 'music_group_dance', 'Salsa'),
  );
  map = applyNext(map, 'music').map; // live
  map = applyNext(map, 'music').map; // performing
  map = applyNext(map, 'music').map; // movies_tv
  map = applyNext(map, 'music').map; // anime
  selected = toggleCrjInterestSelection(
    selected,
    sample('music_anime_series', 'music', 'music_group_anime', 'Anime Series'),
  );

  const leave = applyNext(map, 'music');
  assert.equal(leave.leavesCategory, true);
  map = leave.map;

  // Food overview, then Back into Music last group.
  assert.equal(readCrjActiveSubcategory(map, 'food'), null);
  // Simulate leaving Food overview via Back → previous Music step restores map.
  assert.equal(readCrjActiveSubcategory(map, 'music'), 'music_group_anime');

  const reverse = [
    'music_group_movies_tv',
    'music_group_performing',
    'music_group_live',
    'music_group_dance',
    'music_group_genres',
  ];
  for (const expected of reverse) {
    const step = applyBack(map, 'music');
    assert.equal(step.previousStep, false);
    map = step.map;
    assert.equal(readCrjActiveSubcategory(map, 'music'), expected);
  }

  const toOverview = applyBack(map, 'music');
  assert.equal(toOverview.previousStep, false);
  map = toOverview.map;
  assert.equal(readCrjActiveSubcategory(map, 'music'), null);

  const leaveInterest = applyBack(map, 'music');
  assert.equal(leaveInterest.previousStep, true);

  assert.equal(selectionsInCategory(selected, 'music').length, 3);
  const patch = buildCrjInterestPersistencePatch('personal', selected);
  const rows = patch.personalOnboardingInterests ?? [];
  assert.equal(rows.length, 3);
  assert.ok(
    rows.some(
      (r) => r.id === 'music_genre_pop' && r.groupId === 'music_group_genres',
    ),
  );
  assert.ok(
    rows.some(
      (r) =>
        r.id === 'music_dance_salsa' && r.groupId === 'music_group_dance',
    ),
  );
  assert.ok(
    rows.some(
      (r) =>
        r.id === 'music_anime_series' && r.groupId === 'music_group_anime',
    ),
  );
});

test('BUG-CRJ-01 flat category Next always leaves; Back is previous step', () => {
  const business = getOnboardingCategory('business');
  const map: CrjActiveGroupMap = {};
  assert.equal(
    resolveCrjInterestNextAction({ category: business, activeGroupMap: map })
      .kind,
    'leave_category',
  );
  assert.equal(
    resolveCrjInterestBackAction({ category: business, activeGroupMap: map })
      .kind,
    'previous_step',
  );
});

test('BUG-CRJ-01: catalog group nameKeys present in EN and ES', () => {
  const enGroups = onboardingTranslations.en.profileCompletion.interests.groups;
  const esGroups = onboardingTranslations.es.profileCompletion.interests.groups;
  for (const id of ['music', 'food', 'sports_outdoors'] as const) {
    const cat = getOnboardingCategory(id);
    for (const group of cat.groups ?? []) {
      assert.equal(
        typeof (enGroups as Record<string, string>)[group.nameKey],
        'string',
        `EN ${group.nameKey}`,
      );
      assert.equal(
        typeof (esGroups as Record<string, string>)[group.nameKey],
        'string',
        `ES ${group.nameKey}`,
      );
    }
  }
  assert.equal(esGroups.music_group_genres, 'Géneros musicales');
  assert.equal(esGroups.sports_outdoors_group_sports, 'Deportes');
});

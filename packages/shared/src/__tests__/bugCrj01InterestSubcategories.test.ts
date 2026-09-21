/**
 * BUG-CRJ-01 — CRJ interest subcategory navigation regression.
 *
 * Fails when hierarchical CRJ auto-opens the first group and header Back
 * always leaves the category (the pre-fix defect).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCrjInterestPersistencePatch,
  getOnboardingCategory,
  type OnboardingSelectedInterest,
} from '../interests/onboardingInterestCatalog';
import {
  enterCrjInterestSubcategory,
  leaveCrjInterestSubcategory,
  readCrjActiveSubcategory,
  resolveCrjInterestBackAction,
  selectionsInCategory,
  toggleCrjInterestSelection,
  type CrjActiveGroupMap,
} from '../interests/crjInterestSubcategoryNavigation';
import { resolveActiveGroupId } from '../interests/interestHierarchy';
import enOnboarding from '../i18n/resources/onboarding';
import es from '../i18n/locales/es';

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

test('BUG-CRJ-01: entering hierarchical category starts at subcategory overview', () => {
  const music = getOnboardingCategory('music');
  const map: CrjActiveGroupMap = {};
  assert.equal(readCrjActiveSubcategory(map, 'music'), null);
  // Defect baseline: resolveActiveGroupId always forced the first group.
  assert.equal(resolveActiveGroupId(music), 'music_group_genres');
  assert.notEqual(
    readCrjActiveSubcategory(map, 'music'),
    resolveActiveGroupId(music),
  );
});

test('BUG-CRJ-01: category → subcategory → select/deselect → back → advance', () => {
  const music = getOnboardingCategory('music');
  const food = getOnboardingCategory('food');
  let groups: CrjActiveGroupMap = {};
  let selected: OnboardingSelectedInterest[] = [];
  let step: 'music' | 'food' = 'music';

  // Enter Music overview — no subcategory open.
  assert.equal(readCrjActiveSubcategory(groups, 'music'), null);

  // Enter Dance subcategory.
  groups = enterCrjInterestSubcategory(groups, music, 'music_group_dance');
  assert.equal(readCrjActiveSubcategory(groups, 'music'), 'music_group_dance');

  // Select then deselect then select Salsa.
  const salsa = sample(
    'music_dance_salsa',
    'music',
    'music_group_dance',
    'Salsa',
  );
  selected = toggleCrjInterestSelection(selected, salsa);
  assert.equal(selectionsInCategory(selected, 'music').length, 1);
  selected = toggleCrjInterestSelection(selected, salsa);
  assert.equal(selectionsInCategory(selected, 'music').length, 0);
  selected = toggleCrjInterestSelection(selected, salsa);
  assert.equal(selectionsInCategory(selected, 'music').length, 1);

  // Also select an Anime interest after switching subcategory.
  groups = enterCrjInterestSubcategory(groups, music, 'music_group_anime');
  assert.equal(readCrjActiveSubcategory(groups, 'music'), 'music_group_anime');
  selected = toggleCrjInterestSelection(
    selected,
    sample('music_anime_series', 'music', 'music_group_anime', 'Anime Series'),
  );
  assert.equal(selectionsInCategory(selected, 'music').length, 2);

  // Header Back leaves subcategory, stays on Music category.
  assert.equal(
    resolveCrjInterestBackAction({ category: music, activeGroupMap: groups }),
    'leave_subcategory',
  );
  groups = leaveCrjInterestSubcategory(groups, 'music');
  assert.equal(readCrjActiveSubcategory(groups, 'music'), null);
  assert.equal(selectionsInCategory(selected, 'music').length, 2);

  // Advance to Food; Music selections persist.
  step = 'food';
  assert.equal(step, 'food');
  assert.equal(selectionsInCategory(selected, 'music').length, 2);

  // Enter Food dietary, select Vegan, return to overview.
  groups = enterCrjInterestSubcategory(groups, food, 'food_group_dietary');
  selected = toggleCrjInterestSelection(
    selected,
    sample('food_dietary_vegan', 'food', 'food_group_dietary', 'Vegan'),
  );
  groups = leaveCrjInterestSubcategory(groups, 'food');
  assert.equal(readCrjActiveSubcategory(groups, 'food'), null);

  // Go back to Music: reopen last subcategory state (none) + selections intact.
  step = 'music';
  assert.equal(readCrjActiveSubcategory(groups, 'music'), null);
  assert.equal(selectionsInCategory(selected, 'music').length, 2);
  assert.equal(
    resolveCrjInterestBackAction({ category: music, activeGroupMap: groups }),
    'previous_step',
  );

  // Final save retains group relationships.
  const patch = buildCrjInterestPersistencePatch('personal', selected);
  const rows = patch.personalOnboardingInterests ?? [];
  assert.equal(rows.length, 3);
  assert.ok(rows.some((r) => r.id === 'music_dance_salsa' && r.groupId === 'music_group_dance'));
  assert.ok(rows.some((r) => r.id === 'music_anime_series' && r.groupId === 'music_group_anime'));
  assert.ok(rows.some((r) => r.id === 'food_dietary_vegan' && r.groupId === 'food_group_dietary'));
});

test('BUG-CRJ-01: catalog group nameKeys present in EN and ES', () => {
  const enGroups = (enOnboarding as any).profileCompletion.interests.groups;
  const esGroups = (es as any).onboarding.profileCompletion.interests.groups;
  for (const id of [
    'music',
    'food',
    'sports_outdoors',
  ] as const) {
    const cat = getOnboardingCategory(id);
    for (const group of cat.groups ?? []) {
      assert.equal(typeof enGroups[group.nameKey], 'string', `EN ${group.nameKey}`);
      assert.equal(typeof esGroups[group.nameKey], 'string', `ES ${group.nameKey}`);
      assert.ok(enGroups[group.nameKey].length > 0);
      assert.ok(esGroups[group.nameKey].length > 0);
    }
  }
  // Previously leaked EN labels in ES locale (BUG-CRJ-01 presentation).
  assert.equal(esGroups.music_group_genres, 'Géneros musicales');
  assert.equal(esGroups.music_group_live, 'Entretenimiento en vivo');
  assert.equal(esGroups.music_group_movies_tv, 'Cine y televisión');
  assert.equal(esGroups.music_group_performing, 'Artes escénicas');
  assert.equal(esGroups.music_group_dance, 'Baile');
  assert.equal(esGroups.sports_outdoors_group_outdoors, 'Aire libre y aventura');
  assert.equal(esGroups.sports_outdoors_group_sports, 'Deportes');
});

test('BUG-CRJ-01: sports/outdoors group relations stay intact', () => {
  const cat = getOnboardingCategory('sports_outdoors');
  assert.equal(cat.groups?.length, 2);
  const sports = cat.groups!.find((g) => g.id === 'sports_outdoors_group_sports');
  const outdoors = cat.groups!.find((g) => g.id === 'sports_outdoors_group_outdoors');
  assert.ok(sports?.items.some((i) => i.id === 'sports_soccer'));
  assert.ok(outdoors?.items.some((i) => i.id === 'outdoors_hiking'));
  assert.ok(!sports?.items.some((i) => i.id === 'outdoors_hiking'));
});

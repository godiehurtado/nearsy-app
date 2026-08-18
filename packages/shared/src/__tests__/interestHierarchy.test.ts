import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ONBOARDING_INTEREST_CATEGORIES,
  getOnboardingCategory,
} from '../interests/onboardingInterestCatalog';
import {
  assertKnownHierarchicalCategories,
  getHierarchicalGroups,
  isHierarchicalInterestCategory,
  readActiveGroupForCategory,
  resolveActiveGroupId,
  setActiveGroupForCategory,
} from '../interests/interestHierarchy';
import { isOtherComposerOpen } from '../components/registration/interestOtherScope';
import { celebrationEntryDelayMs } from '../components/registration/celebrationMotion';

test('hierarchy: Music has 6 non-empty groups at runtime', () => {
  const music = getOnboardingCategory('music');
  assert.equal(isHierarchicalInterestCategory(music), true);
  assert.equal(getHierarchicalGroups(music).length, 6);
  assert.equal(resolveActiveGroupId(music), 'music_group_genres');
});

test('hierarchy: Food has 4 non-empty groups at runtime', () => {
  const food = getOnboardingCategory('food');
  assert.equal(getHierarchicalGroups(food).length, 4);
  assert.equal(resolveActiveGroupId(food), 'food_group_dietary');
});

test('hierarchy: Sports/Outdoors has 2 non-empty groups at runtime', () => {
  const sports = getOnboardingCategory('sports_outdoors');
  assert.equal(getHierarchicalGroups(sports).length, 2);
  assert.equal(resolveActiveGroupId(sports), 'sports_outdoors_group_sports');
});

test('hierarchy: catalog assertion passes for known hierarchical categories', () => {
  assert.doesNotThrow(() =>
    assertKnownHierarchicalCategories(ONBOARDING_INTEREST_CATEGORIES),
  );
});

test('hierarchy: first group auto-selected when none stored', () => {
  const music = getOnboardingCategory('music');
  assert.equal(readActiveGroupForCategory({}, music), 'music_group_genres');
});

test('hierarchy: stored active group restored per category', () => {
  const music = getOnboardingCategory('music');
  const food = getOnboardingCategory('food');
  let map = setActiveGroupForCategory({}, 'music', 'music_group_anime');
  map = setActiveGroupForCategory(map, 'food', 'food_group_cuisines');
  assert.equal(readActiveGroupForCategory(map, music), 'music_group_anime');
  assert.equal(readActiveGroupForCategory(map, food), 'food_group_cuisines');
});

test('hierarchy: changing Food group does not modify Music group state', () => {
  let map = setActiveGroupForCategory({}, 'music', 'music_group_anime');
  map = setActiveGroupForCategory(map, 'food', 'food_group_dietary');
  map = setActiveGroupForCategory(map, 'food', 'food_group_beverages');
  assert.equal(map.music, 'music_group_anime');
  assert.equal(map.food, 'food_group_beverages');
});

test('hierarchy: invalid stored group falls back to first group', () => {
  const music = getOnboardingCategory('music');
  assert.equal(
    resolveActiveGroupId(music, 'missing_group_id'),
    'music_group_genres',
  );
});

test('hierarchy: flat Business is not hierarchical', () => {
  const business = getOnboardingCategory('business');
  assert.equal(isHierarchicalInterestCategory(business), false);
  assert.equal(getHierarchicalGroups(business).length, 0);
});

test('hierarchy UX: Other composer closed on initial render scope', () => {
  assert.equal(isOtherComposerOpen(null), false);
  assert.equal(isOtherComposerOpen(null, 'music_group_genres'), false);
});

test('celebration: entry stagger helper increases per badge index', () => {
  assert.ok(celebrationEntryDelayMs(1) > celebrationEntryDelayMs(0));
  assert.ok(celebrationEntryDelayMs(3) > celebrationEntryDelayMs(2));
});

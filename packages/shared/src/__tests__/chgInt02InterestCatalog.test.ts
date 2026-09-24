/**
 * CHG-INT-02 — Nearsy 2.0.5 interest catalog (Android).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getOnboardingCategory,
  flattenCatalogInterestItems,
} from '../interests/onboardingInterestCatalog.ts';
import {
  getDeprecatedInterestDisplayItem,
  isDeprecatedInterestId,
  isSelectableCatalogInterestId,
  resetInterestCatalogLookupCaches,
} from '../interests/onboardingInterestLegacyCatalog.ts';
import {
  assertKnownHierarchicalCategories,
  getHierarchicalGroups,
} from '../interests/interestHierarchy.ts';
import { listCrjSubcategoryIds } from '../interests/crjInterestSubcategoryNavigation.ts';
import { ONBOARDING_INTEREST_CATEGORIES } from '../interests/onboardingInterestCatalog.ts';
import { onboardingTranslations } from '../i18n/resources/onboarding.ts';

resetInterestCatalogLookupCaches();

const REMOVED = [
  'arts_dancing',
  'music_genre_reggaeton',
  'travel_immigration',
] as const;

test('CHG-INT-02: removed interests are not selectable and stay legacy', () => {
  for (const id of REMOVED) {
    assert.equal(isSelectableCatalogInterestId(id), false, id);
    assert.equal(isDeprecatedInterestId(id), true, id);
    assert.ok(getDeprecatedInterestDisplayItem(id), id);
  }
  assert.ok(
    !flattenCatalogInterestItems().some((i) =>
      (REMOVED as readonly string[]).includes(i.id),
    ),
  );
});

test('CHG-INT-02: pescatarian is selectable after flexitarian; not legacy', () => {
  assert.equal(isSelectableCatalogInterestId('food_dietary_pescatarian'), true);
  assert.equal(isDeprecatedInterestId('food_dietary_pescatarian'), false);
  const dietary = getOnboardingCategory('food').groups?.find(
    (g) => g.id === 'food_group_dietary',
  );
  assert.ok(dietary);
  const ids = dietary!.items.map((i) => i.id);
  const flex = ids.indexOf('food_dietary_flexitarian');
  const pesc = ids.indexOf('food_dietary_pescatarian');
  const other = ids.indexOf('food_group_dietary_other');
  assert.ok(flex >= 0 && pesc === flex + 1);
  assert.ok(other === pesc + 1);
  const item = dietary!.items.find((i) => i.id === 'food_dietary_pescatarian');
  assert.equal(item?.name, 'Pescatarian');
  assert.equal(item?.icon, 'fish-outline');
  assert.equal(item?.iconColor, '#0891B2');
  assert.equal(
    onboardingTranslations.en.profileCompletion.interests.items
      .food_dietary_pescatarian,
    'Pescatarian',
  );
  assert.equal(
    onboardingTranslations.es.profileCompletion.interests.items
      .food_dietary_pescatarian,
    'Pescetariano',
  );
});

test('CHG-INT-02: lookalikes and Music Dance group untouched', () => {
  assert.equal(isSelectableCatalogInterestId('social_dancing'), true);
  assert.equal(isSelectableCatalogInterestId('travel_languages'), true);
  assert.equal(isSelectableCatalogInterestId('learning_languages'), true);
  const dance = getOnboardingCategory('music').groups?.find(
    (g) => g.id === 'music_group_dance',
  );
  assert.ok(dance && dance.items.length > 0);
});

test('CHG-INT-02: hierarchical group counts unchanged (BUG-CRJ-01 Next)', () => {
  assertKnownHierarchicalCategories(ONBOARDING_INTEREST_CATEGORIES);
  const music = getOnboardingCategory('music');
  const food = getOnboardingCategory('food');
  assert.equal(getHierarchicalGroups(music).length, 6);
  assert.equal(getHierarchicalGroups(food).length, 4);
  // overview → 6 groups → leave = 7 Next presses within Music before Food
  assert.equal(listCrjSubcategoryIds(music).length, 6);
  assert.equal(listCrjSubcategoryIds(food).length, 4);
});

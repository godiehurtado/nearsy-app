/**
 * CHG-INT-02 — retire three selectable interests; promote Pescatarian.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  flattenCatalogInterestItems,
  getOnboardingCategory,
  isSelectableCatalogInterestId,
} from '../interests/onboardingInterestCatalog';
import {
  isLegacyDisplayInterestId,
  LEGACY_DISPLAY_INTEREST_ITEMS,
  resolveLegacyDisplayInterestItem,
} from '../interests/interestLegacyCatalog';
import { resolveInterestChip } from '../visibility/interestDisplay';
import enOnboarding from '../i18n/resources/onboarding';
import es from '../i18n/locales/es';

const translateItem = (nameKey: string, fallback: string) => fallback;

const RETIRED = [
  'arts_dancing',
  'music_genre_reggaeton',
  'travel_immigration',
] as const;

test('CHG-INT-02: retired IDs are not selectable', () => {
  for (const id of RETIRED) {
    assert.equal(isSelectableCatalogInterestId(id), false, id);
    assert.equal(
      flattenCatalogInterestItems().some((i) => i.id === id),
      false,
      id,
    );
  }
});

test('CHG-INT-02: retired IDs remain legacy-resolvable', () => {
  for (const id of RETIRED) {
    assert.equal(isLegacyDisplayInterestId(id), true, id);
    const legacy = resolveLegacyDisplayInterestItem(id);
    assert.ok(legacy, id);
    const chip = resolveInterestChip(id, translateItem);
    assert.ok(chip, id);
    assert.equal(chip!.id, id);
  }
});

test('CHG-INT-02: social_dancing and music dance group untouched', () => {
  assert.equal(isSelectableCatalogInterestId('social_dancing'), true);
  const dance = getOnboardingCategory('music').groups!.find(
    (g) => g.id === 'music_group_dance',
  )!;
  assert.ok(dance.items.some((i) => i.id === 'music_dance_salsa'));
});

test('CHG-INT-02: travel_languages and learning_languages untouched', () => {
  assert.equal(isSelectableCatalogInterestId('travel_languages'), true);
  assert.equal(isSelectableCatalogInterestId('learning_languages'), true);
});

test('CHG-INT-02: Pescatarian selectable after Flexitarian, not legacy', () => {
  assert.equal(isSelectableCatalogInterestId('food_dietary_pescatarian'), true);
  assert.equal(isLegacyDisplayInterestId('food_dietary_pescatarian'), false);
  const dietary = getOnboardingCategory('food').groups!.find(
    (g) => g.id === 'food_group_dietary',
  )!;
  const ids = dietary.items.filter((i) => !i.isOther).map((i) => i.id);
  const flex = ids.indexOf('food_dietary_flexitarian');
  const pesc = ids.indexOf('food_dietary_pescatarian');
  assert.ok(flex >= 0 && pesc === flex + 1);
  const item = dietary.items.find((i) => i.id === 'food_dietary_pescatarian')!;
  assert.equal(item.name, 'Pescatarian');
  assert.equal(item.icon, 'fish-outline');
  assert.equal(item.iconColor, '#0891B2');
});

test('CHG-INT-02: Pescatarian EN/ES labels', () => {
  const enItems = (enOnboarding as any).profileCompletion.interests.items;
  const esItems = (es as any).onboarding.profileCompletion.interests.items;
  assert.equal(enItems.food_dietary_pescatarian, 'Pescatarian');
  assert.equal(esItems.food_dietary_pescatarian, 'Pescetariano');
});

test('CHG-INT-02: selectable + legacy IDs remain unique', () => {
  const selectable = flattenCatalogInterestItems().map((i) => i.id);
  const legacy = LEGACY_DISPLAY_INTEREST_ITEMS.map((i) => i.id);
  const all = [...selectable, ...legacy];
  assert.equal(all.length, new Set(all).size);
  assert.equal(selectable.filter((id) => id === 'food_dietary_pescatarian').length, 1);
});

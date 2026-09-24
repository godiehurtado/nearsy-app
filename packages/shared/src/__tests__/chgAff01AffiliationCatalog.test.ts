/**
 * CHG-AFF-01 — retire three Identity & Lifestyle topics; keep personality_type.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ONBOARDING_AFFILIATION_CATEGORIES,
  getOnboardingAffiliationCategory,
} from '../affiliations/onboardingAffiliationCatalog';
import { isSelectableCatalogInterestId } from '../interests/onboardingInterestCatalog';

const RETIRED_TOPICS = ['zodiac_sign', 'languages', 'nationality'] as const;

test('CHG-AFF-01: retired topics absent from Identity & Lifestyle', () => {
  const cat = getOnboardingAffiliationCategory('identity_lifestyle');
  const ids = cat.topics.map((t) => t.id);
  for (const id of RETIRED_TOPICS) {
    assert.equal(ids.includes(id), false, id);
  }
});

test('CHG-AFF-01: personality_type remains selectable', () => {
  const cat = getOnboardingAffiliationCategory('identity_lifestyle');
  const personality = cat.topics.find((t) => t.id === 'personality_type');
  assert.ok(personality);
  assert.equal(personality!.label, 'Personality type');
});

test('CHG-AFF-01: remaining identity topics order', () => {
  const cat = getOnboardingAffiliationCategory('identity_lifestyle');
  assert.deepEqual(
    cat.topics.map((t) => t.id),
    [
      'cultural_background',
      'hometown',
      'parent',
      'pet_parent',
      'veteran',
      'personality_type',
    ],
  );
});

test('CHG-AFF-01: category count and other categories intact', () => {
  assert.equal(ONBOARDING_AFFILIATION_CATEGORIES.length, 7);
  for (const cat of ONBOARDING_AFFILIATION_CATEGORIES) {
    assert.ok(cat.topics.length > 0, cat.id);
  }
  assert.ok(
    getOnboardingAffiliationCategory('education').topics.some(
      (t) => t.id === 'college_or_university',
    ),
  );
});

test('CHG-AFF-01: topic languages is not travel_languages interest', () => {
  assert.equal(isSelectableCatalogInterestId('travel_languages'), true);
  assert.equal(isSelectableCatalogInterestId('learning_languages'), true);
  const identity = getOnboardingAffiliationCategory('identity_lifestyle');
  assert.equal(identity.topics.some((t) => t.id === 'languages'), false);
});

/**
 * CHG-AFF-01 — Family is the new-write category; Identity & Lifestyle stays legacy.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getOnboardingAffiliationCategory,
  listOnboardingAffiliationCategoryIds,
} from '../affiliations/onboardingAffiliationCatalog';
import { isSelectableCatalogInterestId } from '../interests/onboardingInterestCatalog';

const RETIRED_TOPICS = ['zodiac_sign', 'languages', 'nationality'] as const;
const FAMILY_TOPICS = [
  'father_of',
  'mother_of',
  'child_of',
  'sibling_of',
  'spouse_of',
  'partner_of',
  'grandparent_of',
  'grandchild_of',
  'pet_parent',
] as const;

test('CHG-AFF-01: retired topics absent from Identity & Lifestyle', () => {
  const cat = getOnboardingAffiliationCategory('identity_lifestyle');
  const ids = cat.topics.map((t) => t.id);
  for (const id of RETIRED_TOPICS) {
    assert.equal(ids.includes(id), false, id);
  }
});

test('CHG-AFF-01: personality_type stays on Identity & Lifestyle, not Family', () => {
  const identity = getOnboardingAffiliationCategory('identity_lifestyle');
  const family = getOnboardingAffiliationCategory('family');
  assert.equal(
    identity.topics.some((t) => t.id === 'personality_type'),
    true,
  );
  assert.equal(
    family.topics.some((t) => t.id === 'personality_type'),
    false,
  );
});

test('CHG-AFF-01: Family relationship topics are the new-write picker', () => {
  const cat = getOnboardingAffiliationCategory('family');
  assert.equal(cat.name, 'Family');
  assert.deepEqual(
    cat.topics.map((t) => t.id),
    [...FAMILY_TOPICS],
  );
});

test('CHG-AFF-01: seven new-write categories; Identity & Lifestyle remains readable', () => {
  assert.deepEqual(listOnboardingAffiliationCategoryIds(), [
    'education',
    'professional',
    'community',
    'sports_clubs',
    'faith',
    'political_civic',
    'family',
  ]);
  assert.equal(getOnboardingAffiliationCategory('identity_lifestyle').name, 'Identity & Lifestyle');
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

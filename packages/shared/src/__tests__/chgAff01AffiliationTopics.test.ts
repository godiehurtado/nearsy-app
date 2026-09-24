/**
 * CHG-AFF-01 — Nearsy 2.0.5 Identity & Lifestyle affiliation topics (Android).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getOnboardingAffiliationCategory,
  ONBOARDING_AFFILIATION_CATEGORIES,
} from '../affiliations/onboardingAffiliationCatalog.ts';

const here = dirname(fileURLToPath(import.meta.url));

const REMOVED_TOPIC_IDS = [
  'zodiac_sign',
  'languages',
  'nationality',
] as const;

test('CHG-AFF-01: removed Identity topics absent; personality_type kept', () => {
  const identity = getOnboardingAffiliationCategory('identity_lifestyle');
  const ids = identity.topics.map((t) => t.id);
  for (const id of REMOVED_TOPIC_IDS) {
    assert.equal(ids.includes(id), false, `should remove ${id}`);
  }
  assert.ok(ids.includes('personality_type'));
  const personality = identity.topics.find((t) => t.id === 'personality_type');
  assert.equal(personality?.label, 'Personality type');
  assert.equal(personality?.emoji, '🧠');
});

test('CHG-AFF-01: unrelated Identity topics and other categories intact', () => {
  const identity = getOnboardingAffiliationCategory('identity_lifestyle');
  const ids = identity.topics.map((t) => t.id);
  assert.deepEqual(ids, [
    'cultural_background',
    'hometown',
    'parent',
    'pet_parent',
    'veteran',
    'personality_type',
  ]);
  assert.equal(ONBOARDING_AFFILIATION_CATEGORIES.length, 7);
  assert.ok(
    getOnboardingAffiliationCategory('education').topics.some(
      (t) => t.id === 'college_or_university',
    ),
  );
});

test('CHG-AFF-01: profile context modules unchanged by affiliation topic trim', () => {
  const zodiac = readFileSync(
    join(here, '../profileContext/zodiacPresentation.ts'),
    'utf8',
  );
  const languages = readFileSync(
    join(here, '../profileContext/languageCatalog.ts'),
    'utf8',
  );
  const fields = readFileSync(
    join(here, '../profileContext/profileContextFields.ts'),
    'utf8',
  );
  assert.match(zodiac, /zodiac|Zodiac/i);
  assert.match(languages, /language/i);
  assert.match(fields, /languageCodes|birthCountry|zodiac/i);
  const affSrc = readFileSync(
    join(here, '../affiliations/onboardingAffiliationCatalog.ts'),
    'utf8',
  );
  assert.doesNotMatch(affSrc, /topic\('Zodiac sign'/);
  assert.doesNotMatch(affSrc, /topic\('Languages'/);
  assert.doesNotMatch(affSrc, /topic\('Nationality'/);
  assert.match(affSrc, /topic\('Personality type'/);
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  affiliationNameRequired,
  formatAffiliationCaption,
  isFamilyAffiliationCategory,
  isTopicOptionalNameCategory,
  LEGACY_IDENTITY_TOPICS,
} from '../affiliations/affiliationPresentation.ts';
import { getOnboardingAffiliationCategory } from '../affiliations/onboardingAffiliationCatalog.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function localize(id: string, fallback: string): string {
  const es: Record<string, string> = {
    father_of: 'Padre de',
    democratic_party: 'Partido Demócrata',
    sports_team: 'Equipo deportivo',
    pet_parent: 'Dueño de mascota',
    parent: 'Padre o madre',
  };
  return es[id] ?? fallback;
}

describe('NEARSY-209 affiliation captions', () => {
  it('keeps identity_lifestyle as Family storage id and does not invent a new category', () => {
    const family = getOnboardingAffiliationCategory('identity_lifestyle');
    assert.equal(family.id, 'identity_lifestyle');
    assert.equal(family.name, 'Family');
    assert.equal(family.entrySource, 'freeText');
    assert.equal(isFamilyAffiliationCategory('identity_lifestyle'), true);
    assert.equal(affiliationNameRequired('identity_lifestyle'), true);
    assert.equal(isTopicOptionalNameCategory('political_civic'), true);
    assert.equal(affiliationNameRequired('political_civic'), false);
    assert.equal(affiliationNameRequired('faith'), false);
    assert.equal(affiliationNameRequired('sports_clubs'), true);
  });

  it('Family reads Padre de Sofía and preserves legacy Identity rows', () => {
    assert.equal(
      formatAffiliationCaption(
        {
          name: 'Sofía',
          categoryId: 'identity_lifestyle',
          topic: 'Father of',
        },
        localize,
      ),
      'Padre de Sofía',
    );
    assert.equal(
      formatAffiliationCaption(
        {
          name: 'Luna',
          categoryId: 'identity_lifestyle',
          topic: 'Pet parent',
        },
        localize,
      ),
      'Dueño de mascota Luna',
    );
    const legacyParent = LEGACY_IDENTITY_TOPICS.find((row) => row.id === 'parent');
    assert.ok(legacyParent);
    assert.equal(
      formatAffiliationCaption(
        {
          name: 'Ana',
          categoryId: 'identity_lifestyle',
          topic: 'Parent',
        },
        localize,
      ),
      'Padre o madre Ana',
    );
  });

  it('named rows show name / subcategory; topic-only shows subcategory', () => {
    assert.equal(
      formatAffiliationCaption(
        {
          name: 'Florida Demócratas',
          categoryId: 'political_civic',
          topic: 'Democratic Party',
        },
        localize,
      ),
      'Florida Demócratas / Partido Demócrata',
    );
    assert.equal(
      formatAffiliationCaption(
        {
          name: 'Inter Miami FC',
          categoryId: 'sports_clubs',
          topic: 'Sports team',
        },
        localize,
      ),
      'Inter Miami FC / Equipo deportivo',
    );
    assert.equal(
      formatAffiliationCaption(
        {
          name: 'Democratic Party',
          categoryId: 'political_civic',
          topic: 'Democratic Party',
        },
        localize,
      ),
      'Partido Demócrata',
    );
  });

  it('editor and Discovery no longer caption the general category', () => {
    const panel = readFileSync(
      path.join(root, 'components/registration/OnboardingAffiliationCategoryPanel.tsx'),
      'utf8',
    );
    assert.match(panel, /formatAffiliationCaption/);
    assert.match(panel, /topicOnlyReady/);
    assert.match(panel, /familyNameHint/);
    const card = readFileSync(
      path.join(root, 'components/profileExploration/DiscoveryAffiliationsCard.tsx'),
      'utf8',
    );
    assert.doesNotMatch(card, /formatDiscoveryAffiliationTypeLabel/);
    const onboarding = readFileSync(
      path.join(root, 'i18n/resources/onboarding.ts'),
      'utf8',
    );
    assert.match(onboarding, /identity_lifestyle: 'Family'/);
    assert.match(onboarding, /identity_lifestyle: 'Familia'/);
    assert.match(onboarding, /father_of: 'Padre de'/);
  });
});

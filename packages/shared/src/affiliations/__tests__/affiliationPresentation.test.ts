import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  getOnboardingAffiliationCategory,
  isDuplicateAffiliation,
  isFreeTextAffiliationCategory,
} from '../onboardingAffiliationCatalog';
import {
  affiliationRequiresName,
  formatAffiliationPrimaryLabel,
  isFamilyAffiliationCategory,
  isTopicSufficientAffiliationCategory,
  resolveAffiliationTopicId,
} from '../affiliationPresentation';
import enOnboarding from '../../i18n/resources/onboarding';
import es from '../../i18n/locales/es';

const translateEn: (key: string, fallback: string) => string = (key, fallback) => {
  const topics = enOnboarding.profileCompletion.affiliations.topics as Record<
    string,
    string
  >;
  const id = key.split('.').at(-1) ?? '';
  return topics[id] ?? fallback;
};

const translateEs: (key: string, fallback: string) => string = (key, fallback) => {
  const topics = es.onboarding.profileCompletion.affiliations.topics as Record<
    string,
    string
  >;
  const id = key.split('.').at(-1) ?? '';
  return topics[id] ?? fallback;
};

describe('Family / topic-sufficient affiliation presentation', () => {
  it('keeps identity_lifestyle as the Family storage id and free-text (no logo.dev)', () => {
    assert.equal(isFamilyAffiliationCategory('identity_lifestyle'), true);
    assert.equal(isFreeTextAffiliationCategory('identity_lifestyle'), true);
    assert.equal(affiliationRequiresName('identity_lifestyle'), true);
    assert.equal(getOnboardingAffiliationCategory('identity_lifestyle').name, 'Family');
    assert.deepEqual(
      getOnboardingAffiliationCategory('identity_lifestyle').topics.map((t) => t.id),
      [
        'father_of',
        'mother_of',
        'child_of',
        'sibling_of',
        'spouse_of',
        'partner_of',
        'grandparent_of',
        'grandchild_of',
        'pet_parent',
      ],
    );
  });

  it('Faith and Political & Civic need only a subcategory', () => {
    assert.equal(isTopicSufficientAffiliationCategory('faith'), true);
    assert.equal(isTopicSufficientAffiliationCategory('political_civic'), true);
    assert.equal(affiliationRequiresName('faith'), false);
    assert.equal(affiliationRequiresName('education'), true);
  });

  it('composes Family as Padre de Sofía / Father of Sofía', () => {
    assert.equal(
      formatAffiliationPrimaryLabel({
        name: 'Sofía',
        categoryId: 'identity_lifestyle',
        topic: 'father_of',
        translate: translateEs,
      }),
      'Padre de Sofía',
    );
    assert.equal(
      formatAffiliationPrimaryLabel({
        name: 'Sofía',
        categoryId: 'identity_lifestyle',
        topic: 'father_of',
        translate: translateEn,
      }),
      'Father of Sofía',
    );
  });

  it('without a name shows only the subcategory', () => {
    assert.equal(
      formatAffiliationPrimaryLabel({
        name: '  ',
        categoryId: 'faith',
        topic: 'catholic',
        translate: translateEn,
      }),
      'Catholic',
    );
    assert.equal(
      formatAffiliationPrimaryLabel({
        name: '',
        categoryId: 'identity_lifestyle',
        topic: 'mother_of',
        translate: translateEs,
      }),
      'Madre de',
    );
  });

  it('never uses the general category as the visible label', () => {
    assert.equal(
      formatAffiliationPrimaryLabel({
        name: 'MIT',
        categoryId: 'education',
        topic: 'college_or_university',
        translate: translateEn,
      }),
      'MIT',
    );
    assert.equal(
      formatAffiliationPrimaryLabel({
        name: 'MIT',
        categoryId: 'education',
        topic: 'college_or_university',
        translate: translateEn,
      }).includes('Education'),
      false,
    );
  });

  it('preserves legacy Identity & Lifestyle topic labels without remapping them', () => {
    assert.equal(resolveAffiliationTopicId('identity_lifestyle', 'Veteran'), 'veteran');
    assert.equal(
      formatAffiliationPrimaryLabel({
        name: 'Navy',
        categoryId: 'identity_lifestyle',
        topic: 'Veteran',
        translate: translateEn,
      }),
      'Navy',
    );
  });

  it('Family duplicates are topic + name, not name alone', () => {
    const existing = [
      {
        id: 'a',
        name: 'Sofía',
        categoryId: 'identity_lifestyle' as const,
        source: 'custom' as const,
        topic: 'father_of',
      },
    ];
    assert.equal(
      isDuplicateAffiliation(existing, {
        name: 'Sofía',
        source: 'custom',
        categoryId: 'identity_lifestyle',
        topic: 'father_of',
      }),
      true,
    );
    assert.equal(
      isDuplicateAffiliation(existing, {
        name: 'Sofía',
        source: 'custom',
        categoryId: 'identity_lifestyle',
        topic: 'mother_of',
      }),
      false,
    );
  });
});

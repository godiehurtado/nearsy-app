import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  affiliationIdentityKey,
  buildCustomAffiliationId,
  getOnboardingAffiliationCategory,
  isDuplicateAffiliation,
  isFreeTextAffiliationCategory,
  listOnboardingAffiliationCategoryIds,
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
  it('uses family for new writes and keeps identity_lifestyle as legacy', () => {
    assert.equal(isFamilyAffiliationCategory('family'), true);
    assert.equal(isFamilyAffiliationCategory('identity_lifestyle'), false);
    assert.equal(isFreeTextAffiliationCategory('family'), true);
    assert.equal(isFreeTextAffiliationCategory('identity_lifestyle'), true);
    assert.equal(affiliationRequiresName('family'), true);
    assert.equal(getOnboardingAffiliationCategory('family').name, 'Family');
    assert.equal(
      getOnboardingAffiliationCategory('identity_lifestyle').name,
      'Identity & Lifestyle',
    );
    assert.deepEqual(listOnboardingAffiliationCategoryIds().at(-1), 'family');
    assert.deepEqual(
      getOnboardingAffiliationCategory('family').topics.map((t) => t.id),
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
        categoryId: 'family',
        topic: 'father_of',
        translate: translateEs,
      }),
      'Padre de Sofía',
    );
    assert.equal(
      formatAffiliationPrimaryLabel({
        name: 'Sofía',
        categoryId: 'family',
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
        categoryId: 'family',
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

  it('preserves legacy Identity & Lifestyle topic labels without remapping parent to father_of', () => {
    assert.equal(resolveAffiliationTopicId('identity_lifestyle', 'Veteran'), 'veteran');
    assert.equal(resolveAffiliationTopicId('identity_lifestyle', 'parent'), 'parent');
    assert.equal(resolveAffiliationTopicId('family', 'parent'), null);
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
        categoryId: 'family' as const,
        source: 'custom' as const,
        topic: 'father_of',
      },
    ];
    assert.equal(
      isDuplicateAffiliation(existing, {
        name: 'Sofía',
        source: 'custom',
        categoryId: 'family',
        topic: 'father_of',
      }),
      true,
    );
    assert.equal(
      isDuplicateAffiliation(existing, {
        name: 'Sofía',
        source: 'custom',
        categoryId: 'family',
        topic: 'mother_of',
      }),
      false,
    );
  });

  it('does not invent provider keys for Family or nameless civic/faith', () => {
    assert.equal(
      affiliationIdentityKey({
        name: 'Sofía',
        source: 'provider',
        providerId: 'logo.dev:sofia',
        categoryId: 'family',
        topic: 'father_of',
      }),
      'family:father_of:sofía',
    );
    assert.equal(
      affiliationIdentityKey({
        name: '',
        source: 'custom',
        categoryId: 'faith',
        topic: 'catholic',
      }),
      'topic:faith:catholic',
    );
    assert.match(
      buildCustomAffiliationId('faith', '', [], 'catholic'),
      /^custom_faith_catholic/,
    );
    assert.doesNotMatch(
      buildCustomAffiliationId('faith', '', [], 'catholic'),
      /_org$/,
    );
  });
});

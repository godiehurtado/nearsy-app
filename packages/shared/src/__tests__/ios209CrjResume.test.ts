/**
 * Incomplete CRJ resume — named stages, old→new correspondence, bag recovery.
 * Does not add notification infrastructure or Contacts access.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CRJ_AFFILIATION_CATEGORY_IDS,
  CRJ_INTEREST_CATEGORY_IDS,
  crjIndexForResolvedStep,
  crjStepCount,
  firstAffiliationCrjStep,
  resolveCrjStep,
} from '../onboarding/crjJourney';
import {
  CRJ_RESUME_STAGE_FIELD,
  decodeCrjResumeStage,
  encodeCrjResumeStage,
  mapLegacyCrjStageToCurrent,
  readStoredAffiliationCategoryIds,
  resolveCrjResume,
  socialBagHasUserContent,
  type LegacyCrjStage,
} from '../onboarding/crjResume';
import { listOnboardingAffiliationCategoryIds } from '../affiliations/onboardingAffiliationCatalog';

const here = dirname(fileURLToPath(import.meta.url));

function readShared(rel: string): string {
  return readFileSync(join(here, '..', rel), 'utf8');
}

function prefixDoc(
  extras: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    mode: 'personal',
    realName: 'Ana',
    lastName: 'Ruiz',
    birthCountryCode: 'CO',
    languageCodes: ['es'],
    profileImage: 'https://example.com/ana.jpg',
    occupation: 'Designer',
    bio: 'Builds things nearby.',
    profiles: {
      personal: {
        realName: 'Ana',
        lastName: 'Ruiz',
        profileImage: 'https://example.com/ana.jpg',
        occupation: 'Designer',
        bio: 'Builds things nearby.',
      },
    },
    profileSetupCompleted: false,
    ...extras,
  };
}

function interestRows() {
  return Array.from({ length: 10 }, (_, i) => ({
    id: `business_item_${i}`,
    name: `Interest ${i}`,
    categoryId: 'business',
  }));
}

describe('named CRJ resume cursor', () => {
  it('round-trips every current step except success, and rejects numeric indexes', () => {
    for (let i = 0; i < crjStepCount(); i += 1) {
      const step = resolveCrjStep(i);
      assert.equal(crjIndexForResolvedStep(step), i);
      if (step.kind === 'success') {
        assert.equal(decodeCrjResumeStage(encodeCrjResumeStage(step)), null);
        continue;
      }
      const token = encodeCrjResumeStage(step);
      assert.match(token, /^v2:/);
      assert.doesNotMatch(token, /^v2:\d+$/);
      const decoded = decodeCrjResumeStage(token);
      assert.deepEqual(decoded, step);
    }

    assert.equal(decodeCrjResumeStage(0), null);
    assert.equal(decodeCrjResumeStage('0'), null);
    assert.equal(decodeCrjResumeStage('10'), null);
    assert.equal(decodeCrjResumeStage('v2:10'), null);
    assert.equal(decodeCrjResumeStage('affiliation:education'), null);
    assert.equal(decodeCrjResumeStage('v2:affiliation:identity_lifestyle'), null);
  });

  it('named cursor wins over bags and does not use old offsets', () => {
    const oldInterestIndex = 5 + 4;
    const doc = prefixDoc({
      [CRJ_RESUME_STAGE_FIELD]: 'v2:affiliation:professional',
      personalOnboardingInterests: interestRows(),
    });
    const resume = resolveCrjResume(doc);
    assert.equal(resume.source, 'named-cursor');
    assert.equal(resume.step.kind, 'affiliation');
    if (resume.step.kind !== 'affiliation') return;
    assert.equal(resume.step.categoryId, 'professional');
    assert.notEqual(crjIndexForResolvedStep(resume.step), oldInterestIndex);
  });
});

describe('explicit old-journey → new-journey correspondence', () => {
  it('maps each legacy stage by name, never by integer', () => {
    const table: Array<{
      legacy: LegacyCrjStage;
      expectedKind: string;
      expectedCategory?: string;
    }> = [
      { legacy: { kind: 'type' }, expectedKind: 'type' },
      { legacy: { kind: 'identity' }, expectedKind: 'identity' },
      { legacy: { kind: 'photo' }, expectedKind: 'photo' },
      { legacy: { kind: 'details' }, expectedKind: 'details' },
      {
        legacy: { kind: 'interestsIntro' },
        expectedKind: 'affiliation',
        expectedCategory: 'education',
      },
      {
        legacy: { kind: 'interest', categoryId: 'food' },
        expectedKind: 'affiliation',
        expectedCategory: 'education',
      },
      {
        legacy: { kind: 'interestsCelebration' },
        expectedKind: 'affiliation',
        expectedCategory: 'education',
      },
      {
        legacy: { kind: 'affiliation' },
        expectedKind: 'affiliation',
        expectedCategory: 'education',
      },
      { legacy: { kind: 'affiliationComplete' }, expectedKind: 'socialMedia' },
      { legacy: { kind: 'socialMedia' }, expectedKind: 'socialMedia' },
      { legacy: { kind: 'gallery' }, expectedKind: 'gallery' },
      { legacy: { kind: 'location' }, expectedKind: 'location' },
      { legacy: { kind: 'notifications' }, expectedKind: 'notifications' },
    ];

    for (const row of table) {
      const mapped = mapLegacyCrjStageToCurrent(row.legacy);
      assert.equal(mapped.kind, row.expectedKind, row.legacy.kind);
      if (row.expectedCategory && mapped.kind === 'affiliation') {
        assert.equal(mapped.categoryId, row.expectedCategory);
      }
    }

    const first = firstAffiliationCrjStep();
    assert.equal(first.categoryId, CRJ_AFFILIATION_CATEGORY_IDS[0]);
    assert.equal(first.affiliationCategoryIndex, 0);
  });
});

describe('legacy incomplete registrations saved before the reorder', () => {
  it('does not restart at type when the prefix is already persisted', () => {
    const resume = resolveCrjResume(prefixDoc());
    assert.equal(resume.step.kind, 'affiliation');
    if (resume.step.kind !== 'affiliation') return;
    assert.equal(resume.step.categoryId, 'education');
    assert.ok(resume.limitation);
  });

  it('interests bag without affiliations lands on Education and keeps the bag', () => {
    const interests = interestRows();
    const doc = prefixDoc({
      personalOnboardingInterests: interests,
    });
    const resume = resolveCrjResume(doc);
    assert.equal(resume.source, 'legacy-correspondence');
    assert.equal(resume.step.kind, 'affiliation');
    if (resume.step.kind !== 'affiliation') return;
    assert.equal(resume.step.categoryId, 'education');
    assert.equal(doc.personalOnboardingInterests, interests);
    assert.equal(
      Object.prototype.hasOwnProperty.call(doc, 'personalOnboardingAffiliations'),
      false,
    );
  });

  it('completed old accordion (both bags) lands on Social, not an interest index', () => {
    const doc = prefixDoc({
      personalOnboardingInterests: interestRows(),
      personalOnboardingAffiliations: [
        {
          id: 'custom_education_andes',
          name: 'Universidad de los Andes',
          categoryId: 'education',
          source: 'custom',
        },
      ],
    });
    const resume = resolveCrjResume(doc);
    assert.equal(resume.step.kind, 'socialMedia');
    assert.notEqual(resume.step.kind, 'interest');
    assert.notEqual(crjIndexForResolvedStep(resume.step), 10);
  });

  it('social URLs resume at Gallery; gallery photos resume at Location', () => {
    const socialDoc = prefixDoc({
      personalOnboardingInterests: interestRows(),
      personalOnboardingAffiliations: [],
      socialLinksPersonal: {
        facebook: 'https://facebook.com/ana',
      },
    });
    const socialResume = resolveCrjResume(socialDoc);
    assert.equal(socialResume.step.kind, 'gallery');
    assert.equal(
      socialBagHasUserContent(socialDoc.socialLinksPersonal),
      true,
    );
    assert.equal(socialBagHasUserContent({}), false);

    const galleryDoc = prefixDoc({
      personalOnboardingInterests: interestRows(),
      personalOnboardingAffiliations: [],
      socialLinksPersonal: { facebook: 'https://facebook.com/ana' },
      personalGallery: [
        {
          url: 'https://example.com/g1.jpg',
          path: 'users/u/gallery/g1.jpg',
          createdAt: 1,
        },
      ],
    });
    assert.equal(resolveCrjResume(galleryDoc).step.kind, 'location');
  });

  it('keeps identity_lifestyle rows even though CRJ has no such screen', () => {
    const rows = [
      {
        id: 'custom_identity_parent',
        name: '',
        categoryId: 'identity_lifestyle',
        source: 'custom',
        topic: 'parent',
      },
      {
        id: 'custom_education_andes',
        name: 'Universidad de los Andes',
        categoryId: 'education',
        source: 'custom',
      },
    ];
    const doc = prefixDoc({
      personalOnboardingAffiliations: rows,
    });
    const ids = readStoredAffiliationCategoryIds(doc, 'personal');
    assert.ok(ids.includes('identity_lifestyle'));
    assert.ok(ids.includes('education'));
    assert.equal(
      listOnboardingAffiliationCategoryIds().includes('identity_lifestyle'),
      false,
    );

    const hydrate = readShared('screens/ProfileCompletionScreen.tsx');
    assert.match(hydrate, /Hydrates every stored row, including legacy/);
    assert.match(hydrate, /identity_lifestyle/);
    assert.doesNotMatch(
      hydrate.split('function readOnboardingAffiliations')[1]!.slice(0, 1600),
      /listOnboardingAffiliationCategoryIds\(\)/,
    );

    const resume = resolveCrjResume(doc);
    assert.equal(resume.step.kind, 'affiliation');
    if (resume.step.kind !== 'affiliation') return;
    assert.equal(resume.step.categoryId, 'professional');
    assert.deepEqual(doc.personalOnboardingAffiliations, rows);
  });
});

describe('new-order incomplete registrations', () => {
  it('v2 cursor on an interest category resumes there after affiliations', () => {
    const food = CRJ_INTEREST_CATEGORY_IDS.find((id) => id === 'food');
    assert.ok(food);
    const doc = prefixDoc({
      [CRJ_RESUME_STAGE_FIELD]: 'v2:interest:food',
      personalOnboardingAffiliations: [],
    });
    const resume = resolveCrjResume(doc);
    assert.equal(resume.step.kind, 'interest');
    if (resume.step.kind !== 'interest') return;
    assert.equal(resume.step.categoryId, 'food');
    const index = crjIndexForResolvedStep(resume.step);
    const education = crjIndexForResolvedStep(firstAffiliationCrjStep());
    assert.ok(index > education);
  });

  it('affiliation persist without interests resumes at the next category with evidence', () => {
    const doc = prefixDoc({
      personalOnboardingAffiliations: [
        {
          id: 'custom_education_andes',
          name: 'Universidad de los Andes',
          categoryId: 'education',
          source: 'custom',
        },
      ],
    });
    const resume = resolveCrjResume(doc);
    assert.equal(resume.source, 'bag-recovery');
    assert.equal(resume.step.kind, 'affiliation');
    if (resume.step.kind !== 'affiliation') return;
    assert.equal(resume.step.categoryId, 'professional');
  });

  it('family persist without interests resumes at Interests intro', () => {
    const doc = prefixDoc({
      personalOnboardingAffiliations: [
        {
          id: 'custom_family_sofia',
          name: 'Sofía',
          categoryId: 'family',
          source: 'custom',
          topic: 'father_of',
        },
      ],
    });
    const resume = resolveCrjResume(doc);
    assert.equal(resume.step.kind, 'interestsIntro');
  });

  it('empty affiliation persist does not mark later steps complete', () => {
    const doc = prefixDoc({
      personalOnboardingAffiliations: [],
    });
    const resume = resolveCrjResume(doc);
    assert.equal(resume.step.kind, 'affiliation');
    if (resume.step.kind !== 'affiliation') return;
    assert.equal(resume.step.categoryId, 'education');
    assert.ok(resume.limitation);
    assert.notEqual(resume.step.kind, 'interestsIntro');
    assert.notEqual(resume.step.kind, 'socialMedia');
  });
});

describe('resume wiring does not add notification or Contacts infra', () => {
  it('ProfileCompletion hydrates resume after bags and persists named tokens only', () => {
    const crj = readShared('screens/ProfileCompletionScreen.tsx');
    assert.match(crj, /const resume = resolveCrjResume/);
    assert.match(crj, /setStepIndex\(crjIndexForResolvedStep\(resume\.step\)\)/);
    assert.match(crj, /crjResumePatch/);
    assert.match(crj, /\[CRJ_RESUME_STAGE_FIELD\]: null/);
    assert.doesNotMatch(crj, /scheduleNotificationAsync/);
    assert.doesNotMatch(crj, /expo-contacts/);
    assert.doesNotMatch(crj, /remote-notification/);
  });
});

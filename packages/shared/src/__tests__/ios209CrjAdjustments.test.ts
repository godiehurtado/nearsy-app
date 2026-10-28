import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CRJ_AFFILIATION_CATEGORY_IDS,
  CRJ_INTEREST_CATEGORY_IDS,
  POST_AFFILIATIONS_CRJ_STEP,
  crjStepCount,
  resolveCrjStep,
} from '../onboarding/crjJourney';
import {
  affiliationIdentityKey,
  buildCustomAffiliationId,
  listOnboardingAffiliationCategoryIds,
} from '../affiliations/onboardingAffiliationCatalog';
import { buildCrjAffiliationPersistencePatch } from '../affiliations/onboardingAffiliationPersistence';
import { resolveAffiliationTopicId } from '../affiliations/affiliationPresentation';
import {
  CRJ_MANUAL_URL_PLATFORM_IDS,
  CRJ_OWNED_SOCIAL_PLATFORM_IDS,
} from '../social/onboardingSocialCatalog';
import { crjPhaseProgress } from '../components/registration/crjProgress';

const here = dirname(fileURLToPath(import.meta.url));

function readShared(rel: string): string {
  return readFileSync(join(here, '..', rel), 'utf8');
}

function kindsInOrder(): string[] {
  const out: string[] = [];
  for (let i = 0; i < crjStepCount(); i += 1) {
    const step = resolveCrjStep(i);
    if (step.kind === 'affiliation') {
      out.push(`affiliation:${step.categoryId}`);
    } else if (step.kind === 'interest') {
      out.push(`interest:${step.categoryId}`);
    } else {
      out.push(step.kind);
    }
  }
  return out;
}

describe('iOS 2.0.9 CRJ order — affiliations before interests', () => {
  it('walks Details → Education … Family → Interests intro → first interest', () => {
    const kinds = kindsInOrder();
    const details = kinds.indexOf('details');
    const education = kinds.indexOf('affiliation:education');
    const family = kinds.indexOf('affiliation:family');
    const intro = kinds.indexOf('interestsIntro');
    const firstInterest = kinds.findIndex((k) => k.startsWith('interest:'));
    const celebration = kinds.indexOf('interestsCelebration');
    const social = kinds.indexOf('socialMedia');

    assert.ok(details >= 0);
    assert.equal(education, details + 1);
    assert.equal(family, education + CRJ_AFFILIATION_CATEGORY_IDS.length - 1);
    assert.equal(intro, family + 1);
    assert.equal(firstInterest, intro + 1);
    assert.equal(celebration, firstInterest + CRJ_INTEREST_CATEGORY_IDS.length);
    assert.equal(social, celebration + 1);
    assert.equal(POST_AFFILIATIONS_CRJ_STEP, 'interestsIntro');
    assert.deepEqual(listOnboardingAffiliationCategoryIds(), [
      'education',
      'professional',
      'community',
      'sports_clubs',
      'faith',
      'political_civic',
      'family',
    ]);
  });

  it('affiliations progress sits before interests on the soft bar', () => {
    assert.ok(crjPhaseProgress('affiliations') < crjPhaseProgress('interests'));
  });

  it('does not remap a stored numeric index — resume hydrates bags and re-walks', () => {
    const crj = readShared('screens/ProfileCompletionScreen.tsx');
    const journey = readShared('onboarding/crjJourney.ts');
    assert.match(crj, /useState\(0\)/);
    assert.match(crj, /readOnboardingAffiliations/);
    assert.match(crj, /readOnboardingInterests/);
    assert.match(crj, /readCrjSocialDraft/);
    assert.match(journey, /never by remapping a stored numeric index/);
    assert.match(crj, /profileSetupCompleted: false/);
  });
});

describe('iOS 2.0.9 CRJ affiliations — per-category, contracts preserved', () => {
  it('CRJ hosts OnboardingAffiliationCategoryPanel per category, not the accordion', () => {
    const crj = readShared('screens/ProfileCompletionScreen.tsx');
    const editor = readShared('screens/AffiliationsScreen.tsx');
    assert.match(crj, /<OnboardingAffiliationCategoryPanel/);
    assert.doesNotMatch(crj, /AffiliationCategoryAccordionList/);
    assert.match(editor, /AffiliationCategoryAccordionList/);
    const firstAffiliation = resolveCrjStep(4);
    assert.equal(firstAffiliation.kind, 'affiliation');
    if (firstAffiliation.kind !== 'affiliation') return;
    assert.equal(firstAffiliation.categoryId, 'education');
    assert.equal(firstAffiliation.affiliationCategoryIndex, 0);
  });

  it('Family / legacy Identity & Lifestyle / Faith-Civic nameless contracts stay intact', () => {
    const family = buildCrjAffiliationPersistencePatch('personal', [
      {
        id: 'custom_family_sofia',
        name: 'Sofía',
        categoryId: 'family',
        source: 'provider',
        providerId: 'logo.dev:sofia',
        topic: 'father_of',
      },
    ]);
    const familyRow = family.personalOnboardingAffiliations![0]!;
    assert.equal(familyRow.categoryId, 'family');
    assert.equal(familyRow.source, 'custom');
    assert.equal(familyRow.providerId, undefined);
    assert.equal(
      affiliationIdentityKey({
        name: 'Sofía',
        source: 'custom',
        categoryId: 'family',
        topic: 'father_of',
      }).startsWith('provider:'),
      false,
    );

    assert.equal(
      resolveAffiliationTopicId('identity_lifestyle', 'parent'),
      'parent',
    );

    const id = buildCustomAffiliationId(
      'faith',
      '',
      ['custom_faith_catholic'],
      'catholic',
    );
    const faith = buildCrjAffiliationPersistencePatch('personal', [
      {
        id,
        name: '',
        categoryId: 'faith',
        source: 'custom',
        topic: 'catholic',
      },
    ]);
    const faithRow = faith.personalOnboardingAffiliations![0]!;
    assert.equal(faithRow.name, '');
    assert.equal(faithRow.topic, 'catholic');
    assert.equal(faith.profileSetupCompleted, false);
  });
});

describe('iOS 2.0.9 CRJ social — ownership Connect/Get/Unlink, no inbox admin', () => {
  it('CRJ social step uses owned Connect/Get/Unlink clients and manual FB/LinkedIn URLs', () => {
    const step = readShared(
      'components/registration/OnboardingSocialMediaStep.tsx',
    );
    const owned = readShared(
      'components/registration/OwnedSocialConnectSection.tsx',
    );
    const crj = readShared('screens/ProfileCompletionScreen.tsx');
    assert.match(step, /OwnedSocialConnectSection/);
    assert.match(step, /CRJ_MANUAL_URL_SOCIAL_PLATFORMS\.map/);
    assert.equal(CRJ_MANUAL_URL_PLATFORM_IDS.includes('snapchat' as never), false);
    assert.equal(CRJ_OWNED_SOCIAL_PLATFORM_IDS.includes('snapchat' as never), false);
    assert.deepEqual(CRJ_OWNED_SOCIAL_PLATFORM_IDS, [
      'youtube',
      'tiktok',
      'instagram',
      'x',
    ]);
    assert.deepEqual(CRJ_MANUAL_URL_PLATFORM_IDS, ['linkedin', 'facebook']);
    assert.match(owned, /getYoutubeOwnershipController/);
    assert.match(owned, /getTiktokOwnershipController/);
    assert.match(owned, /getInstagramOwnershipClient/);
    assert.match(owned, /getXOwnershipController/);
    assert.match(owned, /client\.get\(/);
    assert.match(owned, /client\.unlink/);
    assert.match(owned, /outcome\.kind === 'cancelled'/);
    assert.match(owned, /NOT_ENABLED|not-enabled|youtubeOwnershipErrorMessageKey/);
    assert.doesNotMatch(owned, /inboxAuthorizeStart/);
    assert.doesNotMatch(owned, /instagramInboxAuthorizeStart/);
    assert.doesNotMatch(step, /inboxAuthorizeStart/);
    assert.doesNotMatch(crj, /inboxAuthorizeStart/);
    assert.match(crj, /omitYoutubeFromDraftValues/);
    assert.match(crj, /advanceSocialMedia\(\{ requireValidFields: false \}\)/);
  });
});

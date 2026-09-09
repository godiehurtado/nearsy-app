import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildCrjInterestPersistencePatch,
  buildInterestFieldPersistencePatch,
  buildPostCrjInterestPersistencePatch,
  type OnboardingSelectedInterest,
} from '../interests/onboardingInterestCatalog';
import {
  buildAffiliationFieldPersistencePatch,
  buildCrjAffiliationPersistencePatch,
  buildPostCrjAffiliationPersistencePatch,
} from '../affiliations/onboardingAffiliationPersistence';
import type { OnboardingSelectedAffiliation } from '../affiliations/onboardingAffiliationCatalog';
import {
  buildCrjSocialLinksPersistencePatch,
  buildPostCrjSocialLinksPersistencePatch,
  buildSocialLinksFieldPersistencePatch,
} from '../social/onboardingSocialPersistence';
import {
  CRJ_SOCIAL_PLATFORM_IDS,
  emptyCrjSocialDraftValues,
} from '../social/onboardingSocialCatalog';

function assertNoLifecycleKeys(patch: object) {
  assert.equal(
    Object.prototype.hasOwnProperty.call(patch, 'profileSetupCompleted'),
    false,
  );
  assert.equal(Object.prototype.hasOwnProperty.call(patch, 'mode'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(patch, 'visibility'), false);
}

function sampleInterest(
  id: string,
  categoryId: OnboardingSelectedInterest['categoryId'],
  groupId?: string,
): OnboardingSelectedInterest {
  return {
    id,
    name: id,
    categoryId,
    icon: 'star-outline',
    iconColor: '#2563EB',
    ...(groupId ? { groupId } : {}),
  };
}

describe('post-CRJ Interests field persistence', () => {
  it('Personal exact keys only; no lifecycle / opposite / InterestAffiliations', () => {
    const selected = [sampleInterest('business_entrepreneurship', 'business')];
    const patch = buildPostCrjInterestPersistencePatch('personal', selected);
    assertNoLifecycleKeys(patch);
    assert.deepEqual(Object.keys(patch).sort(), [
      'personalInterests',
      'personalOnboardingInterests',
    ]);
    assert.equal(
      Object.prototype.hasOwnProperty.call(patch, 'personalInterestAffiliations'),
      false,
    );
    assert.equal(
      Object.prototype.hasOwnProperty.call(
        patch,
        'professionalInterestAffiliations',
      ),
      false,
    );
    assert.equal(patch.professionalInterests, undefined);
    assert.equal(patch.professionalOnboardingInterests, undefined);
  });

  it('Professional exact keys only', () => {
    const selected = [
      sampleInterest('music_anime_series', 'music', 'music_group_anime'),
    ];
    const patch = buildPostCrjInterestPersistencePatch(
      'professional',
      selected,
    );
    assertNoLifecycleKeys(patch);
    assert.deepEqual(Object.keys(patch).sort(), [
      'professionalInterests',
      'professionalOnboardingInterests',
    ]);
    assert.equal(patch.personalInterests, undefined);
  });

  it('preserves official metadata (id, name, categoryId, icon, iconColor, groupId)', () => {
    const selected = [
      sampleInterest('music_anime_series', 'music', 'music_group_anime'),
    ];
    const patch = buildInterestFieldPersistencePatch('personal', selected);
    const row = patch.personalOnboardingInterests![0]!;
    assert.equal(row.id, 'music_anime_series');
    assert.equal(row.name, 'music_anime_series');
    assert.equal(row.categoryId, 'music');
    assert.equal(row.icon, 'star-outline');
    assert.equal(row.iconColor, '#2563EB');
    assert.equal(row.groupId, 'music_group_anime');
    assert.equal(row.isCustom, undefined);
  });

  it('preserves custom metadata (isCustom, name, categoryId)', () => {
    const custom: OnboardingSelectedInterest = {
      id: 'custom_community_pottery',
      name: 'Pottery',
      categoryId: 'community',
      icon: 'leaf-outline',
      iconColor: '#16A34A',
      isCustom: true,
    };
    const patch = buildPostCrjInterestPersistencePatch('personal', [custom]);
    const row = patch.personalOnboardingInterests![0]!;
    assert.equal(row.isCustom, true);
    assert.equal(row.name, 'Pottery');
    assert.equal(row.categoryId, 'community');
    assert.ok(patch.personalInterests!.includes('Pottery'));
  });

  it('filters structural _other / _group_ non-custom items like CRJ', () => {
    const selected = [
      sampleInterest('music_group_genres', 'music'),
      sampleInterest('music_group_genres_other', 'music', 'music_group_genres'),
      sampleInterest('business_entrepreneurship', 'business'),
    ];
    const patch = buildPostCrjInterestPersistencePatch('personal', selected);
    assert.equal(patch.personalOnboardingInterests!.length, 1);
    assert.equal(
      patch.personalOnboardingInterests![0]!.id,
      'business_entrepreneurship',
    );
  });

  it('delete is represented by full replacement array', () => {
    const before = buildPostCrjInterestPersistencePatch('personal', [
      sampleInterest('business_entrepreneurship', 'business'),
      sampleInterest('travel_item_0', 'travel'),
    ]);
    assert.equal(before.personalOnboardingInterests!.length, 2);
    const after = buildPostCrjInterestPersistencePatch('personal', [
      sampleInterest('business_entrepreneurship', 'business'),
    ]);
    assert.equal(after.personalOnboardingInterests!.length, 1);
    assert.equal(
      after.personalOnboardingInterests![0]!.id,
      'business_entrepreneurship',
    );
  });

  it('CRJ wrapper still sets profileSetupCompleted: false from pure fields', () => {
    const field = buildInterestFieldPersistencePatch('personal', [
      sampleInterest('business_entrepreneurship', 'business'),
    ]);
    const crj = buildCrjInterestPersistencePatch('personal', [
      sampleInterest('business_entrepreneurship', 'business'),
    ]);
    assert.equal(crj.profileSetupCompleted, false);
    assert.deepEqual(crj.personalInterests, field.personalInterests);
    assert.deepEqual(
      crj.personalOnboardingInterests,
      field.personalOnboardingInterests,
    );
  });
});

describe('post-CRJ Affiliations field persistence', () => {
  const providerRow: OnboardingSelectedAffiliation = {
    id: 'fixture:um',
    name: 'University of Miami',
    categoryId: 'education',
    source: 'provider',
    providerId: 'fixture:um',
    provider: 'logo_dev',
    logoUrl: 'https://example.com/um.png',
    website: 'https://miami.edu',
    topic: 'Universities',
  };

  const customRow: OnboardingSelectedAffiliation = {
    id: 'custom_community_my_local_club',
    name: 'My Local Club',
    categoryId: 'community',
    source: 'custom',
  };

  it('writes canonical onboarding bag + legacy bridge for Personal', () => {
    const patch = buildPostCrjAffiliationPersistencePatch('personal', [
      providerRow,
    ]);
    assertNoLifecycleKeys(patch);
    assert.ok(patch.personalOnboardingAffiliations);
    assert.ok(patch.personalAffiliations);
    assert.equal(patch.professionalOnboardingAffiliations, undefined);
    assert.equal(patch.professionalAffiliations, undefined);
  });

  it('isolates Professional from Personal', () => {
    const patch = buildPostCrjAffiliationPersistencePatch('professional', [
      customRow,
    ]);
    assertNoLifecycleKeys(patch);
    assert.ok(patch.professionalOnboardingAffiliations);
    assert.ok(patch.professionalAffiliations);
    assert.equal(patch.personalOnboardingAffiliations, undefined);
    assert.equal(patch.personalAffiliations, undefined);
  });

  it('preserves provider/custom metadata including logo and website', () => {
    const patch = buildAffiliationFieldPersistencePatch('personal', [
      providerRow,
      customRow,
    ]);
    const onboarding = patch.personalOnboardingAffiliations!;
    const um = onboarding.find((r) => r.id === 'fixture:um')!;
    assert.equal(um.name, 'University of Miami');
    assert.equal(um.categoryId, 'education');
    assert.equal(um.source, 'provider');
    assert.equal(um.providerId, 'fixture:um');
    assert.equal(um.provider, 'logo_dev');
    assert.equal(um.logoUrl, 'https://example.com/um.png');
    assert.equal(um.website, 'https://miami.edu');
    assert.equal(um.topic, 'Universities');
    const custom = onboarding.find(
      (r) => r.id === 'custom_community_my_local_club',
    )!;
    assert.equal(custom.source, 'custom');
    assert.equal(custom.name, 'My Local Club');
    const legacy = patch.personalAffiliations!.find(
      (r) => r.label === 'University of Miami',
    )!;
    assert.equal(legacy.imageUrl, 'https://example.com/um.png');
  });

  it('delete is full replacement of both bags', () => {
    const after = buildPostCrjAffiliationPersistencePatch('personal', [
      customRow,
    ]);
    assert.equal(after.personalOnboardingAffiliations!.length, 1);
    assert.equal(after.personalAffiliations!.length, 1);
    assert.equal(after.personalOnboardingAffiliations![0]!.id, customRow.id);
  });

  it('CRJ wrapper still sets profileSetupCompleted: false', () => {
    const field = buildAffiliationFieldPersistencePatch('personal', [
      customRow,
    ]);
    const crj = buildCrjAffiliationPersistencePatch('personal', [customRow]);
    assert.equal(crj.profileSetupCompleted, false);
    assert.deepEqual(
      crj.personalOnboardingAffiliations,
      field.personalOnboardingAffiliations,
    );
    assert.deepEqual(crj.personalAffiliations, field.personalAffiliations);
  });
});

describe('post-CRJ Social Links field persistence', () => {
  it('isolates Personal / Professional bags', () => {
    const values = emptyCrjSocialDraftValues();
    values.instagram = '@diego';
    const personal = buildPostCrjSocialLinksPersistencePatch(
      'personal',
      values,
      [],
    );
    assertNoLifecycleKeys(personal);
    assert.ok(personal.socialLinksPersonal);
    assert.equal(personal.socialLinksProfessional, undefined);

    const professional = buildPostCrjSocialLinksPersistencePatch(
      'professional',
      values,
      [],
    );
    assertNoLifecycleKeys(professional);
    assert.ok(professional.socialLinksProfessional);
    assert.equal(professional.socialLinksPersonal, undefined);
  });

  it('normalizes platform handles to HTTPS', () => {
    const values = emptyCrjSocialDraftValues();
    values.instagram = '@diego';
    values.x = 'nearsy';
    const patch = buildPostCrjSocialLinksPersistencePatch(
      'personal',
      values,
      [],
    );
    assert.equal(
      patch.socialLinksPersonal?.instagram,
      'https://www.instagram.com/diego',
    );
    assert.equal(patch.socialLinksPersonal?.twitter, 'https://x.com/nearsy');
  });

  it('omits empty values and rejects invalid platform input', () => {
    const values = emptyCrjSocialDraftValues();
    values.instagram = '   ';
    values.linkedin = 'javascript:alert(1)';
    const patch = buildPostCrjSocialLinksPersistencePatch(
      'personal',
      values,
      [],
    );
    assert.equal(patch.socialLinksPersonal?.instagram, undefined);
    assert.equal(patch.socialLinksPersonal?.linkedin, undefined);
  });

  it('Website is editable and normalized post-CRJ', () => {
    const values = emptyCrjSocialDraftValues();
    values.instagram = '@diego';
    const patch = buildPostCrjSocialLinksPersistencePatch(
      'personal',
      values,
      [],
      { website: 'www.nearsy.app' },
    );
    assert.equal(
      patch.socialLinksPersonal?.website,
      'https://www.nearsy.app/',
    );
    assert.equal(
      patch.socialLinksPersonal?.instagram,
      'https://www.instagram.com/diego',
    );
  });

  it('empty Website draft clears website on post-CRJ replace', () => {
    const values = emptyCrjSocialDraftValues();
    const patch = buildPostCrjSocialLinksPersistencePatch(
      'personal',
      values,
      [],
      {
        website: '',
        existing: { website: 'https://old.example.com' },
      },
    );
    assert.equal(patch.socialLinksPersonal?.website, undefined);
  });

  it('CRJ preserves existing Website without adding Website to CRJ catalog', () => {
    assert.ok(!CRJ_SOCIAL_PLATFORM_IDS.includes('website' as never));
    const values = emptyCrjSocialDraftValues();
    values.instagram = '@diego';
    const crj = buildCrjSocialLinksPersistencePatch('personal', values, [], {
      website: 'https://nearsy.app',
      instagram: 'https://www.instagram.com/old',
    });
    assert.equal(crj.profileSetupCompleted, false);
    assert.equal(crj.socialLinksPersonal?.website, 'https://nearsy.app');
    assert.equal(
      crj.socialLinksPersonal?.instagram,
      'https://www.instagram.com/diego',
    );
  });

  it('custom preserved when supplied; removed when empty replacement draft', () => {
    const values = emptyCrjSocialDraftValues();
    const withCustom = buildPostCrjSocialLinksPersistencePatch(
      'personal',
      values,
      [{ name: 'Mastodon', url: 'https://mastodon.social/@nearsy' }],
    );
    assert.equal(withCustom.socialLinksPersonal?.custom?.length, 1);
    assert.equal(withCustom.socialLinksPersonal?.custom?.[0]?.name, 'Mastodon');

    const cleared = buildPostCrjSocialLinksPersistencePatch(
      'personal',
      values,
      [],
    );
    assert.equal(cleared.socialLinksPersonal?.custom, undefined);
  });

  it('field builder matches CRJ field bags when websiteMode preserve-existing', () => {
    const values = emptyCrjSocialDraftValues();
    values.linkedin = 'jane';
    const field = buildSocialLinksFieldPersistencePatch('professional', {
      values,
      custom: [],
      websiteMode: 'preserve-existing',
      existing: { website: 'https://company.example' },
    });
    const crj = buildCrjSocialLinksPersistencePatch(
      'professional',
      values,
      [],
      { website: 'https://company.example' },
    );
    assert.equal(crj.profileSetupCompleted, false);
    assert.deepEqual(
      crj.socialLinksProfessional,
      field.socialLinksProfessional,
    );
  });

  it('post-CRJ builder never includes lifecycle keys', () => {
    const patch = buildPostCrjSocialLinksPersistencePatch(
      'personal',
      emptyCrjSocialDraftValues(),
      [],
      { website: 'https://ok.example' },
    );
    assertNoLifecycleKeys(patch);
  });
});

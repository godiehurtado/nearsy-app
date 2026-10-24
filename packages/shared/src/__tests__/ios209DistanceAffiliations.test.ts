import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildCustomAffiliationId,
  isFreeTextAffiliationCategory,
  type OnboardingSelectedAffiliation,
} from '../affiliations/onboardingAffiliationCatalog';
import { isEphemeralProviderLogoUrl } from '../affiliations/affiliationLogoDev';
import {
  buildPostCrjAffiliationPersistencePatch,
  buildCrjAffiliationPersistencePatch,
} from '../affiliations/onboardingAffiliationPersistence';
import { resolveAffiliationSearchUi } from '../affiliations/affiliationSearchInteraction';

const here = dirname(fileURLToPath(import.meta.url));

function readShared(rel: string): string {
  return readFileSync(join(here, '..', rel), 'utf8');
}

describe('IOS-209 hide distance presentation', () => {
  it('Nearby card no longer formats numeric distance', () => {
    const screen = readShared('screens/NearbySearchScreen.tsx');
    assert.doesNotMatch(screen, /formatDistance/);
    assert.doesNotMatch(screen, /nearby\.distanceAwayFt/);
    assert.doesNotMatch(screen, /nearby\.distanceAwayM/);
    assert.doesNotMatch(screen, /metersToFeet/);
    assert.doesNotMatch(screen, /resolveDistanceDisplayUnit/);
    assert.match(screen, /DiscoverNearbyResult/);
    assert.match(screen, /loadNearbyWithContractualRefresh/);
  });

  it('Home distance range selector copy remains available', () => {
    const home = readShared('screens/MainHomeScreen.tsx');
    assert.match(home, /home\.preferences\.distanceRange/);
    assert.match(home, /VisibilityRangeSlider|maxDistanceMeters/);
  });
});

describe('IOS-209 Identity & Lifestyle free text', () => {
  it('marks family and identity_lifestyle as free-text', () => {
    assert.equal(isFreeTextAffiliationCategory('family'), true);
    assert.equal(isFreeTextAffiliationCategory('identity_lifestyle'), true);
    assert.equal(isFreeTextAffiliationCategory('education'), false);
    assert.equal(isFreeTextAffiliationCategory('professional'), false);
  });

  it('panel skips entity search and Logo.dev rebuild for family and identity_lifestyle', () => {
    const panel = readShared(
      'components/registration/OnboardingAffiliationCategoryPanel.tsx',
    );
    assert.match(panel, /isFreeTextAffiliationCategory/);
    assert.match(panel, /identityFreeTextHint/);
    assert.match(panel, /identityUpload/);
    assert.match(panel, /freeTextCategory \? false : results\.length/);
    assert.match(
      panel,
      /Family and Identity & Lifestyle never reconstructs Logo\.dev|if \(freeTextCategory\) return undefined/,
    );
  });

  it('free-text add is available without provider results', () => {
    const ui = resolveAffiliationSearchUi({
      searchFocused: true,
      pickedName: null,
      customName: 'Veterano',
      customNameValid: true,
      hasProviderResults: false,
      searchPending: false,
      suggestionsUnavailable: false,
      hasDraftImage: false,
    });
    assert.equal(ui.phase, 'custom_ready');
    assert.equal(ui.showAddCta, true);
  });

  it('avoids custom id collisions without redesigning the scheme', () => {
    const first = buildCustomAffiliationId('identity_lifestyle', 'Pet parent');
    const collidingSlug = buildCustomAffiliationId('identity_lifestyle', 'Pet  parent', [
      first,
    ]);
    assert.equal(first, 'custom_identity_lifestyle_pet_parent');
    assert.equal(collidingSlug, 'custom_identity_lifestyle_pet_parent_2');
    assert.notEqual(first, collidingSlug);
  });

  it('persists Firebase Storage logos that contain token= and strips Logo.dev', () => {
    const storageUrl =
      'https://firebasestorage.googleapis.com/v0/b/nearsy-dev.appspot.com/o/users%2Fu1%2Faffiliations%2Fx.jpg?alt=media&token=abc-123';
    assert.equal(isEphemeralProviderLogoUrl(storageUrl), false);
    assert.equal(
      isEphemeralProviderLogoUrl(
        'https://img.logo.dev/example.com?token=pk_test',
      ),
      true,
    );

    const ownImage: OnboardingSelectedAffiliation = {
      id: 'custom_identity_lifestyle_parent',
      name: 'Parent',
      categoryId: 'identity_lifestyle',
      source: 'custom',
      logoUrl: storageUrl,
      topic: 'Parent',
    };
    const patch = buildPostCrjAffiliationPersistencePatch('personal', [
      ownImage,
    ]);
    assert.equal(
      patch.personalOnboardingAffiliations![0]!.logoUrl,
      storageUrl,
    );
    assert.equal(patch.personalAffiliations![0]!.imageUrl, storageUrl);
    assert.equal(patch.personalOnboardingAffiliations![0]!.source, 'custom');
  });

  it('onboarding and editor upload local affiliation images before persist', () => {
    const crj = readShared('screens/ProfileCompletionScreen.tsx');
    assert.match(crj, /uploadAffiliationImage/);
    assert.match(crj, /persistAffiliations/);

    const editor = readShared('screens/AffiliationsScreen.tsx');
    assert.match(editor, /uploadAffiliationImage/);
    const saveBlock = editor.slice(
      editor.indexOf('const handleSave'),
      editor.indexOf('const bottomBarInset'),
    );
    assert.match(saveBlock, /uploadAffiliationImage/);
    assert.match(saveBlock, /isLocalAffiliationUri/);
    assert.match(saveBlock, /buildPostCrjAffiliationPersistencePatch/);
    // Existing rows keep id/source; only local logoUrl is replaced.
    assert.match(saveBlock, /\{\s*\.\.\.item,\s*logoUrl\s*\}/);
    assert.doesNotMatch(saveBlock, /buildCustomAffiliationId/);
  });

  it('saving an existing entry preserves id and custom source', () => {
    const existing: OnboardingSelectedAffiliation = {
      id: 'custom_identity_lifestyle_veteran',
      name: 'Veteran',
      categoryId: 'identity_lifestyle',
      source: 'custom',
      logoUrl:
        'https://firebasestorage.googleapis.com/v0/b/x/o/y.jpg?alt=media&token=abc',
      topic: 'Veteran',
    };
    const patch = buildPostCrjAffiliationPersistencePatch('personal', [
      existing,
    ]);
    const row = patch.personalOnboardingAffiliations![0]!;
    assert.equal(row.id, 'custom_identity_lifestyle_veteran');
    assert.equal(row.source, 'custom');
    assert.equal(row.name, 'Veteran');
    assert.equal(row.logoUrl, existing.logoUrl);
  });

  it('new free-text ids stay custom_* and source custom for backend', () => {
    const id = buildCustomAffiliationId('identity_lifestyle', 'Dog parent');
    assert.match(id, /^custom_identity_lifestyle_/);
    const row: OnboardingSelectedAffiliation = {
      id,
      name: 'Dog parent',
      categoryId: 'identity_lifestyle',
      source: 'custom',
      topic: 'Pet parent',
    };
    const patch = buildPostCrjAffiliationPersistencePatch('personal', [row]);
    assert.equal(patch.personalOnboardingAffiliations![0]!.source, 'custom');
    assert.equal(patch.personalOnboardingAffiliations![0]!.id, id);
    assert.equal(
      patch.personalOnboardingAffiliations![0]!.categoryId,
      'identity_lifestyle',
    );
  });

  it('public Discovery affiliations never rebuild Logo.dev on the client', () => {
    const card = readShared(
      'components/profileExploration/DiscoveryAffiliationsCard.tsx',
    );
    const parser = readShared('visibility/discoveryAffiliations.ts');
    assert.doesNotMatch(card, /buildLogoDevImageUrl/);
    assert.doesNotMatch(card, /img\.logo\.dev/);
    assert.doesNotMatch(parser, /buildLogoDevImageUrl/);
    assert.match(card, /logoUrl=\{item\.logoUrl\}/);
  });

  it('CRJ persistence keeps identity_lifestyle as custom without Logo.dev logoUrl', () => {
    const row: OnboardingSelectedAffiliation = {
      id: 'custom_identity_lifestyle_veteran',
      name: 'Veteran',
      categoryId: 'identity_lifestyle',
      source: 'custom',
      logoUrl: 'https://img.logo.dev/example.com?token=pk_x',
      topic: 'Veteran',
    };
    const patch = buildCrjAffiliationPersistencePatch('personal', [row]);
    assert.equal(patch.personalOnboardingAffiliations![0]!.source, 'custom');
    assert.equal(patch.personalOnboardingAffiliations![0]!.logoUrl, undefined);
    assert.equal(patch.profileSetupCompleted, false);
  });
});

describe('IOS-209 Identity & Lifestyle i18n topics', () => {
  it('exposes EN/ES topic keys used by the panel', () => {
    const en = readShared('i18n/resources/onboarding.ts');
    const es = readShared('i18n/locales/es.ts');
    for (const key of [
      'cultural_background',
      'hometown',
      'parent',
      'pet_parent',
      'veteran',
      'personality_type',
      'father_of',
      'mother_of',
      'child_of',
      'sibling_of',
      'spouse_of',
      'partner_of',
      'grandparent_of',
      'grandchild_of',
    ]) {
      assert.match(en, new RegExp(`${key}:`));
      assert.match(es, new RegExp(`${key}:`));
    }
    assert.match(en, /identityFreeTextHint:/);
    assert.match(es, /identityFreeTextHint:/);
    assert.match(en, /family: 'Family'/);
    assert.match(es, /family: 'Familia'/);
    assert.match(en, /identity_lifestyle: 'Identity & Lifestyle'/);
    assert.match(es, /identity_lifestyle: 'Identidad y estilo de vida'/);
  });
});

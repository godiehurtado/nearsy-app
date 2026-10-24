import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { resolveAffiliationSearchUi } from '../affiliations/affiliationSearchInteraction.ts';
import {
  affiliationNameRequired,
  formatAffiliationCaption,
  formatPublicAffiliationCaption,
  isFamilyAffiliationCategory,
  isTopicOptionalNameCategory,
  persistAffiliationTopicId,
} from '../affiliations/affiliationPresentation.ts';
import {
  FAMILY_CATEGORY_ID,
  LEGACY_IDENTITY_LIFESTYLE_CATEGORY,
  affiliationAllowsProviderIdentity,
  affiliationIdentityKey,
  buildUniqueCustomAffiliationId,
  getOnboardingAffiliationCategory,
  listOnboardingAffiliationCategoryIds,
} from '../affiliations/onboardingAffiliationCatalog.ts';
import { buildPostCrjAffiliationPersistencePatch } from '../affiliations/onboardingAffiliationPersistence.ts';
import {
  countAffiliationsForOwnProfileSummary,
  readOnboardingAffiliationsFromDoc,
} from '../affiliations/postCrjAffiliationEditor.ts';
import { parseDiscoveryAffiliations } from '../visibility/discoveryAffiliations.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function localize(id: string, fallback: string): string {
  const es: Record<string, string> = {
    father_of: 'Padre de',
    democratic_party: 'Partido Demócrata',
    sports_team: 'Equipo deportivo',
    pet_parent: 'Pet parent de',
    parent: 'Padre o madre',
  };
  return es[id] ?? fallback;
}

describe('NEARSY-209 affiliation captions', () => {
  it('persists new Family rows as family and keeps identity_lifestyle legacy', () => {
    const family = getOnboardingAffiliationCategory('family');
    assert.equal(family.id, FAMILY_CATEGORY_ID);
    assert.equal(family.name, 'Family');
    assert.equal(family.entrySource, 'freeText');
    assert.equal(isFamilyAffiliationCategory('family'), true);
    assert.equal(isFamilyAffiliationCategory('identity_lifestyle'), false);
    assert.equal(affiliationNameRequired('family'), true);
    assert.equal(affiliationNameRequired('identity_lifestyle'), true);
    assert.equal(isTopicOptionalNameCategory('political_civic'), true);
    assert.equal(affiliationNameRequired('political_civic'), false);
    assert.equal(affiliationNameRequired('faith'), false);
    assert.equal(affiliationNameRequired('sports_clubs'), true);
    assert.equal(LEGACY_IDENTITY_LIFESTYLE_CATEGORY.id, 'identity_lifestyle');
    assert.ok(
      LEGACY_IDENTITY_LIFESTYLE_CATEGORY.topics.some((row) => row.id === 'parent'),
    );
    assert.equal(
      listOnboardingAffiliationCategoryIds().includes('family'),
      true,
    );
    assert.equal(
      listOnboardingAffiliationCategoryIds().includes('identity_lifestyle'),
      false,
    );
  });

  it('Family reads Padre de Sofía and does not convert legacy Identity parent', () => {
    assert.equal(
      formatAffiliationCaption(
        {
          name: 'Sofía',
          categoryId: 'family',
          topic: 'father_of',
        },
        localize,
      ),
      'Padre de Sofía',
    );
    assert.equal(
      formatAffiliationCaption(
        {
          name: 'Luna',
          categoryId: 'family',
          topic: 'pet_parent',
        },
        localize,
      ),
      'Pet parent de Luna',
    );
    assert.equal(
      formatAffiliationCaption(
        {
          name: 'Ana',
          categoryId: 'identity_lifestyle',
          topic: 'parent',
        },
        localize,
      ),
      'Ana / Padre o madre',
    );
  });

  it('named rows show name / subcategory; topic-only shows subcategory', () => {
    assert.equal(
      formatAffiliationCaption(
        {
          name: 'Florida Demócratas',
          categoryId: 'political_civic',
          topic: 'democratic_party',
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
          topic: 'sports_team',
        },
        localize,
      ),
      'Inter Miami FC / Equipo deportivo',
    );
    assert.equal(
      formatAffiliationCaption(
        {
          name: '',
          categoryId: 'political_civic',
          topic: 'democratic_party',
        },
        localize,
      ),
      'Partido Demócrata',
    );
  });

  it('public Discovery composes from type topic ids including nameless civic', () => {
    assert.equal(
      formatPublicAffiliationCaption(
        { name: 'Sofía', type: 'father_of' },
        localize,
      ),
      'Padre de Sofía',
    );
    assert.equal(
      formatPublicAffiliationCaption(
        { name: 'Florida Demócratas', type: 'democratic_party' },
        localize,
      ),
      'Florida Demócratas / Partido Demócrata',
    );
    assert.equal(
      formatPublicAffiliationCaption(
        { name: '', type: 'democratic_party' },
        localize,
      ),
      'Partido Demócrata',
    );
    const parsed = parseDiscoveryAffiliations([
      { id: 'civic1', name: '', type: 'democratic_party', logoUrl: null },
      { id: 'fam1', name: 'Sofía', type: 'father_of', logoUrl: null },
    ]);
    assert.equal(parsed.length, 2);
    assert.equal(parsed[0].name, '');
    assert.equal(parsed[1].type, 'father_of');
    const namelessFaith = parseDiscoveryAffiliations([
      { id: 'faith1', name: '', type: 'catholic', logoUrl: null },
    ]);
    assert.equal(namelessFaith.length, 1);
    assert.equal(namelessFaith[0]?.name, '');
    assert.equal(namelessFaith[0]?.type, 'catholic');
    assert.equal(
      formatPublicAffiliationCaption(
        { name: '', type: 'catholic' },
        localize,
      ),
      'Catholic',
    );
  });

  it('selecting a Faith or Civic subcategory enables Add without copying the topic into name', () => {
    const ui = resolveAffiliationSearchUi({
      searchFocused: false,
      pickedName: null,
      customName: '',
      customNameValid: true,
      hasProviderResults: false,
      searchPending: false,
      suggestionsUnavailable: false,
      hasDraftImage: false,
      topicOnlyReady: true,
    });
    assert.equal(ui.showAddCta, true);
    assert.equal(ui.addName, null);
    assert.equal(ui.hideJourneyFooter, false);
    const screen = readFileSync(
      path.join(root, 'screens/AffiliationsScreen.tsx'),
      'utf8',
    );
    assert.match(screen, /pendingSearch\?\.ui\.showAddCta \?/);
    assert.doesNotMatch(
      screen,
      /showAddCta && pendingSearch\.ui\.addName/,
    );
    const panel = readFileSync(
      path.join(
        root,
        'components/registration/OnboardingAffiliationCategoryPanel.tsx',
      ),
      'utf8',
    );
    assert.match(
      panel,
      /topicOnlyCategory && !!activeTopic && !trimmedQuery && !pickedName/,
    );
    const patch = buildPostCrjAffiliationPersistencePatch('professional', [
      {
        id: buildUniqueCustomAffiliationId('faith', '', [], 'catholic'),
        name: '',
        categoryId: 'faith',
        source: 'custom',
        topic: 'catholic',
      },
    ]);
    const row = patch.professionalOnboardingAffiliations?.[0];
    assert.equal(row?.name, '');
    assert.equal(row?.topic, 'catholic');
    assert.notEqual(row?.name, 'Catholic');
    assert.equal(affiliationNameRequired('family'), true);
    assert.equal(affiliationNameRequired('faith'), false);
  });

  it('persists topic IDs and empty civic names as name:""', () => {
    assert.equal(
      persistAffiliationTopicId('political_civic', 'Democratic Party'),
      'democratic_party',
    );
    const patch = buildPostCrjAffiliationPersistencePatch('personal', [
      {
        id: 'custom_family_sofia',
        name: 'Sofía',
        categoryId: 'family',
        source: 'custom',
        topic: 'Father of',
      },
      {
        id: buildUniqueCustomAffiliationId(
          'political_civic',
          '',
          [],
          'democratic_party',
        ),
        name: '',
        categoryId: 'political_civic',
        source: 'custom',
        topic: 'democratic_party',
      },
    ]);
    const rows = patch.personalOnboardingAffiliations ?? [];
    assert.equal(rows[0]?.categoryId, 'family');
    assert.equal(rows[0]?.name, 'Sofía');
    assert.equal(rows[0]?.topic, 'father_of');
    assert.equal(rows[0]?.source, 'custom');
    assert.equal(rows[0]?.providerId, undefined);
    assert.equal(rows[1]?.name, '');
    assert.equal(rows[1]?.topic, 'democratic_party');
    assert.equal(rows[1]?.providerId, undefined);
    const familyWithProvider = buildPostCrjAffiliationPersistencePatch(
      'personal',
      [
        {
          id: 'custom_family_sofia',
          name: 'Sofía',
          categoryId: 'family',
          source: 'provider',
          providerId: 'logo.dev:sofia',
          provider: 'logo_dev',
          website: 'https://sofia.example',
          topic: 'father_of',
        },
      ],
    ).personalOnboardingAffiliations?.[0];
    assert.equal(familyWithProvider?.source, 'custom');
    assert.equal(familyWithProvider?.providerId, undefined);
    assert.equal(familyWithProvider?.website, undefined);
    const doc = {
      personalOnboardingAffiliations: rows,
    };
    assert.equal(readOnboardingAffiliationsFromDoc(doc, 'personal').length, 2);
    assert.equal(countAffiliationsForOwnProfileSummary(doc, 'personal'), 2);
  });

  it('does not mint provider identity keys for Family or nameless civic', () => {
    assert.equal(
      affiliationAllowsProviderIdentity({
        name: 'Sofía',
        categoryId: 'family',
        source: 'provider',
        providerId: 'logo.dev:sofia',
      }),
      false,
    );
    assert.equal(
      affiliationIdentityKey({
        name: 'Sofía',
        categoryId: 'family',
        source: 'provider',
        providerId: 'logo.dev:sofia',
        topic: 'father_of',
      }).startsWith('provider:'),
      false,
    );
    assert.equal(
      affiliationAllowsProviderIdentity({
        name: '',
        categoryId: 'political_civic',
        source: 'provider',
        providerId: 'logo.dev:dems',
      }),
      false,
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
    const crj = readFileSync(
      path.join(root, 'screens/ProfileCompletionScreen.tsx'),
      'utf8',
    );
    assert.match(crj, /readOnboardingAffiliationsFromDoc/);
    const card = readFileSync(
      path.join(root, 'components/profileExploration/DiscoveryAffiliationsCard.tsx'),
      'utf8',
    );
    assert.match(card, /formatPublicAffiliationCaption/);
    assert.doesNotMatch(card, /formatDiscoveryAffiliationTypeLabel/);
    const onboarding = readFileSync(
      path.join(root, 'i18n/resources/onboarding.ts'),
      'utf8',
    );
    assert.match(onboarding, /family: 'Family'/);
    assert.match(onboarding, /family: 'Familia'/);
    assert.match(onboarding, /identity_lifestyle: 'Identity & Lifestyle'/);
    assert.match(onboarding, /father_of: 'Padre de'/);
  });
});

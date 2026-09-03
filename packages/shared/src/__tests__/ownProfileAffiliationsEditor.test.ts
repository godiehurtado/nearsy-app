import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

import {
  countAffiliationsForOwnProfileSummary,
  extractOwnProfileAffiliationSummaryCounts,
  isPostCrjAffiliationEditorDirty,
  legacyAffiliationItemsToOnboardingSelected,
  parsePostCrjAffiliationEditorParams,
  readAffiliationsForPostCrjEditor,
  readOnboardingAffiliationsFromDoc,
} from '../affiliations/postCrjAffiliationEditor';
import { buildPostCrjAffiliationPersistencePatch } from '../affiliations/onboardingAffiliationPersistence';
import type { OnboardingSelectedAffiliation } from '../affiliations/onboardingAffiliationCatalog';

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

describe('post-CRJ affiliation editor helpers', () => {
  it('parsePostCrjAffiliationEditorParams fails closed on invalid params', () => {
    assert.deepEqual(
      parsePostCrjAffiliationEditorParams({ uid: 'u1', mode: 'personal' }, null),
      { ok: false, reason: 'missing_auth' },
    );
    assert.deepEqual(
      parsePostCrjAffiliationEditorParams({ uid: 'u2', mode: 'personal' }, 'u1'),
      { ok: false, reason: 'uid_mismatch' },
    );
  });

  it('onboarding bag wins over legacy for read and summary count', () => {
    const doc = {
      personalOnboardingAffiliations: [providerRow],
      personalAffiliations: [
        { category: 'schoolCollege', label: 'Legacy School', imageUrl: null },
      ],
    };
    const read = readAffiliationsForPostCrjEditor(doc, 'personal');
    assert.equal(read.usedLegacyFallback, false);
    assert.equal(read.affiliations.length, 1);
    assert.equal(read.affiliations[0]!.id, 'fixture:um');
    assert.equal(countAffiliationsForOwnProfileSummary(doc, 'personal'), 1);
  });

  it('uses legacy fallback only when onboarding bag is empty', () => {
    const doc = {
      personalOnboardingAffiliations: [],
      personalAffiliations: [
        {
          category: 'schoolCollege',
          label: 'Legacy High School',
          imageUrl: 'https://example.com/logo.png',
        },
      ],
    };
    const read = readAffiliationsForPostCrjEditor(doc, 'personal');
    assert.equal(read.usedLegacyFallback, true);
    assert.equal(read.affiliations.length, 1);
    assert.equal(read.affiliations[0]!.name, 'Legacy High School');
    assert.equal(read.affiliations[0]!.source, 'custom');
    assert.equal(read.affiliations[0]!.logoUrl, 'https://example.com/logo.png');
    assert.equal(countAffiliationsForOwnProfileSummary(doc, 'personal'), 1);
  });

  it('isolates Personal and Professional bags', () => {
    const doc = {
      personalOnboardingAffiliations: [providerRow],
      professionalOnboardingAffiliations: [
        {
          id: 'custom_professional_acme',
          name: 'Acme Corp',
          categoryId: 'professional',
          source: 'custom',
        },
      ],
    };
    assert.equal(readOnboardingAffiliationsFromDoc(doc, 'personal').length, 1);
    assert.equal(readOnboardingAffiliationsFromDoc(doc, 'professional').length, 1);
    const counts = extractOwnProfileAffiliationSummaryCounts(doc);
    assert.equal(counts.personal, 1);
    assert.equal(counts.professional, 1);
  });

  it('legacy conversion dedupes by canonical identity rules', () => {
    const converted = legacyAffiliationItemsToOnboardingSelected([
      { category: 'schoolCollege', label: 'Same School', imageUrl: null },
      { category: 'majorField', label: 'same school', imageUrl: null },
    ]);
    assert.equal(converted.length, 1);
  });

  it('tracks dirty state for affiliation selections', () => {
    const snapshot = [providerRow];
    const changed = [
      {
        id: 'custom_community_club',
        name: 'Local Club',
        categoryId: 'community' as const,
        source: 'custom' as const,
      },
    ];
    assert.equal(isPostCrjAffiliationEditorDirty(snapshot, snapshot), false);
    assert.equal(isPostCrjAffiliationEditorDirty(snapshot, changed), true);
  });
});

describe('post-CRJ Affiliations editor screen contract', () => {
  const sharedRoot = path.resolve(import.meta.dirname, '..');

  function readShared(rel: string) {
    return fs.readFileSync(path.join(sharedRoot, rel), 'utf8');
  }

  it('AffiliationsScreen uses post-CRJ persistence builder only', () => {
    const screen = readShared('screens/AffiliationsScreen.tsx');
    assert.match(screen, /buildPostCrjAffiliationPersistencePatch/);
    assert.doesNotMatch(screen, /buildCrjAffiliationPersistencePatch/);
    assert.doesNotMatch(screen, /useGuideAudio/);
    assert.doesNotMatch(screen, /TopHeader/);
    assert.match(screen, /OnboardingAffiliationCategoryPanel/);
    assert.doesNotMatch(screen, /sk_[a-zA-Z0-9]+/);
    assert.match(screen, /readAffiliationsForPostCrjEditor/);
  });

  it('AffiliationsScreen dismisses keyboard after successful save', () => {
    const screen = readShared('screens/AffiliationsScreen.tsx');
    const saveBlock = screen.slice(
      screen.indexOf('const handleSave'),
      screen.indexOf('const bottomBarInset'),
    );
    assert.match(saveBlock, /updateUserProfilePartial/);
    assert.match(saveBlock, /Keyboard\.dismiss\(\)/);
  });

  it('persists canonical provenance and strips tokenized Logo.dev logoUrl', () => {
    const withCdnLogo: OnboardingSelectedAffiliation = {
      ...providerRow,
      logoUrl: 'https://img.logo.dev/miami.edu?token=pk_test_placeholder',
    };
    const patch = buildPostCrjAffiliationPersistencePatch('personal', [
      withCdnLogo,
    ]);
    const row = patch.personalOnboardingAffiliations![0]!;
    assert.equal(row.id, 'fixture:um');
    assert.equal(row.name, 'University of Miami');
    assert.equal(row.categoryId, 'education');
    assert.equal(row.source, 'provider');
    assert.equal(row.providerId, 'fixture:um');
    assert.equal(row.provider, 'logo_dev');
    assert.equal(row.website, 'https://miami.edu');
    assert.equal(row.topic, 'Universities');
    assert.equal(row.logoUrl, undefined);
    assert.equal(patch.personalAffiliations![0]!.imageUrl, null);
  });

  it('entity search reuses runtime provider via category panel', () => {
    const panel = readShared(
      'components/registration/OnboardingAffiliationCategoryPanel.tsx',
    );
    assert.match(panel, /getAffiliationEntitySearchProvider/);
    assert.match(panel, /AffiliationLogoMark/);
    assert.doesNotMatch(panel, /sk_[a-zA-Z0-9]+/);
  });

  it('post-CRJ patch includes onboarding + legacy bridge for one face', () => {
    const patch = buildPostCrjAffiliationPersistencePatch('personal', [providerRow]);
    assert.deepEqual(Object.keys(patch).sort(), [
      'personalAffiliations',
      'personalOnboardingAffiliations',
    ]);
    assert.equal(
      Object.prototype.hasOwnProperty.call(patch, 'profileSetupCompleted'),
      false,
    );
    assert.ok(patch.personalAffiliations!.length === 1);
    assert.ok(patch.personalOnboardingAffiliations!.length === 1);
  });

  it('CompleteProfileScreen refreshes affiliation summaries without full reload when dirty', () => {
    const screen = readShared('screens/CompleteProfileScreen.tsx');
    assert.match(screen, /refreshProfileSummaries/);
    assert.match(screen, /extractOwnProfileAffiliationSummaryCounts/);
    assert.match(screen, /personalAffiliationsSummaryCount/);
    assert.doesNotMatch(screen, /professionalAffiliations\.length/);
  });
});

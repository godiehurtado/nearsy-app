import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

import {
  areOnboardingInterestSelectionsEqual,
  countOnboardingInterestsInDoc,
  extractOwnProfileInterestSummaryCounts,
  isPostCrjInterestEditorDirty,
  parsePostCrjInterestEditorParams,
  readOnboardingInterestsFromDoc,
} from '../interests/postCrjInterestEditor';
import {
  buildPostCrjInterestPersistencePatch,
  type OnboardingSelectedInterest,
} from '../interests/onboardingInterestCatalog';

function sample(
  id: string,
  categoryId: OnboardingSelectedInterest['categoryId'] = 'business',
): OnboardingSelectedInterest {
  return {
    id,
    name: id,
    categoryId,
    icon: 'star-outline',
    iconColor: '#2563EB',
  };
}

describe('post-CRJ interest editor helpers', () => {
  it('parsePostCrjInterestEditorParams fails closed on invalid mode or uid mismatch', () => {
    assert.deepEqual(
      parsePostCrjInterestEditorParams({ uid: 'u1', mode: 'personal' }, null),
      { ok: false, reason: 'missing_auth' },
    );
    assert.deepEqual(
      parsePostCrjInterestEditorParams({ mode: 'personal' }, 'u1'),
      { ok: false, reason: 'missing_uid' },
    );
    assert.deepEqual(
      parsePostCrjInterestEditorParams({ uid: 'u2', mode: 'personal' }, 'u1'),
      { ok: false, reason: 'uid_mismatch' },
    );
    assert.deepEqual(
      parsePostCrjInterestEditorParams({ uid: 'u1', mode: 'invalid' }, 'u1'),
      { ok: false, reason: 'invalid_mode' },
    );
    assert.deepEqual(
      parsePostCrjInterestEditorParams({ uid: 'u1', mode: 'professional' }, 'u1'),
      { ok: true, params: { uid: 'u1', mode: 'professional' } },
    );
  });

  it('reads personalOnboardingInterests / professionalOnboardingInterests by mode', () => {
    const doc = {
      personalOnboardingInterests: [
        {
          id: 'business_entrepreneurship',
          name: 'Entrepreneurship',
          categoryId: 'business',
          icon: 'rocket-outline',
          iconColor: '#7C3AED',
        },
      ],
      professionalOnboardingInterests: [
        {
          id: 'technology_ai',
          name: 'Artificial Intelligence',
          categoryId: 'technology',
          icon: 'hardware-chip-outline',
          iconColor: '#7C3AED',
        },
      ],
    };

    const personal = readOnboardingInterestsFromDoc(doc, 'personal');
    assert.equal(personal.length, 1);
    assert.equal(personal[0]!.id, 'business_entrepreneurship');

    const professional = readOnboardingInterestsFromDoc(doc, 'professional');
    assert.equal(professional.length, 1);
    assert.equal(professional[0]!.id, 'technology_ai');
  });

  it('does not use legacy InterestAffiliations as read source', () => {
    const doc = {
      personalInterestAffiliations: { Business: ['Entrepreneurship'] },
      personalOnboardingInterests: [],
    };
    assert.deepEqual(readOnboardingInterestsFromDoc(doc, 'personal'), []);
  });

  it('counts onboarding bag entries and ignores synthetic ids', () => {
    const doc = {
      personalOnboardingInterests: [
        { id: 'music_group_genres', name: 'Music Genres', categoryId: 'music' },
        {
          id: 'music_genre_pop',
          name: 'Pop',
          categoryId: 'music',
          icon: 'sparkles-outline',
          iconColor: '#DB2777',
        },
        {
          id: 'custom_community_pottery',
          name: 'Pottery',
          categoryId: 'community',
          icon: 'leaf-outline',
          iconColor: '#16A34A',
          isCustom: true,
        },
      ],
    };
    assert.equal(countOnboardingInterestsInDoc(doc, 'personal'), 2);
    const counts = extractOwnProfileInterestSummaryCounts(doc);
    assert.equal(counts.personal, 2);
    assert.equal(counts.professional, 0);
  });

  it('tracks dirty state by persisted selection fingerprint', () => {
    const snapshot = [sample('business_entrepreneurship')];
    const unchanged = [sample('business_entrepreneurship')];
    const changed = [sample('technology_ai', 'technology')];
    assert.equal(isPostCrjInterestEditorDirty(snapshot, unchanged), false);
    assert.equal(isPostCrjInterestEditorDirty(snapshot, changed), true);
    assert.equal(
      areOnboardingInterestSelectionsEqual(snapshot, unchanged),
      true,
    );
  });
});

describe('post-CRJ Interests editor screen contract', () => {
  const sharedRoot = path.resolve(
    import.meta.dirname,
    '..',
  );

  function readShared(rel: string) {
    return fs.readFileSync(path.join(sharedRoot, rel), 'utf8');
  }

  it('InterestsScreen uses post-CRJ persistence builder only', () => {
    const screen = readShared('screens/InterestsScreen.tsx');
    assert.match(screen, /buildPostCrjInterestPersistencePatch/);
    assert.doesNotMatch(screen, /buildCrjInterestPersistencePatch/);
    assert.doesNotMatch(screen, /personalInterestAffiliations/);
    assert.doesNotMatch(screen, /InterestsWithLogo/);
    assert.doesNotMatch(screen, /useGuideAudio/);
    assert.match(screen, /readOnboardingInterestsFromDoc/);
    assert.match(screen, /parsePostCrjInterestEditorParams/);
    assert.match(screen, /OnboardingInterestCategoryPanel/);
    assert.match(screen, /ONBOARDING_INTEREST_CATEGORIES|listOnboardingCategoryIds/);
  });

  it('InterestsScreen dismisses keyboard after successful save', () => {
    const screen = readShared('screens/InterestsScreen.tsx');
    const saveBlock = screen.slice(
      screen.indexOf('const handleSave'),
      screen.indexOf('const bottomBarInset'),
    );
    assert.match(saveBlock, /updateUserProfilePartial/);
    assert.match(saveBlock, /Keyboard\.dismiss\(\)/);
    assert.doesNotMatch(saveBlock, /catch[\s\S]*Keyboard\.dismiss/);
  });

  it('InterestsScreen uses safe area overlay and theme tokens', () => {
    const screen = readShared('screens/InterestsScreen.tsx');
    assert.match(screen, /useSafeAreaInsets/);
    assert.match(screen, /statusBarOverlay/);
    assert.match(screen, /useAppTheme/);
    assert.doesNotMatch(screen, /backgroundColor:\s*'#fff'/);
  });

  it('CompleteProfileScreen refreshes interest summaries without full reload when dirty', () => {
    const screen = readShared('screens/CompleteProfileScreen.tsx');
    assert.match(screen, /refreshProfileSummaries/);
    assert.match(screen, /extractOwnProfileInterestSummaryCounts/);
    assert.match(screen, /personalInterestsSummaryCount/);
    assert.match(
      screen,
      /isDirtyRef\.current[\s\S]*refreshProfileSummaries/,
    );
    assert.match(screen, /goToProfileExtraScreen\('Interests'\)/);
    assert.doesNotMatch(
      screen,
      /countAff\(personalAff\)/,
    );
  });

  it('post-CRJ save patch from screen selection stays face-isolated', () => {
    const patch = buildPostCrjInterestPersistencePatch('personal', [
      sample('business_entrepreneurship'),
    ]);
    assert.deepEqual(Object.keys(patch).sort(), [
      'personalInterests',
      'personalOnboardingInterests',
    ]);
    assert.equal(patch.professionalOnboardingInterests, undefined);
    assert.equal(
      Object.prototype.hasOwnProperty.call(patch, 'profileSetupCompleted'),
      false,
    );
  });
});

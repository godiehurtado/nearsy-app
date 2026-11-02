/**
 * Nearsy 2.0.9 Altercall / phase-2 Android package — focal guards.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { authenticationTranslations } from '../i18n/resources/authentication.ts';
import { onboardingTranslations } from '../i18n/resources/onboarding.ts';
import {
  CUSTOM_INTEREST_ICON_CATALOG,
  filterCustomInterestIcons,
  flattenCatalogInterestItems,
  HISTORICAL_ANDROID_CUSTOM_ICONS,
  isHistoricalCustomInterestIcon,
  ONBOARDING_CUSTOM_INTEREST_ICONS,
  validateCustomInterestInput,
} from '../interests/onboardingInterestCatalog.ts';
import {
  isDeprecatedInterestId,
  isSelectableCatalogInterestId,
  preserveOnboardingInterestsForEditor,
  resetInterestCatalogLookupCaches,
} from '../interests/onboardingInterestLegacyCatalog.ts';
import {
  CRJ_SOCIAL_PLATFORMS,
  VISIBLE_CRJ_SOCIAL_PLATFORM_IDS,
  emptyCrjSocialDraftValues,
} from '../social/onboardingSocialCatalog.ts';
import {
  EXPECTED_SOCIAL_DISPLAY_ORDER,
  POST_CRJ_SOCIAL_CARD_ORDER,
} from '../social/postCrjSocialEditor.ts';
import {
  buildCrjSocialLinksPersistencePatch,
  buildImmediateManualSocialPatch,
  buildPostCrjSocialLinksPersistencePatch,
  shouldApplySocialEditorResult,
} from '../social/onboardingSocialPersistence.ts';
import { readPostCrjSocialEditorDraft } from '../social/postCrjSocialEditor.ts';
import { nearbyEmptyTitleI18nKey } from '../visibility/nearbyLoadUiState.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function readSrc(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

resetInterestCatalogLookupCaches();

describe('password visibility', () => {
  it('Login and Register expose show/hide with EN/ES a11y and stay hidden by default', () => {
    const login = readSrc('screens/LoginScreen.tsx');
    const register = readSrc('screens/RegisterScreen.tsx');
    const form = readSrc('components/registration/FormInput.tsx');
    assert.match(login, /passwordVisible/);
    assert.match(login, /secureTextEntry=\{!passwordVisible\}/);
    assert.match(login, /authentication\.password\.show/);
    assert.match(login, /textContentType="password"/);
    assert.match(register, /passwordToggle/);
    assert.match(register, /textContentType="newPassword"/);
    assert.match(form, /passwordToggle/);
    assert.match(form, /useState\(false\)/);
    assert.equal(authenticationTranslations.en.password.show, 'Show password');
    assert.equal(authenticationTranslations.es.password.hide, 'Ocultar contraseña');
    assert.doesNotMatch(register, /console\.(log|debug|info).*password/i);
    assert.doesNotMatch(login, /console\.(log|debug|info).*password/i);
  });
});

describe('alignment / compatibilidad copy', () => {
  it('uses Alignment in EN and Compatibilidad in ES without visible tiers', () => {
    const nearby = readSrc('screens/NearbySearchScreen.tsx');
    const card = readSrc('components/profileExploration/DiscoveryCompatibilityCard.tsx');
    assert.match(nearby, /AlignmentScoreRing/);
    assert.doesNotMatch(nearby, /alignmentTierLabel/);
    assert.doesNotMatch(card, /alignmentTierLabel/);
    assert.match(card, /formatAlignmentPercent/);
    assert.match(readSrc('i18n/locales/es.ts'), /title: 'Compatibilidad'/);
  });
});

describe('Nearby empty chrome', () => {
  it('does not reuse filter-empty title for generic or retryable errors', () => {
    assert.equal(nearbyEmptyTitleI18nKey('empty'), 'nearby.emptyTitle');
    assert.equal(nearbyEmptyTitleI18nKey('generic'), 'nearby.errorTitle');
    assert.equal(nearbyEmptyTitleI18nKey('retry'), 'nearby.errorTitle');
    assert.equal(nearbyEmptyTitleI18nKey('inactive'), 'nearby.inactiveTitle');
    const nearby = readSrc('screens/NearbySearchScreen.tsx');
    assert.match(nearby, /nearbyEmptyTitleI18nKey/);
    assert.match(nearby, /forcePublish/);
  });
});

describe('sports and travel catalogs', () => {
  it('keeps existing sports, adds requested coverage, and does not narrow generics', () => {
    for (const id of [
      'sports_football',
      'sports_boxing',
      'sports_pickleball',
      'sports_motorsports',
      'sports_hockey',
      'sports_mma',
      'sports_polo',
      'sports_martial_arts',
      'sports_padel',
      'sports_rugby',
      'sports_cricket',
      'sports_field_hockey',
      'sports_table_tennis',
      'sports_badminton',
      'sports_fencing',
      'sports_archery',
      'sports_car_racing',
      'sports_ice_hockey',
    ]) {
      assert.equal(isSelectableCatalogInterestId(id), true, id);
    }
    assert.equal(
      onboardingTranslations.en.profileCompletion.interests.items.sports_motorsports,
      'Motorsports',
    );
    assert.equal(
      onboardingTranslations.es.profileCompletion.interests.items.sports_motorsports,
      'Deportes de motor',
    );
    assert.equal(
      onboardingTranslations.en.profileCompletion.interests.items.sports_hockey,
      'Hockey',
    );
    assert.equal(
      onboardingTranslations.en.profileCompletion.interests.items.sports_car_racing,
      'Car Racing',
    );
    assert.equal(
      onboardingTranslations.es.profileCompletion.interests.items.sports_ice_hockey,
      'Hockey sobre hielo',
    );
    assert.equal(
      onboardingTranslations.en.profileCompletion.interests.items.sports_boxing,
      'Boxing',
    );
    assert.equal(
      onboardingTranslations.en.profileCompletion.interests.items.sports_pickleball,
      'Pickleball',
    );
  });

  it('replaces Cultural Experiences and Latin Culture without reusing IDs', () => {
    assert.equal(isSelectableCatalogInterestId('travel_local'), true);
    assert.equal(isSelectableCatalogInterestId('travel_world_cultures'), true);
    assert.equal(isSelectableCatalogInterestId('travel_local_exploration'), false);
    assert.equal(isSelectableCatalogInterestId('travel_cultural'), false);
    assert.equal(isSelectableCatalogInterestId('travel_latin_culture'), false);
    assert.equal(isDeprecatedInterestId('travel_cultural'), true);
    assert.equal(isDeprecatedInterestId('travel_latin_culture'), true);
    const preserved = preserveOnboardingInterestsForEditor([
      {
        id: 'travel_cultural',
        name: 'Cultural Experiences',
        categoryId: 'travel',
        icon: 'globe-outline',
        iconColor: '#DB2777',
      },
    ]);
    assert.equal(preserved.length, 1);
    assert.equal(
      onboardingTranslations.en.profileCompletion.interests.items.travel_local,
      'Local Exploration',
    );
    assert.equal(
      onboardingTranslations.es.profileCompletion.interests.items
        .travel_world_cultures,
      'Culturas del mundo',
    );
  });
});

describe('Other icon picker', () => {
  it('expands the installed-family catalog with search and keeps legacy icons', () => {
    assert.equal(CUSTOM_INTEREST_ICON_CATALOG.length, 113);
    assert.equal(
      new Set(ONBOARDING_CUSTOM_INTEREST_ICONS).size,
      113,
    );
    assert.ok(ONBOARDING_CUSTOM_INTEREST_ICONS.includes('star-outline'));
    assert.ok(ONBOARDING_CUSTOM_INTEREST_ICONS.includes('medal-outline'));
    assert.ok(ONBOARDING_CUSTOM_INTEREST_ICONS.includes('train-outline'));
    assert.equal(ONBOARDING_CUSTOM_INTEREST_ICONS.includes('body-outline'), false);
    assert.equal(isHistoricalCustomInterestIcon('body-outline'), true);
    assert.equal(HISTORICAL_ANDROID_CUSTOM_ICONS.length, 11);
    assert.ok(filterCustomInterestIcons('fútbol', 'es').length > 0);
    assert.ok(filterCustomInterestIcons('camera', 'en').length > 0);
    const ok = validateCustomInterestInput({
      name: 'My custom',
      icon: 'paw-outline',
      categoryId: 'community',
      existingInCategory: [],
    });
    assert.equal(ok.ok, true);
    const composer = readSrc(
      'components/registration/OnboardingInterestCustomComposer.tsx',
    );
    assert.match(composer, /FlatList/);
    assert.match(composer, /filterCustomInterestIcons/);
  });
});

describe('social order, modals, and immediate persist', () => {
  it('uses YouTube → TikTok → Instagram → X → Facebook → LinkedIn → Web', () => {
    assert.deepEqual(VISIBLE_CRJ_SOCIAL_PLATFORM_IDS, [
      'youtube',
      'tiktok',
      'instagram',
      'x',
      'facebook',
      'linkedin',
    ]);
    assert.deepEqual([...POST_CRJ_SOCIAL_CARD_ORDER], [
      ...EXPECTED_SOCIAL_DISPLAY_ORDER,
    ]);
    assert.ok(CRJ_SOCIAL_PLATFORMS.some((p) => p.id === 'snapchat'));
    assert.ok(!VISIBLE_CRJ_SOCIAL_PLATFORM_IDS.includes('snapchat'));
  });

  it('persists a manual Facebook link immediately without completing CRJ', () => {
    const values = emptyCrjSocialDraftValues();
    values.linkedin = 'https://www.linkedin.com/in/keep';
    const crj = buildCrjSocialLinksPersistencePatch(
      'personal',
      values,
      [],
      { linkedin: 'https://www.linkedin.com/in/keep' },
      { website: 'https://www.example.com' },
    );
    assert.equal(crj.profileSetupCompleted, false);
    assert.equal(crj.socialLinksPersonal?.website, 'https://www.example.com/');

    const immediate = buildImmediateManualSocialPatch(
      'professional',
      { facebook: 'https://www.facebook.com/old', twitter: 'https://x.com/keep' },
      'facebook',
      'https://www.facebook.com/new',
    );
    assert.equal(
      immediate.socialLinksProfessional?.facebook,
      'https://www.facebook.com/new',
    );
    assert.equal(immediate.socialLinksProfessional?.twitter, 'https://x.com/keep');
    assert.equal(immediate.socialLinksPersonal, undefined);
    const unlinked = buildImmediateManualSocialPatch(
      'professional',
      immediate.socialLinksProfessional,
      'facebook',
      null,
    );
    assert.equal(unlinked.socialLinksProfessional?.facebook, undefined);

    const laterSave = buildPostCrjSocialLinksPersistencePatch(
      'professional',
      {
        ...emptyCrjSocialDraftValues(),
        linkedin: '',
        facebook: '',
        x: 'https://x.com/keep',
      },
      [],
      { website: '', existing: unlinked.socialLinksProfessional },
    );
    assert.equal(laterSave.socialLinksProfessional?.facebook, undefined);
    assert.equal(laterSave.socialLinksProfessional?.twitter, 'https://x.com/keep');
    assert.equal(laterSave.socialLinksPersonal, undefined);

    const reopened = readPostCrjSocialEditorDraft(
      { socialLinksProfessional: unlinked.socialLinksProfessional },
      'professional',
    );
    assert.equal(reopened.values.facebook, '');
    assert.equal(reopened.values.x, 'https://x.com/keep');

    assert.equal(
      shouldApplySocialEditorResult({
        expectedUid: 'uid-a',
        expectedMode: 'personal',
        liveUid: 'uid-b',
        liveMode: 'personal',
        expectedGeneration: 1,
        liveGeneration: 1,
      }),
      false,
    );
    assert.equal(
      shouldApplySocialEditorResult({
        expectedUid: 'uid-a',
        expectedMode: 'personal',
        liveUid: 'uid-a',
        liveMode: 'professional',
        expectedGeneration: 1,
        liveGeneration: 1,
      }),
      false,
    );
    assert.equal(
      shouldApplySocialEditorResult({
        expectedUid: 'uid-a',
        expectedMode: 'personal',
        liveUid: 'uid-a',
        liveMode: 'personal',
        expectedGeneration: 1,
        liveGeneration: 2,
      }),
      false,
    );
  });

  it('wires modals, copy-code, and Android save-bar hiding', () => {
    const step = readSrc('components/registration/OnboardingSocialMediaStep.tsx');
    const screen = readSrc('screens/SocialMediaScreen.tsx');
    const instagram = readSrc('components/profile/InstagramOwnershipCard.tsx');
    const youtube = readSrc('components/profile/YoutubeOwnershipCard.tsx');
    assert.match(step, /ManualSocialLinkModal/);
    assert.match(step, /platforms.website/);
    assert.match(screen, /buildImmediateManualSocialPatch/);
    assert.match(screen, /shouldApplySocialEditorResult/);
    assert.match(screen, /Platform\.OS !== 'android' \|\| isDirty/);
    assert.match(instagram, /copyCode/);
    assert.match(instagram, /pendingSteps/);
    assert.match(instagram, /challenge\?\.challengeId/);
    assert.match(youtube, /OwnershipExplainModal/);
    assert.doesNotMatch(youtube, /LoginManager/);
    assert.doesNotMatch(youtube, /FirebaseAuthProvider/);
  });
});

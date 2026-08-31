import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ONBOARDING_AFFILIATION_CATEGORIES,
  buildCustomAffiliationId,
  isDuplicateAffiliation,
  listOnboardingAffiliationCategoryIds,
  validateCustomAffiliationName,
  type OnboardingSelectedAffiliation,
} from '../affiliations/onboardingAffiliationCatalog';
import {
  POST_AFFILIATIONS_CRJ_STEP,
  buildCrjAffiliationPersistencePatch,
  onboardingAffiliationsToLegacy,
} from '../affiliations/onboardingAffiliationPersistence';
import { fixtureAffiliationEntitySearchProvider } from '../affiliations/fixtureAffiliationEntitySearchProvider';
import { resolveAffiliationLogoPresentation } from '../affiliations/affiliationLogo';
import {
  assertNoUndefinedDeep,
  MIN_ONBOARDING_INTERESTS,
  payloadContainsUndefined,
} from '../interests/onboardingInterestCatalog';
import {
  celebrationNextUpDelayMs,
} from '../components/registration/celebrationMotion';

const here = dirname(fileURLToPath(import.meta.url));

function readSharedSource(relativeFromSharedSrc: string): string {
  return readFileSync(join(here, '..', relativeFromSharedSrc), 'utf8');
}

const APPROVED_CATEGORY_ORDER = [
  'education',
  'professional',
  'community',
  'sports_clubs',
  'faith',
  'political_civic',
  'identity_lifestyle',
] as const;

describe('CRJ-I6 Affiliations', () => {
  it('A — exactly 7 categories in approved order', () => {
    assert.equal(ONBOARDING_AFFILIATION_CATEGORIES.length, 7);
    assert.deepEqual(listOnboardingAffiliationCategoryIds(), [
      ...APPROVED_CATEGORY_ORDER,
    ]);
  });

  it('B — no N/M counter in ProfileCompletionScreen or affiliation panel', () => {
    const source = readSharedSource('screens/ProfileCompletionScreen.tsx');
    const panel = readSharedSource(
      'components/registration/OnboardingAffiliationCategoryPanel.tsx',
    );
    assert.ok(!source.includes('Category N of'));
    assert.ok(!source.includes('of 7'));
    assert.ok(!source.match(/step\s+\d+\s*\/\s*\d+/i));
    assert.ok(!panel.includes('Group '));
    assert.ok(!panel.includes(' of 7'));
  });

  it('C — profile-mode isolation in persistence patch', () => {
    const selected: OnboardingSelectedAffiliation[] = [
      {
        id: 'fixture:um',
        name: 'University of Miami',
        categoryId: 'education',
        source: 'provider',
        providerId: 'fixture:um',
      },
    ];
    const personal = buildCrjAffiliationPersistencePatch('personal', selected);
    const professional = buildCrjAffiliationPersistencePatch(
      'professional',
      selected,
    );
    assert.ok(personal.personalAffiliations);
    assert.ok(personal.personalOnboardingAffiliations);
    assert.equal(personal.professionalAffiliations, undefined);
    assert.equal(personal.professionalOnboardingAffiliations, undefined);
    assert.ok(professional.professionalAffiliations);
    assert.equal(professional.personalAffiliations, undefined);
  });

  it('D — Skip behavior: affiliation advance does not require selection', () => {
    const source = readSharedSource('screens/ProfileCompletionScreen.tsx');
    assert.ok(source.includes('async function advanceAffiliation()'));
    assert.ok(
      source.includes(
        "label={t('onboarding.profileCompletion.affiliations.skip'",
      ),
    );
    const advanceBlock = source.slice(
      source.indexOf('async function advanceAffiliation()'),
      source.indexOf('async function advanceInterest('),
    );
    assert.ok(!advanceBlock.includes('requireCategorySelection'));
    assert.ok(!advanceBlock.includes('selectionsInCurrentCategory'));
  });

  it('E — Back preserves selections via shared state', () => {
    const source = readSharedSource('screens/ProfileCompletionScreen.tsx');
    assert.ok(source.includes('selectedAffiliations'));
    assert.ok(source.includes('setSelectedAffiliations'));
    assert.ok(source.includes('function goBack()'));
  });

  it('F — provider result selection uses providerId identity', async () => {
    const rows = await fixtureAffiliationEntitySearchProvider.search(
      'Miami',
      'education',
    );
    const suggestion = rows.find((r) => r.name === 'Miami University');
    assert.ok(suggestion);
    assert.equal(suggestion!.isQueryMatch, undefined);
    const selected: OnboardingSelectedAffiliation[] = [
      {
        id: suggestion!.providerId,
        name: suggestion!.name,
        categoryId: 'education',
        source: 'provider',
        providerId: suggestion!.providerId,
      },
    ];
    assert.equal(selected[0]!.providerId, suggestion!.providerId);
    assert.match(selected[0]!.providerId!, /^fixture:education:/);
  });

  it('G — selected affiliation removal supported in panel', () => {
    const source = readSharedSource(
      'components/registration/OnboardingAffiliationCategoryPanel.tsx',
    );
    assert.ok(source.includes('removeAffiliation'));
    assert.ok(source.includes('onPress={() => removeAffiliation(item.id)}'));
  });

  it('H — custom affiliation creation', () => {
    const validated = validateCustomAffiliationName('My Local Club');
    assert.equal(validated.ok, true);
    if (!validated.ok) return;
    const id = buildCustomAffiliationId('community', validated.name);
    assert.ok(id.startsWith('custom_community_'));
    assert.match(id, /^custom_community_my_local_club$/);
  });

  it('I — duplicate prevention', () => {
    const list: OnboardingSelectedAffiliation[] = [
      {
        id: 'fixture:google',
        name: 'Google',
        categoryId: 'professional',
        source: 'provider',
        providerId: 'fixture:google',
      },
    ];
    assert.equal(
      isDuplicateAffiliation(list, {
        name: 'Google',
        source: 'provider',
        providerId: 'fixture:google',
      }),
      true,
    );
    assert.equal(
      isDuplicateAffiliation(list, {
        name: '  google  ',
        source: 'custom',
      }),
      true,
    );
  });

  it('J — provider-backed identity preserved in persistence', () => {
    const patch = buildCrjAffiliationPersistencePatch('personal', [
      {
        id: 'fixture:microsoft',
        name: 'Microsoft',
        categoryId: 'professional',
        source: 'provider',
        providerId: 'fixture:microsoft',
      },
    ]);
    const row = patch.personalOnboardingAffiliations?.[0];
    assert.equal(row?.providerId, 'fixture:microsoft');
    assert.equal(row?.source, 'provider');
  });

  it('K — logo fallback when no remote logo', () => {
    const remote = resolveAffiliationLogoPresentation({
      name: 'Google',
      categoryId: 'professional',
      logoUrl: 'https://example.com/logo.png',
    });
    assert.equal(remote.kind, 'remote');

    const initials = resolveAffiliationLogoPresentation({
      name: 'Google',
      categoryId: 'professional',
      logoUrl: null,
    });
    assert.equal(initials.kind, 'initials');
    assert.equal(initials.initials, 'GO');
  });

  it('L — no undefined persistence', () => {
    const patch = buildCrjAffiliationPersistencePatch('personal', [
      {
        id: 'custom_community_local',
        name: 'Local Org',
        categoryId: 'community',
        source: 'custom',
      },
    ]);
    assert.equal(payloadContainsUndefined(patch), false);
    assert.doesNotThrow(() => assertNoUndefinedDeep(patch));
  });

  it('M — legacy compatibility bridge writes AffiliationItem rows', () => {
    const legacy = onboardingAffiliationsToLegacy([
      {
        id: 'fixture:um',
        name: 'University of Miami',
        categoryId: 'education',
        source: 'provider',
        providerId: 'fixture:um',
        logoUrl: 'https://example.com/um.png',
      },
    ]);
    assert.equal(legacy.length, 1);
    assert.equal(legacy[0]!.category, 'schoolCollege');
    assert.equal(legacy[0]!.label, 'University of Miami');
    assert.equal(legacy[0]!.imageUrl, 'https://example.com/um.png');
  });

  it('N — profileSetupCompleted remains false in affiliation patch', () => {
    const patch = buildCrjAffiliationPersistencePatch('personal', []);
    assert.equal(patch.profileSetupCompleted, false);
  });

  it('O — Interests Celebration continues directly into Education', () => {
    const screen = readSharedSource('screens/ProfileCompletionScreen.tsx');
    assert.ok(screen.includes('continueTarget="affiliations"'));
    assert.ok(screen.includes("if (offset === 0) return { kind: 'interestsCelebration' }"));
    assert.ok(screen.includes('offset -= 1'));
    assert.ok(!screen.includes("kind: 'affiliationsIntro'"));
    assert.equal(listOnboardingAffiliationCategoryIds()[0], 'education');
  });

  it('P — final Affiliations continuation enters Social Media', () => {
    assert.equal(POST_AFFILIATIONS_CRJ_STEP, 'socialMedia');
    const screen = readSharedSource('screens/ProfileCompletionScreen.tsx');
    assert.ok(screen.includes("kind: 'socialMedia'"));
    assert.ok(screen.includes('async function leaveLastAffiliationCategory()'));
    assert.ok(screen.includes('await persistAffiliations()'));
  });

  it('Q — Interests V2 regression source untouched functionally', () => {
    const catalog = readSharedSource('interests/onboardingInterestCatalog.ts');
    assert.ok(catalog.includes('buildCrjInterestPersistencePatch'));
    assert.ok(catalog.includes('MIN_ONBOARDING_INTERESTS'));
    const screen = readSharedSource('screens/ProfileCompletionScreen.tsx');
    assert.ok(screen.includes('buildCrjInterestPersistencePatch'));
    assert.ok(screen.includes('meetsMinimumOnboardingInterests'));
  });

  it('R — Affiliations Intro is not in active navigation', () => {
    const screen = readSharedSource('screens/ProfileCompletionScreen.tsx');
    assert.ok(!screen.includes('AffiliationsIntroVisual'));
    assert.ok(!screen.includes("kind: 'affiliationsIntro'"));
    assert.ok(!screen.includes('affiliationsIntro'));
  });
});

describe('CRJ-I6 fixture provider', () => {
  it('returns Claude-style query + suffixes, max 4, typed query first', async () => {
    const rows = await fixtureAffiliationEntitySearchProvider.search(
      'Microsoft',
      'professional',
    );
    assert.deepEqual(
      rows.map((r) => r.name),
      ['Microsoft', 'Microsoft Inc.', 'Microsoft Group', 'Microsoft Technologies'],
    );
    assert.equal(rows[0]!.isQueryMatch, true);
    assert.equal(rows[0]!.provider, 'fixture');
    assert.equal(rows[1]!.isQueryMatch, undefined);
  });

  it('education suffixes match Claude mockLogoLookup', async () => {
    const rows = await fixtureAffiliationEntitySearchProvider.search(
      'Miami',
      'education',
    );
    assert.deepEqual(
      rows.map((r) => r.name),
      ['Miami', 'Miami University', 'Miami College', 'Miami High School'],
    );
  });
});

describe('CRJ-I6 Claude visual structure', () => {
  it('each category has topic chips and Claude hints', () => {
    for (const cat of ONBOARDING_AFFILIATION_CATEGORIES) {
      assert.ok(cat.topics.length > 0, `${cat.id} missing topics`);
      assert.ok(cat.emoji);
    }
    assert.equal(
      ONBOARDING_AFFILIATION_CATEGORIES.find((c) => c.id === 'education')?.subtitle,
      'Schools, degrees and alumni life.',
    );
  });

  it('panel uses topic chips, search panel, Add, upload, AffiliationLogoMark', () => {
    const panel = readSharedSource(
      'components/registration/OnboardingAffiliationCategoryPanel.tsx',
    );
    assert.ok(panel.includes('category.topics.map'));
    assert.ok(panel.includes('searchPanel'));
    assert.ok(panel.includes('addFromSearch'));
    assert.ok(panel.includes('Upload a logo instead') || panel.includes('affiliations.upload'));
    assert.ok(panel.includes('AffiliationLogoMark'));
    assert.ok(panel.includes('AFFILIATION_SELECTED_LOGO_RADIUS'));
    assert.ok(panel.includes('AFFILIATION_RESULT_LOGO_RADIUS'));
    assert.ok(!panel.includes('SELECTED_TILE_RADIUS = 18'));
    assert.ok(!panel.includes('ActivityIndicator'));
  });
});

describe('CRJ-I6 Celebration / Affiliations transition', () => {
  it('A — last interest category is followed by celebration', () => {
    const screen = readSharedSource('screens/ProfileCompletionScreen.tsx');
    const afterInterests = screen.slice(
      screen.indexOf('offset -= INTEREST_CATEGORY_IDS.length'),
    );
    assert.match(
      afterInterests,
      /if \(offset === 0\) return \{ kind: 'interestsCelebration' \}/,
    );
  });

  it('B — celebration CTA label routes to first affiliation (Education)', () => {
    const screen = readSharedSource('screens/ProfileCompletionScreen.tsx');
    const en = readSharedSource('i18n/resources/onboarding.ts');
    assert.ok(screen.includes("step.kind === 'interestsCelebration'"));
    assert.ok(
      screen.includes(
        "t(\n                      'onboarding.profileCompletion.interestsCelebration.continue'",
      ) ||
        screen.includes(
          "'onboarding.profileCompletion.interestsCelebration.continue'",
        ),
    );
    assert.ok(en.includes("continue: 'Add my affiliations'"));
    assert.equal(listOnboardingAffiliationCategoryIds()[0], 'education');
  });

  it('C — Affiliations Intro is not an active journey step', () => {
    const screen = readSharedSource('screens/ProfileCompletionScreen.tsx');
    assert.ok(!screen.includes('affiliationsIntro'));
    assert.ok(!screen.includes('AffiliationsIntroVisual'));
  });

  it('D/E — Back is a single step decrement (Education→Celebration→Interests)', () => {
    const screen = readSharedSource('screens/ProfileCompletionScreen.tsx');
    const back = screen.slice(screen.indexOf('function goBack()'));
    assert.ok(back.includes('setStepIndex((i) => i - 1)'));
    assert.ok(!screen.includes("kind: 'affiliationsIntro'"));
  });

  it('F/G — celebration goNext does not persist affiliations or complete profile', () => {
    const screen = readSharedSource('screens/ProfileCompletionScreen.tsx');
    const goNext = screen.slice(
      screen.indexOf('async function goNext()'),
      screen.indexOf('function goBack()'),
    );
    const celebrationBranch = goNext.slice(
      goNext.indexOf("step.kind === 'interestsCelebration'"),
      goNext.indexOf("step.kind === 'success'"),
    );
    assert.ok(celebrationBranch.includes('setStepIndex((i) => i + 1)'));
    assert.ok(!celebrationBranch.includes('persistAffiliations'));
    assert.ok(!celebrationBranch.includes('profileSetupCompleted'));
  });

  it('H/I — Education is first of seven approved categories', () => {
    assert.deepEqual(listOnboardingAffiliationCategoryIds(), [
      ...APPROVED_CATEGORY_ORDER,
    ]);
  });

  it('J/K — search provider and custom affiliation still work', async () => {
    const rows = await fixtureAffiliationEntitySearchProvider.search(
      'Microsoft',
      'professional',
    );
    assert.ok(rows.length > 0);
    const validated = validateCustomAffiliationName('My Local Club');
    assert.equal(validated.ok, true);
  });

  it('L — Personal / Professional persistence isolation unchanged', () => {
    const patch = buildCrjAffiliationPersistencePatch('personal', [
      {
        id: 'custom_community_local',
        name: 'Local Org',
        categoryId: 'community',
        source: 'custom',
      },
    ]);
    assert.equal(patch.professionalAffiliations, undefined);
    assert.equal(patch.profileSetupCompleted, false);
  });

  it('M/N — Interests V2 minimum 10 and Other/custom remain in catalog', () => {
    assert.equal(MIN_ONBOARDING_INTERESTS, 10);
    const catalog = readSharedSource('interests/onboardingInterestCatalog.ts');
    assert.ok(catalog.includes('buildCustomInterestId'));
    assert.ok(catalog.includes('isOther'));
  });

  it('O — reduced motion skips next-up delay', () => {
    assert.equal(celebrationNextUpDelayMs(true), 0);
    assert.ok(celebrationNextUpDelayMs(false) > 0);
    const celebration = readSharedSource(
      'components/registration/InterestsCelebrationStep.tsx',
    );
    assert.ok(celebration.includes('useReducedMotion'));
    assert.ok(celebration.includes('nextUpOpacity'));
  });
});

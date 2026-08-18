import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  IDLE_AFFILIATION_SEARCH_UI,
  resolveAffiliationSearchUi,
} from '../affiliations/affiliationSearchInteraction';
import { resolveAffiliationLogoPresentation } from '../affiliations/affiliationLogo';
import { buildCrjAffiliationPersistencePatch } from '../affiliations/onboardingAffiliationPersistence';

const here = dirname(fileURLToPath(import.meta.url));

function readSharedSource(relativeFromSharedSrc: string): string {
  return readFileSync(join(here, '..', relativeFromSharedSrc), 'utf8');
}

const idleInput = {
  searchFocused: false,
  pickedName: null,
  customName: '',
  customNameValid: false,
  hasProviderResults: false,
  searchPending: false,
  suggestionsUnavailable: false,
  hasDraftImage: false,
};

describe('CRJ-I9-C Search Mode keyboard UX', () => {
  it('A — idle keeps Skip/Next (journey footer visible, Add hidden)', () => {
    const ui = resolveAffiliationSearchUi(idleInput);
    assert.deepEqual(ui, IDLE_AFFILIATION_SEARCH_UI);
    assert.equal(ui.phase, 'idle');
    assert.equal(ui.hideJourneyFooter, false);
    assert.equal(ui.showAddCta, false);
  });

  it('B — search focus enters Search Mode', () => {
    const ui = resolveAffiliationSearchUi({
      ...idleInput,
      searchFocused: true,
    });
    assert.equal(ui.phase, 'searching');
    assert.equal(ui.hideJourneyFooter, true);
  });

  it('C — Search Mode hides Skip/Next', () => {
    const focused = resolveAffiliationSearchUi({
      ...idleInput,
      searchFocused: true,
    });
    const selected = resolveAffiliationSearchUi({
      ...idleInput,
      pickedName: 'Microsoft',
    });
    assert.equal(focused.hideJourneyFooter, true);
    assert.equal(selected.hideJourneyFooter, true);
  });

  it('D — searching without selection does not show dominant Add', () => {
    const typing = resolveAffiliationSearchUi({
      ...idleInput,
      searchFocused: true,
      customName: 'Mi',
      customNameValid: true,
      searchPending: true,
    });
    const withResults = resolveAffiliationSearchUi({
      ...idleInput,
      searchFocused: true,
      customName: 'Microsoft',
      customNameValid: true,
      hasProviderResults: true,
    });
    assert.equal(typing.phase, 'searching');
    assert.equal(typing.showAddCta, false);
    assert.equal(withResults.phase, 'searching');
    assert.equal(withResults.showAddCta, false);
  });

  it('E — selecting a provider result exposes selected state and Add', () => {
    const ui = resolveAffiliationSearchUi({
      ...idleInput,
      searchFocused: true,
      pickedName: 'Microsoft',
      customName: 'Microsoft',
      customNameValid: true,
      hasProviderResults: true,
    });
    assert.equal(ui.phase, 'selected');
    assert.equal(ui.showAddCta, true);
    assert.equal(ui.addName, 'Microsoft');
    assert.equal(ui.hideJourneyFooter, true);
  });

  it('F — selection is not persistence; Add still required', () => {
    const panel = readSharedSource(
      'components/registration/OnboardingAffiliationCategoryPanel.tsx',
    );
    const pickStart = panel.indexOf('function pickResult(');
    const pickEnd = panel.indexOf('async function pickOwnLogo()');
    const pickBody = panel.slice(pickStart, pickEnd);
    assert.ok(pickStart >= 0);
    assert.ok(!pickBody.includes('onChangeSelected'));
    assert.ok(!pickBody.includes('buildCrjAffiliationPersistencePatch'));
    assert.ok(panel.includes('function addFromSearch()'));
    assert.ok(panel.includes('onChangeSelected([...selected, next])'));
  });

  it('G — Add remains the only persist path for the search candidate', () => {
    const personal = buildCrjAffiliationPersistencePatch('personal', [
      {
        id: 'logo.dev:microsoft.com',
        name: 'Microsoft',
        categoryId: 'professional',
        source: 'provider',
        providerId: 'logo.dev:microsoft.com',
      },
    ]);
    assert.equal(personal.personalOnboardingAffiliations?.length, 1);
    assert.equal(
      personal.personalOnboardingAffiliations?.[0]?.name,
      'Microsoft',
    );
  });

  it('H — Add exits Search Mode (clear + dismiss + restore journey footer)', () => {
    const afterAdd = resolveAffiliationSearchUi(idleInput);
    assert.equal(afterAdd.phase, 'idle');
    assert.equal(afterAdd.hideJourneyFooter, false);
    const panel = readSharedSource(
      'components/registration/OnboardingAffiliationCategoryPanel.tsx',
    );
    const addStart = panel.indexOf('function addFromSearch()');
    const addEnd = panel.indexOf('function removeAffiliation(');
    const addBody = panel.slice(addStart, addEnd);
    assert.ok(addBody.includes('setSearchFocused(false)'));
    assert.ok(addBody.includes('Keyboard.dismiss()'));
    assert.ok(addBody.includes("setPickedName(null)"));
    assert.ok(addBody.includes("setQuery('')"));
  });

  it('I — Skip/Next restored after Add (idle journey footer)', () => {
    const ui = resolveAffiliationSearchUi(idleInput);
    assert.equal(ui.hideJourneyFooter, false);
    assert.equal(ui.showAddCta, false);
    const screen = readSharedSource('screens/ProfileCompletionScreen.tsx');
    assert.ok(screen.includes('affiliationSearchUi.showAddCta'));
    assert.ok(screen.includes('affiliationSearchUi.hideJourneyFooter'));
    assert.ok(
      screen.includes(
        "label={t('onboarding.profileCompletion.affiliations.next'",
      ),
    );
    assert.ok(
      screen.includes(
        "label={t('onboarding.profileCompletion.affiliations.skip'",
      ),
    );
  });

  it('J — custom composer uses contextual Add, not Skip/Next', () => {
    const custom = resolveAffiliationSearchUi({
      ...idleInput,
      searchFocused: true,
      customName: 'Hurtado Labs',
      customNameValid: true,
      hasProviderResults: false,
      searchPending: false,
    });
    assert.equal(custom.phase, 'custom_ready');
    assert.equal(custom.showAddCta, true);
    assert.equal(custom.hideJourneyFooter, true);
    assert.equal(custom.addName, 'Hurtado Labs');

    const afterBlur = resolveAffiliationSearchUi({
      ...idleInput,
      searchFocused: false,
      customName: 'Hurtado Labs',
      customNameValid: true,
      hasProviderResults: false,
      searchPending: false,
    });
    assert.equal(afterBlur.phase, 'custom_ready');
    assert.equal(afterBlur.showAddCta, true);
  });

  it('K — keyboard dismissal does not silently persist a selected entity', () => {
    const dismissedWithPick = resolveAffiliationSearchUi({
      ...idleInput,
      searchFocused: false,
      pickedName: 'Microsoft',
      customName: 'Microsoft',
      customNameValid: true,
      hasProviderResults: true,
    });
    assert.equal(dismissedWithPick.phase, 'selected');
    assert.equal(dismissedWithPick.showAddCta, true);
    assert.equal(dismissedWithPick.hideJourneyFooter, true);

    const dismissedWithoutPick = resolveAffiliationSearchUi({
      ...idleInput,
      searchFocused: false,
      customName: 'M',
      customNameValid: true,
    });
    assert.equal(dismissedWithoutPick.phase, 'idle');
    assert.equal(dismissedWithoutPick.showAddCta, false);

    const panel = readSharedSource(
      'components/registration/OnboardingAffiliationCategoryPanel.tsx',
    );
    const blurIdx = panel.indexOf('onBlur={() => {');
    const blurEnd = panel.indexOf('onSubmitEditing={() => {');
    const blurBody = panel.slice(blurIdx, blurEnd);
    assert.ok(blurIdx >= 0);
    assert.ok(blurBody.includes('setSearchFocused(false)'));
    assert.ok(!blurBody.includes('addFromSearch()'));
    assert.ok(!blurBody.includes('onChangeSelected'));
  });

  it('L — missing logo does not suppress the suggestion', () => {
    const initials = resolveAffiliationLogoPresentation({
      name: 'Microsoft',
      categoryId: 'professional',
      logoUrl: null,
    });
    assert.equal(initials.kind, 'initials');
    const panel = readSharedSource(
      'components/registration/OnboardingAffiliationCategoryPanel.tsx',
    );
    assert.ok(panel.includes('results.map((result)'));
    assert.ok(!panel.includes('if (!result.logoUrl)'));
    assert.ok(panel.includes('displayLogoUrl(result)'));
  });

  it('M — provider unavailable copy stays in the search panel', () => {
    const unavailable = resolveAffiliationSearchUi({
      ...idleInput,
      searchFocused: true,
      customName: 'Microsoft',
      customNameValid: true,
      suggestionsUnavailable: true,
    });
    assert.equal(unavailable.phase, 'custom_ready');
    assert.equal(unavailable.showAddCta, true);
    const panel = readSharedSource(
      'components/registration/OnboardingAffiliationCategoryPanel.tsx',
    );
    assert.ok(panel.includes('suggestionsUnavailable'));
    assert.ok(
      panel.includes(
        'onboarding.profileCompletion.affiliations.suggestionsUnavailable',
      ),
    );
    assert.ok(panel.includes('palette.danger'));
    assert.ok(panel.includes('searchUnavailable'));
  });

  it('wires Search Mode into the existing CRJ footer slot', () => {
    const screen = readSharedSource('screens/ProfileCompletionScreen.tsx');
    const panel = readSharedSource(
      'components/registration/OnboardingAffiliationCategoryPanel.tsx',
    );
    assert.ok(screen.includes('keyboardShouldPersistTaps="handled"'));
    assert.ok(panel.includes('keyboardShouldPersistTaps="handled"'));
    assert.ok(panel.includes('onFocus'));
    assert.ok(panel.includes('scrollTo'));
    assert.ok(panel.includes('useReducedMotion'));
    assert.ok(screen.includes('searchAddRef'));
    assert.ok(
      screen.includes(
        'onboarding.profileCompletion.affiliations.addA11y',
      ),
    );
    assert.ok(!panel.includes('ActivityIndicator'));
  });
});

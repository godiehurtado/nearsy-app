import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  affiliationIdentityKey,
  buildCustomAffiliationId,
  listEditableAffiliationCategoryIds,
} from '../affiliations/onboardingAffiliationCatalog';
import { resolveAffiliationTopicId } from '../affiliations/affiliationPresentation';
import { buildPostCrjAffiliationPersistencePatch } from '../affiliations/onboardingAffiliationPersistence';
import { readOnboardingAffiliationsFromDoc } from '../affiliations/postCrjAffiliationEditor';
import {
  formatDiscoveryAffiliationDisplay,
  parseDiscoveryAffiliations,
} from '../visibility/discoveryAffiliations';
import {
  isProfileIncompleteModeError,
  normalizeVisibilityCallableError,
} from '../visibility/callables';
import { shouldApplyActiveProfileModeSwitch } from '../visibility/setActiveProfileModeClientSemantics';

const here = dirname(fileURLToPath(import.meta.url));

function readShared(rel: string): string {
  return readFileSync(join(here, '..', rel), 'utf8');
}

describe('NEARSY-209 final affiliations contract', () => {
  it('new Family writes persist family + topic ids without provider keys', () => {
    const patch = buildPostCrjAffiliationPersistencePatch('personal', [
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
    ]);
    const row = patch.personalOnboardingAffiliations![0]!;
    assert.equal(row.categoryId, 'family');
    assert.equal(row.topic, 'father_of');
    assert.equal(row.source, 'custom');
    assert.equal(row.providerId, undefined);
    assert.equal(row.provider, undefined);
    assert.equal(row.website, undefined);
    assert.equal(
      affiliationIdentityKey({
        name: 'Sofía',
        source: 'custom',
        categoryId: 'family',
        topic: 'father_of',
      }).startsWith('provider:'),
      false,
    );
  });

  it('never converts identity_lifestyle parent into father_of', () => {
    assert.equal(resolveAffiliationTopicId('identity_lifestyle', 'parent'), 'parent');
    const patch = buildPostCrjAffiliationPersistencePatch('personal', [
      {
        id: 'custom_identity_lifestyle_parent',
        name: 'Alex',
        categoryId: 'identity_lifestyle',
        source: 'custom',
        topic: 'parent',
      },
    ]);
    assert.equal(patch.personalOnboardingAffiliations![0]!.categoryId, 'identity_lifestyle');
    assert.equal(patch.personalOnboardingAffiliations![0]!.topic, 'parent');
  });

  it('faith/political nameless rows survive persist, reload, and public parse', () => {
    const id = buildCustomAffiliationId('faith', '', ['custom_faith_catholic'], 'catholic');
    const patch = buildPostCrjAffiliationPersistencePatch('personal', [
      {
        id,
        name: '',
        categoryId: 'faith',
        source: 'provider',
        providerId: 'logo.dev:church',
        provider: 'logo_dev',
        topic: 'catholic',
      },
    ]);
    const persisted = patch.personalOnboardingAffiliations![0]!;
    assert.equal(persisted.name, '');
    assert.equal(persisted.topic, 'catholic');
    assert.equal(persisted.source, 'custom');
    assert.equal(persisted.providerId, undefined);

    const reloaded = readOnboardingAffiliationsFromDoc(
      { personalOnboardingAffiliations: [persisted] },
      'personal',
    );
    assert.equal(reloaded.length, 1);
    assert.equal(reloaded[0]!.name, '');
    assert.equal(reloaded[0]!.topic, 'catholic');

    const publicRows = parseDiscoveryAffiliations([
      { id, name: '', type: 'catholic', logoUrl: null },
    ]);
    assert.equal(publicRows.length, 1);
    const display = formatDiscoveryAffiliationDisplay(publicRows[0]!, (key, fallback) => {
      if (key.endsWith('.catholic')) return 'Catholic';
      return fallback;
    });
    assert.equal(display?.primary, 'Catholic');
  });

  it('editor shows identity_lifestyle only when legacy rows exist', () => {
    assert.deepEqual(
      listEditableAffiliationCategoryIds([{ categoryId: 'family' }]),
      [
        'education',
        'professional',
        'community',
        'sports_clubs',
        'faith',
        'political_civic',
        'family',
      ],
    );
    assert.equal(
      listEditableAffiliationCategoryIds([
        { categoryId: 'identity_lifestyle' },
      ]).at(-1),
      'identity_lifestyle',
    );
  });

  it('Own Profile catches PROFILE_INCOMPLETE without activating the destination', () => {
    const screen = readShared('screens/CompleteProfileScreen.tsx');
    assert.match(screen, /isProfileIncompleteModeError/);
    assert.match(screen, /shouldApplyActiveProfileModeSwitch/);
    assert.match(screen, /destinationMode/);
    assert.match(screen, /missingFields/);
    assert.match(screen, /setMode\(dest\)/);
    assert.doesNotMatch(
      screen.slice(
        screen.indexOf('if (isProfileIncompleteModeError(result.error))'),
        screen.indexOf('const presentation = presentActiveProfileModeError'),
      ),
      /setConfirmedMode/,
    );
  });
});

describe('NEARSY-209 incomplete mode-switch error', () => {
  it('parses failed-precondition PROFILE_INCOMPLETE details', () => {
    const err = normalizeVisibilityCallableError({
      code: 'functions/failed-precondition',
      details: {
        reason: 'profile-incomplete',
        retryable: false,
        code: 'PROFILE_INCOMPLETE',
        mode: 'professional',
        missingFields: ['company', 'bio', 'unknown'],
      },
    });
    assert.equal(isProfileIncompleteModeError(err), true);
    assert.equal(err.code, 'failed-precondition');
    assert.equal(err.detailsCode, 'PROFILE_INCOMPLETE');
    assert.equal(err.destinationMode, 'professional');
    assert.deepEqual(err.missingFields, ['company', 'bio']);
    assert.equal(err.retryable, false);
  });

  it('does not apply incomplete success as a switch to the other face', () => {
    assert.equal(
      shouldApplyActiveProfileModeSwitch({
        confirmedMode: 'personal',
        response: { mode: 'professional', targetProfileComplete: false },
      }),
      false,
    );
    assert.equal(
      shouldApplyActiveProfileModeSwitch({
        confirmedMode: 'personal',
        response: { mode: 'personal', targetProfileComplete: false },
      }),
      true,
    );
  });
});

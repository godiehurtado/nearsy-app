/**
 * Android CRJ — Affiliations before Interests, same catalogs and resume.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { crjPhaseProgressFor } from '../components/registration/crjProgress.ts';
import {
  CRJ_PRE_CATALOG_STEPS,
  listCrjAffiliationCategoryIds,
  listCrjInterestCategoryIds,
  resolveCrjStepFromFlag,
} from '../components/registration/crjStepOrderCore.ts';
import { CRJ_AFFILIATIONS_BEFORE_INTERESTS as ANDROID_FLAG } from '../components/registration/crjStepOrder.android.ts';
import { CRJ_AFFILIATIONS_BEFORE_INTERESTS as DEFAULT_FLAG } from '../components/registration/crjStepOrder.ts';

const here = dirname(fileURLToPath(import.meta.url));

function read(relativeFromSharedSrc: string): string {
  return readFileSync(join(here, '..', relativeFromSharedSrc), 'utf8');
}

function walkKinds(affiliationsFirst: boolean): string[] {
  const kinds: string[] = [];
  for (let i = 0; i < 80; i += 1) {
    const step = resolveCrjStepFromFlag(i, affiliationsFirst);
    kinds.push(step.kind);
    if (step.kind === 'success') break;
  }
  return kinds;
}

describe('NEARSY-209 Android CRJ affiliations before interests', () => {
  it('keeps the default (non-Android) order as Interests then Affiliations', () => {
    assert.equal(DEFAULT_FLAG, false);
    const kinds = walkKinds(false);
    const firstInterest = kinds.indexOf('interestsIntro');
    const firstAffiliation = kinds.indexOf('affiliation');
    const celebration = kinds.indexOf('interestsCelebration');
    assert.ok(firstInterest > kinds.indexOf('details'));
    assert.ok(celebration > firstInterest);
    assert.ok(firstAffiliation > celebration);
    assert.ok(kinds.indexOf('socialMedia') > firstAffiliation);
  });

  it('places Affiliations immediately after details on Android', () => {
    assert.equal(ANDROID_FLAG, true);
    const kinds = walkKinds(true);
    const details = kinds.indexOf('details');
    const firstAffiliation = kinds.indexOf('affiliation');
    const interestsIntro = kinds.indexOf('interestsIntro');
    const celebration = kinds.indexOf('interestsCelebration');
    const social = kinds.indexOf('socialMedia');
    assert.equal(firstAffiliation, details + 1);
    assert.equal(
      kinds.slice(firstAffiliation, interestsIntro).every((k) => k === 'affiliation'),
      true,
    );
    assert.equal(kinds[interestsIntro - 1], 'affiliation');
    assert.ok(interestsIntro > firstAffiliation);
    assert.ok(celebration > interestsIntro);
    assert.equal(kinds[celebration + 1], 'socialMedia');
    assert.ok(social > celebration);
    assert.equal(kinds.includes('gallery'), true);
    assert.equal(kinds.includes('notifications'), true);
  });

  it('walks the same catalog lengths and still ends at success', () => {
    const interestCount = listCrjInterestCategoryIds().length;
    const affiliationCount = listCrjAffiliationCategoryIds().length;
    const android = walkKinds(true);
    const def = walkKinds(false);
    assert.equal(
      android.filter((k) => k === 'interest').length,
      interestCount,
    );
    assert.equal(
      android.filter((k) => k === 'affiliation').length,
      affiliationCount,
    );
    assert.equal(
      def.filter((k) => k === 'interest').length,
      interestCount,
    );
    assert.equal(
      def.filter((k) => k === 'affiliation').length,
      affiliationCount,
    );
    assert.equal(android.at(-1), 'success');
    assert.equal(def.at(-1), 'success');
    assert.deepEqual(
      android.filter((k) => CRJ_PRE_CATALOG_STEPS.includes(k as never)),
      [...CRJ_PRE_CATALOG_STEPS],
    );
  });

  it('keeps the Android progress bar monotonic after swapping catalogs', () => {
    assert.ok(
      crjPhaseProgressFor('affiliations', true) <
        crjPhaseProgressFor('interests', true),
    );
    assert.ok(
      crjPhaseProgressFor('interests', true) <
        crjPhaseProgressFor('social', true),
    );
    assert.equal(crjPhaseProgressFor('affiliations', true), 0.58);
    assert.equal(crjPhaseProgressFor('interests', true), 0.68);
    assert.equal(crjPhaseProgressFor('interests', false), 0.58);
    assert.equal(crjPhaseProgressFor('affiliations', false), 0.68);
  });

  it('wires ProfileCompletionScreen to the platform step order and social next-up', () => {
    const screen = read('screens/ProfileCompletionScreen.tsx');
    assert.match(screen, /resolveCrjStep/);
    assert.match(screen, /CRJ_AFFILIATIONS_BEFORE_INTERESTS/);
    assert.match(screen, /continueTarget=\{/);
    assert.match(screen, /continueSocial/);
    assert.doesNotMatch(screen, /continueTarget="affiliations"/);
    const celebration = read(
      'components/registration/InterestsCelebrationStep.tsx',
    );
    assert.match(celebration, /nextTitleSocial/);
    assert.match(celebration, /continueTarget === 'social'/);
  });
});

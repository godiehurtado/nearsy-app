import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildCrjDetailsPresentation,
  isCrjProfileDetailsValid,
} from '../profile/crjProfileDetails.ts';
import { buildActiveProfileSavePatch } from '../profile/profileModeFields.ts';
import { introNodeEntryDelayMs } from '../components/registration/interestsIntroMotion.ts';

const here = dirname(fileURLToPath(import.meta.url));

function readSharedSource(relativeFromSharedSrc: string): string {
  return readFileSync(join(here, '..', relativeFromSharedSrc), 'utf8');
}

describe('CRJ Profile Details without Status', () => {
  it('A — Personal Details no longer requires Status', () => {
    assert.equal(
      isCrjProfileDetailsValid({
        mode: 'personal',
        occupation: 'Engineer',
        bio: 'Hello nearby',
      }),
      true,
    );
  });

  it('B — Professional Details no longer requires Status', () => {
    assert.equal(
      isCrjProfileDetailsValid({
        mode: 'professional',
        occupation: 'CEO',
        company: 'Nearsy',
        bio: 'Building connections',
      }),
      true,
    );
  });

  it('C — Personal still requires Occupation + Biography', () => {
    assert.equal(
      isCrjProfileDetailsValid({
        mode: 'personal',
        occupation: '',
        bio: 'Bio',
      }),
      false,
    );
    assert.equal(
      isCrjProfileDetailsValid({
        mode: 'personal',
        occupation: 'Engineer',
        bio: '',
      }),
      false,
    );
  });

  it('D — Professional still requires Occupation + Company + Biography', () => {
    assert.equal(
      isCrjProfileDetailsValid({
        mode: 'professional',
        occupation: 'CEO',
        company: '',
        bio: 'Bio',
      }),
      false,
    );
    assert.equal(
      isCrjProfileDetailsValid({
        mode: 'professional',
        occupation: '',
        company: 'Nearsy',
        bio: 'Bio',
      }),
      false,
    );
    assert.equal(
      isCrjProfileDetailsValid({
        mode: 'professional',
        occupation: 'CEO',
        company: 'Nearsy',
        bio: '',
      }),
      false,
    );
  });

  it('E — CRJ save patch does not overwrite status', () => {
    const presentation = buildCrjDetailsPresentation({
      mode: 'personal',
      occupation: 'Engineer',
      bio: 'Nearby explorer',
    });
    assert.equal('status' in presentation, false);
    const patch = buildActiveProfileSavePatch({
      mode: 'personal',
      presentation,
    });
    assert.equal(patch['profiles.personal.status'], undefined);
    assert.equal(patch.status, undefined);
    assert.equal(patch['profiles.personal.occupation'], 'Engineer');
    assert.equal(patch['profiles.personal.bio'], 'Nearby explorer');
  });

  it('F — existing profile status is not cleared by Details save', () => {
    const professional = buildActiveProfileSavePatch({
      mode: 'professional',
      presentation: buildCrjDetailsPresentation({
        mode: 'professional',
        occupation: 'CEO',
        company: 'Complemento 360',
        bio: 'Pro bio',
      }),
    });
    assert.equal(professional['profiles.professional.status'], undefined);
    assert.equal(professional.status, undefined);
    assert.equal(professional['profiles.professional.company'], 'Complemento 360');
  });

  it('G — no Status UI remains in CRJ Details step', () => {
    const source = readSharedSource('screens/ProfileCompletionScreen.tsx');
    assert.doesNotMatch(source, /details\.status/);
    assert.doesNotMatch(source, /setStatus/);
    assert.match(source, /details\.occupation/);
    assert.match(source, /details\.bio/);
    assert.match(source, /details\.company/);
    assert.match(source, /buildCrjDetailsPresentation/);
  });
});

describe('CRJ Interests Intro visual', () => {
  it('does not render selectable interest chips', () => {
    const screen = readSharedSource('screens/ProfileCompletionScreen.tsx');
    const visual = readSharedSource(
      'components/registration/InterestsIntroVisual.tsx',
    );
    assert.match(screen, /InterestsIntroVisual/);
    assert.doesNotMatch(screen, /introChip/);
    assert.doesNotMatch(screen, /InterestChip/);
    assert.doesNotMatch(visual, /Pressable/);
    assert.doesNotMatch(visual, /InterestChip/);
    assert.match(visual, /pointerEvents="none"/);
  });

  it('keeps Find your people purpose, min-10 copy, and CTA routing', () => {
    const onboarding = readSharedSource('i18n/resources/onboarding.ts');
    const screen = readSharedSource('screens/ProfileCompletionScreen.tsx');
    assert.match(onboarding, /title: 'Find your people'/);
    assert.match(onboarding, /Choose at least 10/);
    assert.match(onboarding, /cta: 'Choose my interests'/);
    assert.match(
      screen,
      /onboarding\.profileCompletion\.interestsIntro\.cta/,
    );
    assert.match(screen, /kind === 'interestsIntro'/);
  });

  it('decorative visual is accessibility-hidden', () => {
    const visual = readSharedSource(
      'components/registration/InterestsIntroVisual.tsx',
    );
    assert.match(visual, /accessibilityElementsHidden/);
    assert.match(visual, /importantForAccessibility="no-hide-descendants"/);
  });

  it('reduced-motion path does not block rendering', () => {
    assert.equal(introNodeEntryDelayMs(0, true), 0);
    assert.equal(introNodeEntryDelayMs(3, true), 0);
    assert.ok(introNodeEntryDelayMs(1) > introNodeEntryDelayMs(0));
  });
});

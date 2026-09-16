import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MVP_FREE_SHOW_INTEREST_SEARCH_FILTER,
  MVP_FREE_SHOW_PROFILE_CONNECT_CTA,
} from '../../product/mvpFreePresentation';

const here = dirname(fileURLToPath(import.meta.url));

function readShared(relativeFromSharedSrc: string): string {
  return readFileSync(join(here, '..', '..', relativeFromSharedSrc), 'utf8');
}

describe('MVP Free presentation gates', () => {
  it('Free MVP hides Profile Exploration Connect CTA', () => {
    assert.equal(MVP_FREE_SHOW_PROFILE_CONNECT_CTA, false);
    const screen = readShared('screens/DiscoveryProfileScreen.tsx');
    assert.match(screen, /MVP_FREE_SHOW_PROFILE_CONNECT_CTA \? \(/);
    assert.match(screen, /requestToConnect/);
    assert.match(screen, /showComingSoon/);
    assert.match(screen, /blockCandidateUser/);
  });

  it('Free MVP hides Interest search filter but keeps selector module', () => {
    assert.equal(MVP_FREE_SHOW_INTEREST_SEARCH_FILTER, false);
    const home = readShared('screens/MainHomeScreen.tsx');
    assert.match(home, /MVP_FREE_SHOW_INTEREST_SEARCH_FILTER \? \(/);
    assert.match(home, /InterestMatchSelector/);
  });

  it('Age and Distance filters remain rendered on Home visibility card', () => {
    const home = readShared('screens/MainHomeScreen.tsx');
    assert.match(home, /home\.preferences\.ageRange/);
    assert.match(home, /home\.preferences\.distanceRange/);
    assert.equal((home.match(/<VisibilityRangeSlider/g) ?? []).length, 2);
  });

  it('hiding Interest filter does not clear persisted searchPreferences', () => {
    const home = readShared('screens/MainHomeScreen.tsx');
    assert.match(home, /parseSearchPreferencesFromUserDoc/);
    assert.match(home, /persistSearchPreferencesForMode/);
    assert.doesNotMatch(home, /interestIds:\s*\[\]/);
    assert.doesNotMatch(home, /useEffect[\s\S]{0,200}interestIds:\s*\[\]/);
    assert.doesNotMatch(
      home,
      /MVP_FREE_SHOW_INTEREST_SEARCH_FILTER[\s\S]{0,120}setPrefs/,
    );
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  affiliationSearchUiEqual,
  IDLE_AFFILIATION_SEARCH_UI,
} from '../affiliations/affiliationSearchInteraction';

const here = dirname(fileURLToPath(import.meta.url));

function readSharedSource(relativeFromSharedSrc: string): string {
  return readFileSync(join(here, '..', relativeFromSharedSrc), 'utf8');
}

describe('iOS post-MVP batch 2 — max update depth / affiliations search', () => {
  it('affiliationSearchUiEqual detects identical snapshots', () => {
    assert.equal(
      affiliationSearchUiEqual(
        IDLE_AFFILIATION_SEARCH_UI,
        { ...IDLE_AFFILIATION_SEARCH_UI },
      ),
      true,
    );
    assert.equal(
      affiliationSearchUiEqual(undefined, IDLE_AFFILIATION_SEARCH_UI),
      false,
    );
    assert.equal(
      affiliationSearchUiEqual(IDLE_AFFILIATION_SEARCH_UI, {
        ...IDLE_AFFILIATION_SEARCH_UI,
        hideJourneyFooter: true,
      }),
      false,
    );
  });

  it('panel notifies search UI via ref so unstable parent callbacks cannot loop', () => {
    const panel = readSharedSource(
      'components/registration/OnboardingAffiliationCategoryPanel.tsx',
    );
    assert.match(panel, /onSearchUiChangeRef/);
    assert.match(panel, /onSearchUiChangeRef\.current\?\.\(searchUi\)/);
    assert.doesNotMatch(
      panel,
      /useEffect\(\(\) => \{\s*onSearchUiChange\?\.\(searchUi\);\s*\}, \[searchUi, onSearchUiChange\]\)/,
    );
    assert.match(panel, /maxHeight:\s*280/);
  });

  it('Own Profile Affiliations locks outer scroll in search mode and bails equal UI', () => {
    const screen = readSharedSource('screens/AffiliationsScreen.tsx');
    assert.match(screen, /affiliationSearchUiEqual/);
    assert.match(screen, /scrollEnabled=\{!searchModeActive\}/);
    assert.match(screen, /handleSearchUiChange/);
  });
});

describe('iOS post-MVP batch 2 — visibility permission recovery', () => {
  it('foreground permission helper returns canAskAgain and Settings path exists', () => {
    const orch = readSharedSource('visibility/orchestration.ts');
    assert.match(orch, /canAskAgain:\s*boolean/);
    assert.match(orch, /requestForegroundPermissionsAsync/);

    const home = readSharedSource('screens/MainHomeScreen.tsx');
    assert.match(home, /showVisibilityPermissionDenied/);
    assert.match(home, /Linking\.openSettings/);
    assert.match(home, /outcome\.canAskAgain/);

    const presentation = readSharedSource(
      'visibility/visibilityErrorPresentation.ts',
    );
    assert.match(presentation, /home\.errors\.permissionDenied/);
  });
});

describe('iOS post-MVP batch 2 — background location toggle', () => {
  it('starts only after permission success and respects Settings preference', () => {
    const bg = readSharedSource('services/backgroundLocation.ts');
    assert.match(bg, /getForegroundPermissionsAsync/);
    assert.match(bg, /getBackgroundPermissionsAsync/);
    assert.match(bg, /BackgroundLocationPermissionError/);
    assert.match(bg, /canAskAgain/);

    const more = readSharedSource('screens/MoreScreen.tsx');
    assert.match(more, /isBackgroundLocationPermissionError/);
    assert.match(more, /Linking\.openSettings/);
    assert.match(more, /startBackgroundLocation\(\{ uid \}\)/);
    // Persist preference only after start succeeds on enable
    assert.match(
      more,
      /await startBackgroundLocation\(\{ uid \}\);\s*await setDoc\([\s\S]*?bgVisible:\s*true/,
    );

    const home = readSharedSource('screens/MainHomeScreen.tsx');
    assert.match(home, /profile\.bgVisible/);
    assert.match(
      home,
      /if \(profile\.bgVisible\) \{\s*await startBackgroundLocation/,
    );
  });
});

describe('iOS post-MVP batch 2 — closed batch 1 fixes remain', () => {
  it('OTP Sign out stays removed and notification timing stays non-prompting', () => {
    const otp = readSharedSource('screens/PhoneVerificationScreen.ios.tsx');
    assert.doesNotMatch(otp, /OtpSignOutFooter/);
    const push = readSharedSource('services/pushTokens.ts');
    assert.doesNotMatch(push, /requestPermissionsAsync/);
    const home = readSharedSource('screens/MainHomeScreen.tsx');
    assert.doesNotMatch(home, /home\.greeting/);
  });
});

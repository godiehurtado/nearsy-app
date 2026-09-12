import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  evaluateVisibilitySettingsReturn,
  evaluateBackgroundLocationSettingsReturn,
} from '../visibility/settingsRecovery';

const here = dirname(fileURLToPath(import.meta.url));

function readSharedSource(relativeFromSharedSrc: string): string {
  return readFileSync(join(here, '..', relativeFromSharedSrc), 'utf8');
}

describe('iOS post-MVP batch 2.1 — Visibility return-from-Settings decision logic', () => {
  it('does not activate without prior explicit user intent', () => {
    assert.deepEqual(evaluateVisibilitySettingsReturn(false, 'granted'), {
      shouldActivate: false,
      clearIntent: false,
    });
    assert.deepEqual(evaluateVisibilitySettingsReturn(false, 'denied'), {
      shouldActivate: false,
      clearIntent: false,
    });
  });

  it('activates and clears intent when user had intent and permission is granted', () => {
    assert.deepEqual(evaluateVisibilitySettingsReturn(true, 'granted'), {
      shouldActivate: true,
      clearIntent: true,
    });
  });

  it('stays inactive and clears intent without looping when permission is still denied', () => {
    assert.deepEqual(evaluateVisibilitySettingsReturn(true, 'denied'), {
      shouldActivate: false,
      clearIntent: true,
    });
    assert.deepEqual(evaluateVisibilitySettingsReturn(true, 'undetermined'), {
      shouldActivate: false,
      clearIntent: true,
    });
  });
});

describe('iOS post-MVP batch 2.1 — Background Location return-from-Settings decision logic', () => {
  it('does not enable without prior explicit user intent', () => {
    assert.deepEqual(
      evaluateBackgroundLocationSettingsReturn(false, 'granted', 'granted'),
      { shouldActivate: false, clearIntent: false },
    );
  });

  it('enables only when BOTH foreground and background are granted', () => {
    assert.deepEqual(
      evaluateBackgroundLocationSettingsReturn(true, 'granted', 'granted'),
      { shouldActivate: true, clearIntent: true },
    );
  });

  it('remains OFF and clears intent when background or foreground is missing', () => {
    assert.deepEqual(
      evaluateBackgroundLocationSettingsReturn(true, 'granted', 'denied'),
      { shouldActivate: false, clearIntent: true },
    );
    assert.deepEqual(
      evaluateBackgroundLocationSettingsReturn(true, 'denied', 'granted'),
      { shouldActivate: false, clearIntent: true },
    );
    assert.deepEqual(
      evaluateBackgroundLocationSettingsReturn(true, 'denied', 'denied'),
      { shouldActivate: false, clearIntent: true },
    );
  });
});

describe('iOS post-MVP batch 2.1 — MainHomeScreen auto-continue wiring', () => {
  it('wires pending visibility intent on Open Settings and listens to AppState foregrounding', () => {
    const home = readSharedSource('screens/MainHomeScreen.tsx');
    assert.match(home, /pendingVisibilityIntentRef/);
    assert.match(
      home,
      /pendingVisibilityIntentRef\.current\s*=\s*true;\s*void Linking\.openSettings\(\)/,
    );
    assert.match(home, /AppState\.addEventListener\('change'/);
    assert.match(home, /evaluateVisibilitySettingsReturn/);
    assert.match(home, /activateVisibility\(\)/);
  });
});

describe('iOS post-MVP batch 2.1 — MoreScreen Background Location auto-continue wiring', () => {
  it('wires pending background enable intent on Open Settings and reconciles on foregrounding', () => {
    const more = readSharedSource('screens/MoreScreen.tsx');
    assert.match(more, /pendingBgEnableIntentRef/);
    assert.match(
      more,
      /pendingBgEnableIntentRef\.current\s*=\s*true;\s*void Linking\.openSettings\(\)/,
    );
    assert.match(more, /AppState\.addEventListener\('change'/);
    assert.match(more, /evaluateBackgroundLocationSettingsReturn/);
    assert.match(more, /startBackgroundLocation\(\{ uid \}\)/);
    assert.match(more, /setBgVisible\(true\)/);
  });
});

describe('iOS post-MVP batch 2.1 — Affiliations search / keyboard UX wiring', () => {
  it('panel automatically positions search area and focuses input when category topic is selected', () => {
    const panel = readSharedSource(
      'components/registration/OnboardingAffiliationCategoryPanel.tsx',
    );
    assert.match(panel, /scrollSearchIntoView\(\)/);
    assert.match(panel, /searchInputRef\.current\?\.focus\(\)/);
  });

  it('panel dismisses keyboard and scrolls selected entity into view on pickResult', () => {
    const panel = readSharedSource(
      'components/registration/OnboardingAffiliationCategoryPanel.tsx',
    );
    const pickStart = panel.indexOf('function pickResult(');
    const pickEnd = panel.indexOf('async function pickOwnLogo()');
    const pickBody = panel.slice(pickStart, pickEnd);

    assert.ok(pickStart >= 0);
    assert.match(pickBody, /Keyboard\.dismiss\(\)/);
    assert.match(pickBody, /searchInputRef\.current\?\.blur\(\)/);
    assert.match(pickBody, /scheduleScrollSearchIntoView\(\)/);
  });

  it('AffiliationsScreen retains outer scroll lock during search and shows Add CTA', () => {
    const screen = readSharedSource('screens/AffiliationsScreen.tsx');
    assert.match(screen, /scrollEnabled=\{!searchModeActive\}/);
    assert.match(screen, /onPress=\{showAddCta \? handleAddPending : handleSave\}/);
  });
});

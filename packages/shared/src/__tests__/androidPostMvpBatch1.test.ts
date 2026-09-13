/**
 * Android post-MVP batch 1 — settings-return decision helpers + source guards.
 *
 * Run:
 *   node --experimental-strip-types --test packages/shared/src/__tests__/androidPostMvpBatch1.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import {
  evaluateBackgroundLocationSettingsReturn,
  evaluateVisibilitySettingsReturn,
} from '../visibility/settingsRecovery.ts';

const here = dirname(fileURLToPath(import.meta.url));

function readSharedSource(relativeFromSharedSrc: string): string {
  return readFileSync(join(here, '..', relativeFromSharedSrc), 'utf8');
}

describe('settingsRecovery decisions', () => {
  it('visibility: no pending intent never activates or clears', () => {
    assert.deepEqual(evaluateVisibilitySettingsReturn(false, 'granted'), {
      shouldActivate: false,
      clearIntent: false,
    });
    assert.deepEqual(evaluateVisibilitySettingsReturn(false, 'denied'), {
      shouldActivate: false,
      clearIntent: false,
    });
  });

  it('visibility: pending + granted activates once and clears', () => {
    assert.deepEqual(evaluateVisibilitySettingsReturn(true, 'granted'), {
      shouldActivate: true,
      clearIntent: true,
    });
  });

  it('visibility: pending + still denied clears without activating', () => {
    assert.deepEqual(evaluateVisibilitySettingsReturn(true, 'denied'), {
      shouldActivate: false,
      clearIntent: true,
    });
    assert.deepEqual(evaluateVisibilitySettingsReturn(true, 'undetermined'), {
      shouldActivate: false,
      clearIntent: true,
    });
  });

  it('background: requires both FG and BG granted when pending', () => {
    assert.deepEqual(
      evaluateBackgroundLocationSettingsReturn(true, 'granted', 'granted'),
      { shouldActivate: true, clearIntent: true },
    );
    assert.deepEqual(
      evaluateBackgroundLocationSettingsReturn(true, 'granted', 'denied'),
      { shouldActivate: false, clearIntent: true },
    );
    assert.deepEqual(
      evaluateBackgroundLocationSettingsReturn(false, 'granted', 'granted'),
      { shouldActivate: false, clearIntent: false },
    );
  });
});

describe('Android post-MVP batch 1 source contracts', () => {
  it('OTP Android screen has no Sign out affordance', () => {
    const screen = readSharedSource('screens/PhoneVerificationScreen.android.tsx');
    assert.doesNotMatch(screen, /OtpSignOutFooter/);
    assert.doesNotMatch(screen, /phoneOtp\.signOut/);
    assert.doesNotMatch(screen, /runPhoneOtpScreenSignOut/);
    assert.match(screen, /OtpSixDigitInput/);
    assert.match(screen, /getPhoneOtpClient/);
  });

  it('CRJ identity EN label is First Name', () => {
    const onboarding = readSharedSource('i18n/resources/onboarding.ts');
    assert.match(onboarding, /nameLabel:\s*'First Name'/);
    assert.match(onboarding, /namePlaceholder:\s*'First Name'/);
    assert.doesNotMatch(
      onboarding,
      /identity:\s*\{[\s\S]*?nameLabel:\s*'Name'/,
    );
  });

  it('Home no longer renders Hello greeting', () => {
    const home = readSharedSource('screens/MainHomeScreen.tsx');
    const homeI18n = readSharedSource('i18n/resources/home.ts');
    assert.doesNotMatch(home, /home\.greeting/);
    assert.doesNotMatch(homeI18n, /greeting:/);
  });

  it('Visibility Settings recovery is wired on Home', () => {
    const home = readSharedSource('screens/MainHomeScreen.tsx');
    const orch = readSharedSource('visibility/orchestration.ts');
    assert.match(home, /pendingVisibilityIntentRef/);
    assert.match(home, /evaluateVisibilitySettingsReturn/);
    assert.match(home, /Linking\.openSettings/);
    assert.match(home, /outcome\.canAskAgain/);
    assert.match(orch, /canAskAgain:\s*boolean/);
    assert.match(home, /profileRef\.current\.bgVisible/);
  });

  it('Background Location Settings recovery is wired on More', () => {
    const more = readSharedSource('screens/MoreScreen.tsx');
    const bg = readSharedSource('services/backgroundLocation.ts');
    assert.match(more, /pendingBgEnableIntentRef/);
    assert.match(more, /evaluateBackgroundLocationSettingsReturn/);
    assert.match(more, /isBackgroundLocationPermissionError/);
    assert.match(more, /Linking\.openSettings/);
    assert.match(bg, /BackgroundLocationPermissionError/);
    assert.match(bg, /canAskAgain/);
  });

  it('pushTokens.android never requests notification permission', () => {
    const push = readSharedSource('services/pushTokens.android.ts');
    assert.match(push, /getPermissionsAsync/);
    assert.doesNotMatch(push, /requestPermissionsAsync/);
    assert.match(push, /permission-not-granted/);
  });
});

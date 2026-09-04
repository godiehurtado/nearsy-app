/**
 * Android J03 — register / phone OTP integration contracts.
 *
 * Run:
 *   node --experimental-strip-types --test packages/shared/src/phoneOtp/__tests__/registerNavigation.test.ts
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveOnboardingRoute } from '../onboardingResolver.ts';
import { resolveAuthenticatedProfileFlow } from '../../navigation/profileGate.ts';

const here = dirname(fileURLToPath(import.meta.url));

function readSharedSource(relativeFromSharedSrc: string): string {
  return readFileSync(join(here, '..', '..', relativeFromSharedSrc), 'utf8');
}

describe('Android register and phone OTP integration', () => {
  it('Register persists phone with phoneVerified false (no OTP bypass as verified)', () => {
    const register = readSharedSource('screens/RegisterScreen.tsx');
    assert.match(register, /phoneVerified:\s*false/);
    assert.doesNotMatch(register, /phoneVerified:\s*true\s*[,}]/);
    assert.doesNotMatch(register, /TEMPORARY BYPASS/);
    assert.doesNotMatch(register, /navigation\.reset\(/);
  });

  it('Android OTP screen uses Identity backend — not Firebase PhoneAuth', () => {
    const screen = readSharedSource('screens/PhoneVerificationScreen.android.tsx');
    assert.doesNotMatch(screen, /PhoneAuthProvider/);
    assert.doesNotMatch(screen, /signInWithPhoneNumber/);
    assert.doesNotMatch(screen, /phoneVerified:\s*true/);
    assert.match(screen, /getPhoneOtpClient/);
    assert.match(screen, /createPhoneOtpController/);
    assert.match(screen, /runPhoneOtpScreenSignOut/);
    assert.match(screen, /OtpSixDigitInput/);
  });

  it('Android foundation uses J01 App Check + identity Functions region', () => {
    const foundation = readSharedSource(
      'phoneOtp/phoneOtpFoundation.android.ts',
    );
    assert.match(foundation, /ensureAppCheckInitialized/);
    assert.match(foundation, /getIdentityFunctions/);
    assert.match(foundation, /httpsCallable/);
    assert.doesNotMatch(foundation, /nearsy-dev/);
    assert.doesNotMatch(foundation, /fixture|fakeOtp|hardcoded/i);
  });

  it('AppNavigator includes PhoneVerification in authoritative onboarding stack', () => {
    const nav = readSharedSource('navigation/AppNavigator.tsx');
    assert.match(nav, /needsOnboarding/);
    assert.match(nav, /RootAuthenticatedComplete/);
    assert.match(nav, /name="OnboardingBirthDate"/);
    assert.match(nav, /name="PhoneVerification"/);
    assert.match(nav, /initialRouteName=\{onboardingInitialRoute\}/);
    assert.doesNotMatch(nav, /RootAuthenticatedPhone/);
    assert.doesNotMatch(nav, /PhoneAuthProvider/);
  });

  it('profile gate maps valid DOB + unverified phone → PhoneVerification', () => {
    const flow = resolveAuthenticatedProfileFlow({
      phase: 'profile_missing_or_incomplete',
      data: {
        profileSetupCompleted: false,
        birthDate: '1990-01-15',
        phoneVerified: false,
      },
    });
    assert.equal(flow.kind, 'PhoneVerification');
  });

  it('profile gate maps verified phone + incomplete setup → ProfileCompletion', () => {
    const flow = resolveAuthenticatedProfileFlow({
      phase: 'profile_missing_or_incomplete',
      data: {
        profileSetupCompleted: false,
        birthDate: '1990-01-15',
        phoneVerified: true,
      },
    });
    assert.equal(flow.kind, 'ProfileCompletion');
  });

  it('onboarding resolver does not invent local phoneVerified=true', () => {
    assert.equal(
      resolveOnboardingRoute({
        birthDate: '1990-01-15',
        phoneVerified: false,
      }).kind,
      'needsPhoneVerification',
    );
    assert.equal(
      resolveOnboardingRoute({
        profileSetupCompleted: true,
        phoneVerified: false,
      }).kind,
      'complete',
    );
  });
});

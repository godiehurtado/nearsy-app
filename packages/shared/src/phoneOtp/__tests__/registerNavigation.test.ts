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
  it('Register creates account without phone; phoneVerified stays false until J03 OTP', () => {
    const register = readSharedSource('screens/RegisterScreen.tsx');
    assert.match(register, /EMAIL_REGISTER_STEPS/);
    assert.match(register, /phone:\s*null/);
    assert.match(register, /phoneVerified:\s*false/);
    assert.doesNotMatch(register, /phoneVerified:\s*true\s*[,}]/);
    assert.doesNotMatch(register, /TEMPORARY BYPASS/);
    assert.doesNotMatch(register, /navigation\.reset\(/);
    assert.doesNotMatch(register, /case 'phone'/);
    assert.doesNotMatch(register, /case 'name'/);
  });

  it('Android OTP screen uses Identity backend — not Firebase PhoneAuth', () => {
    const screen = readSharedSource('screens/PhoneVerificationScreen.android.tsx');
    assert.doesNotMatch(screen, /PhoneAuthProvider/);
    assert.doesNotMatch(screen, /signInWithPhoneNumber/);
    assert.doesNotMatch(screen, /phoneVerified:\s*true/);
    assert.match(screen, /getPhoneOtpClient/);
    assert.match(screen, /createPhoneOtpController/);
    assert.doesNotMatch(screen, /runPhoneOtpScreenSignOut/);
    assert.doesNotMatch(screen, /OtpSignOutFooter/);
    assert.match(screen, /OtpSixDigitInput/);
  });

  it('Android foundation uses J01 App Check + identity Functions region', () => {
    const foundation = readSharedSource(
      'phoneOtp/phoneOtpFoundation.android.ts',
    );
    assert.match(foundation, /ensureAppCheckInitialized/);
    assert.match(foundation, /getIdentityFunctions/);
    assert.match(foundation, /httpsCallable/);
    assert.match(foundation, /getIdToken\(true\)/);
    assert.doesNotMatch(foundation, /nearsy-dev/);
    assert.doesNotMatch(foundation, /fixture|fakeOtp|hardcoded/i);
  });

  it('Register persists canonical birthDate before gate handoff; phoneVerified stays false', () => {
    const register = readSharedSource('screens/RegisterScreen.tsx');
    assert.match(register, /birthDate:\s*isoBirthDate/);
    assert.match(register, /acceptedTerms:\s*true/);
    assert.match(register, /acceptedTermsAt:/);
    assert.match(register, /getIdToken\(true\)/);
    assert.match(register, /phoneVerified:\s*false/);
    assert.doesNotMatch(register, /profileSetupCompleted:\s*true/);
  });

  it('pre-auth DOB on profile skips OnboardingBirthDate (Email→…→OTP)', () => {
    const withDob = resolveAuthenticatedProfileFlow({
      phase: 'profile_missing_or_incomplete',
      data: {
        profileSetupCompleted: false,
        birthDate: '1995-06-01',
        phoneVerified: false,
        acceptedTerms: true,
      },
    });
    assert.equal(withDob.kind, 'PhoneVerification');

    const withoutDob = resolveAuthenticatedProfileFlow({
      phase: 'profile_missing_or_incomplete',
      data: {
        profileSetupCompleted: false,
        phoneVerified: false,
      },
    });
    assert.equal(withoutDob.kind, 'OnboardingBirthDate');

    // Absent doc must not be treated as an authoritative "needs DOB" yet —
    // gate controller keeps loading until confirm (tested in profileGate.test).
    assert.equal(
      resolveOnboardingRoute(null).kind,
      'needsDateOfBirth',
    );
  });

  it('legacy Real Name / old DOB / old Phone steps unreachable in Register', () => {
    const register = readSharedSource('screens/RegisterScreen.tsx');
    const steps = readSharedSource(
      'components/registration/emailRegisterSteps.ts',
    );
    assert.match(steps, /'email'/);
    assert.match(steps, /'password'/);
    assert.match(steps, /'birth'/);
    assert.match(steps, /'terms'/);
    assert.ok(steps.indexOf("'email'") < steps.indexOf("'password'"));
    assert.ok(steps.indexOf("'password'") < steps.indexOf("'birth'"));
    assert.ok(steps.indexOf("'birth'") < steps.indexOf("'terms'"));
    assert.doesNotMatch(register, /case 'name'/);
    assert.doesNotMatch(register, /case 'phone'/);
    assert.doesNotMatch(register, /EMAIL_STEPS/);
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

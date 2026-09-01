import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { EMAIL_REGISTER_STEPS } from '../../components/registration/emailRegisterSteps';
import { resolveOnboardingRoute } from '../onboardingResolver';

const here = dirname(fileURLToPath(import.meta.url));

function readSharedSource(relativeFromSharedSrc: string): string {
  return readFileSync(join(here, '..', '..', relativeFromSharedSrc), 'utf8');
}

describe('register and phone OTP integration', () => {
  it('email wizard ends with terms, not phone', () => {
    assert.deepEqual([...EMAIL_REGISTER_STEPS], [
      'email',
      'password',
      'birth',
      'terms',
    ]);
  });

  it('RegisterScreen removes phone bypass and OTP persistence', () => {
    const register = readSharedSource('screens/RegisterScreen.tsx');
    assert.doesNotMatch(register, /TEMPORARY BYPASS/);
    assert.doesNotMatch(register, /phone:\s*normalizedPhone/);
    assert.match(register, /phone:\s*null/);
    assert.match(register, /phoneVerified:\s*false/);
    assert.doesNotMatch(register, /navigation\.reset/);
  });

  it('iOS OTP screen does not write phoneVerified true', () => {
    const screen = readSharedSource('screens/PhoneVerificationScreen.ios.tsx');
    assert.doesNotMatch(screen, /phoneVerified:\s*true/);
    assert.doesNotMatch(screen, /PhoneAuthProvider/);
    assert.doesNotMatch(screen, /signInWithPhoneNumber/);
    assert.doesNotMatch(screen, /AsyncStorage/);
    assert.match(screen, /performPhoneOtpOnboardingLogout/);
    assert.match(screen, /phoneOtp\.signOut\.label/);
    assert.match(screen, /signOutError/);
    assert.match(screen, /result\.messageKey/);
    assert.match(screen, /textContentType="oneTimeCode"/);
  });

  it('Android phone screen unchanged by iOS OTP work', () => {
    const android = readSharedSource('screens/PhoneVerificationScreen.android.tsx');
    assert.match(android, /PhoneAuthProvider/);
  });

  it('social missing DOB resolves needsDateOfBirth', () => {
    assert.equal(
      resolveOnboardingRoute({ phoneVerified: false }).kind,
      'needsDateOfBirth',
    );
  });

  it('AppNavigator wires PhoneVerification in authenticated incomplete stack', () => {
    const nav = readSharedSource('navigation/AppNavigator.tsx');
    assert.match(nav, /resolveAuthenticatedStackInitialRoute/);
    assert.match(nav, /name="PhoneVerification"/);
    assert.match(nav, /initialRouteName=\{onboardingInitialRoute\}/);
  });

  it('hooks converge on applyPostAuthNavigation', () => {
    const google = readSharedSource('hooks/useGoogleSignInFlow.ts');
    const apple = readSharedSource('hooks/useAppleSignInFlow.ts');
    const linkedin = readSharedSource('hooks/useLinkedInSignInFlow.ios.ts');
    const login = readSharedSource('screens/LoginScreen.tsx');
    assert.match(google, /applyPostAuthNavigation/);
    assert.match(apple, /applyPostAuthNavigation/);
    assert.match(linkedin, /applyPostAuthNavigation/);
    assert.match(login, /applyPostAuthNavigation/);
  });
});

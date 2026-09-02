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
    assert.match(screen, /runPhoneOtpScreenSignOut/);
    assert.match(screen, /createPhoneOtpSignOutPressHandler/);
    assert.match(screen, /resetAuthNavigationToLogin/);
    assert.match(screen, /handleSignOutPress/);
    assert.match(screen, /clearPendingSocialProfilePrefill/);
    assert.match(screen, /styles\.header/);
    assert.match(screen, /styles\.stepScroll/);
    assert.doesNotMatch(screen, /flexGrow:\s*1/);
    assert.match(screen, /SecondaryButton/);
    assert.match(screen, /OtpContextualAction/);
    assert.match(screen, /OtpSignOutFooter/);
    assert.match(screen, /styles\.actionSection/);
    assert.match(screen, /styles\.primaryActionSection/);
    assert.match(screen, /marginTop:\s*spacing\.lg/);
    assert.match(screen, /styles\.actionStack/);
    assert.match(screen, /OtpSixDigitInput/);
    const otpComponent = readSharedSource('components/phoneOtp/OtpSixDigitInput.tsx');
    assert.match(otpComponent, /textContentType="oneTimeCode"/);
    assert.match(otpComponent, /autoComplete="sms-otp"/);
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

  it('OnboardingBirthDate screen persists DOB then re-runs central navigation', () => {
    const dob = readSharedSource('screens/OnboardingBirthDateScreen.ios.tsx');
    assert.match(dob, /buildBirthDatePersistencePatch/);
    assert.match(dob, /profileSnapshot/);
    assert.match(dob, /applyPostAuthNavigation/);
    assert.doesNotMatch(dob, /profileSetupCompleted:\s*true/);
    assert.doesNotMatch(dob, /ProfileCompletion/);
  });

  it('AppNavigator wires OnboardingBirthDate and PhoneVerification in incomplete stack', () => {
    const nav = readSharedSource('navigation/AppNavigator.tsx');
    assert.match(nav, /resolveAuthenticatedStackInitialRoute/);
    assert.match(nav, /name="OnboardingBirthDate"/);
    assert.match(nav, /name="PhoneVerification"/);
    assert.match(nav, /initialRouteName=\{onboardingInitialRoute\}/);
  });

  it('post-auth resolver maps needsDateOfBirth to OnboardingBirthDate', () => {
    const resolver = readSharedSource('phoneOtp/onboardingResolver.ts');
    assert.match(
      resolver,
      /case 'needsDateOfBirth':\s*\n\s*return 'OnboardingBirthDate'/,
    );
    assert.doesNotMatch(
      resolver,
      /case 'needsDateOfBirth':[\s\S]{0,80}return 'ProfileCompletion'/,
    );
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

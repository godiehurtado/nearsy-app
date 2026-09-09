import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  birthDateStepCount,
  EMAIL_REGISTER_STEPS,
  emailRegisterStepAt,
  nextEmailRegisterStep,
  previousEmailRegisterStep,
} from '../components/registration/emailRegisterSteps.ts';
import {
  birthDateToIso,
  meetsMinimumRegistrationAge,
  meetsRegistrationAgeRange,
  minRegistrationBirthDate,
  MAX_REGISTRATION_AGE,
  MIN_REGISTRATION_AGE,
  type BirthDateParts,
} from '../utils/birthDate.ts';

const here = dirname(fileURLToPath(import.meta.url));

function readSharedSource(relativeFromSharedSrc: string): string {
  return readFileSync(join(here, '..', relativeFromSharedSrc), 'utf8');
}

describe('email register wizard order', () => {
  it('Birth Date exists exactly once', () => {
    assert.equal(birthDateStepCount(EMAIL_REGISTER_STEPS), 1);
  });

  it('order is email → password → birth → terms', () => {
    assert.deepEqual([...EMAIL_REGISTER_STEPS], [
      'email',
      'password',
      'birth',
      'terms',
    ]);
  });

  it('Back from Birth Date returns Password', () => {
    const birthIndex = EMAIL_REGISTER_STEPS.indexOf('birth');
    assert.equal(previousEmailRegisterStep(birthIndex), 'password');
  });

  it('Back from Terms returns Birth Date', () => {
    const termsIndex = EMAIL_REGISTER_STEPS.indexOf('terms');
    assert.equal(previousEmailRegisterStep(termsIndex), 'birth');
  });

  it('forward: Email → Password → Birth → Terms → submit', () => {
    assert.equal(emailRegisterStepAt(0), 'email');
    assert.equal(nextEmailRegisterStep(0), 'password');
    assert.equal(nextEmailRegisterStep(1), 'birth');
    assert.equal(nextEmailRegisterStep(2), 'terms');
    assert.equal(nextEmailRegisterStep(3), 'submit');
  });

  it('Back from Email leaves the wizard', () => {
    assert.equal(previousEmailRegisterStep(0), 'welcome');
  });

  it('age window is 18–99', () => {
    assert.equal(MIN_REGISTRATION_AGE, 18);
    assert.equal(MAX_REGISTRATION_AGE, 99);
    const asOf = new Date(2026, 7, 13);
    const eighteen: BirthDateParts = { day: 13, month: 8, year: 2008 };
    const seventeen: BirthDateParts = { day: 14, month: 8, year: 2008 };
    assert.equal(meetsMinimumRegistrationAge(eighteen, asOf), true);
    assert.equal(meetsMinimumRegistrationAge(seventeen, asOf), false);
  });

  it('canonical YYYY-MM-DD persistence', () => {
    assert.equal(
      birthDateToIso({ day: 31, month: 12, year: 1990 }),
      '1990-12-31',
    );
  });

  it('RegisterScreen uses EMAIL_REGISTER_STEPS (not legacy name-first)', () => {
    const register = readSharedSource('screens/RegisterScreen.tsx');
    assert.match(register, /EMAIL_REGISTER_STEPS/);
    assert.match(register, /Email → Password → Birth → Terms/);
    assert.doesNotMatch(
      register,
      /\['name',\s*'birth',\s*'email',\s*'password',\s*'phone'\]/,
    );
    assert.doesNotMatch(register, /EMAIL_STEPS/);
    assert.doesNotMatch(register, /case 'name'/);
    assert.doesNotMatch(register, /case 'phone'/);
    assert.match(register, /case 'terms'/);
    assert.match(register, /https:\/\/nearsy\.app\/legal/);
    assert.match(register, /acceptedTermsAt/);
    assert.match(register, /phoneVerified:\s*false/);
    assert.match(register, /phone:\s*null/);
  });

  it('legacy Real Name → DOB → Email order is not the canonical route', () => {
    assert.notEqual(EMAIL_REGISTER_STEPS[0], 'name');
    assert.equal(EMAIL_REGISTER_STEPS[0], 'email');
  });

  it('Login/Welcome social paths do not open Register wizard', () => {
    const login = readSharedSource('screens/LoginScreen.tsx');
    const loginSocial = login.slice(
      login.indexOf('const handleSocialPress'),
      login.indexOf('const handleCreateProfile'),
    );
    assert.match(loginSocial, /signInWithGoogle/);
    assert.match(loginSocial, /signInWithLinkedIn/);
    assert.doesNotMatch(loginSocial, /navigate\('Register'/);
    assert.doesNotMatch(loginSocial, /signInWithApple/);

    const welcome = readSharedSource('screens/WelcomeScreen.tsx');
    assert.doesNotMatch(
      welcome.slice(
        welcome.indexOf('function onProvider'),
        welcome.indexOf('const socialLabels'),
      ),
      /navigate\('Register'/,
    );
  });

  it('Register → Email first; post-auth OTP then ProfileCompletion wired via gate', () => {
    const register = readSharedSource('screens/RegisterScreen.tsx');
    assert.match(register, /EMAIL_REGISTER_STEPS\[stepIndex\]/);
    assert.match(register, /registerWithEmail/);
    assert.match(register, /createUserProfile/);

    const gate = readSharedSource('navigation/profileGate.ts');
    assert.match(gate, /OnboardingBirthDate/);
    assert.match(gate, /PhoneVerification/);
    assert.match(gate, /ProfileCompletion/);

    const navigator = readSharedSource('navigation/AppNavigator.tsx');
    assert.match(navigator, /name="Register"/);
    assert.match(navigator, /name="PhoneVerification"/);
    assert.match(navigator, /name="ProfileCompletion"/);
  });

  it('minRegistrationBirthDate aligns with 99-year ceiling', () => {
    const asOf = new Date(2026, 8, 1);
    assert.equal(
      meetsRegistrationAgeRange({ day: 1, month: 9, year: 1927 }, asOf),
      true,
    );
    assert.equal(
      meetsRegistrationAgeRange({ day: 1, month: 9, year: 1926 }, asOf),
      false,
    );
    const register = readSharedSource('screens/RegisterScreen.tsx');
    assert.match(register, /meetsRegistrationAgeRange/);
    assert.match(register, /minRegistrationBirthDate/);
    assert.deepEqual(minRegistrationBirthDate(asOf), {
      year: 1926,
      month: 9,
      day: 2,
    });
  });
});

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
} from '../components/registration/emailRegisterSteps';
import {
  birthDateToIso,
  meetsMinimumRegistrationAge,
  MIN_REGISTRATION_AGE,
  type BirthDateParts,
} from '../utils/birthDate';
import { resolveAppleAuthNavigationTarget } from '../authentication/social/application/appleSignInUiPolicy';

const here = dirname(fileURLToPath(import.meta.url));

function readSharedSource(relativeFromSharedSrc: string): string {
  return readFileSync(join(here, '..', relativeFromSharedSrc), 'utf8');
}

describe('email register wizard order', () => {
  it('A — Birth Date exists exactly once', () => {
    assert.equal(birthDateStepCount(EMAIL_REGISTER_STEPS), 1);
    assert.equal(
      EMAIL_REGISTER_STEPS.filter((step) => step === 'birth').length,
      1,
    );
  });

  it('B — order is email → password → birth → phone', () => {
    assert.deepEqual([...EMAIL_REGISTER_STEPS], [
      'email',
      'password',
      'birth',
      'phone',
    ]);
  });

  it('C — Back from Birth Date returns Password', () => {
    const birthIndex = EMAIL_REGISTER_STEPS.indexOf('birth');
    assert.equal(previousEmailRegisterStep(birthIndex), 'password');
  });

  it('D — Back from Phone returns Birth Date', () => {
    const phoneIndex = EMAIL_REGISTER_STEPS.indexOf('phone');
    assert.equal(previousEmailRegisterStep(phoneIndex), 'birth');
  });

  it('forward: Email Continue → Password, Password Continue → Birth, Birth Continue → Phone', () => {
    assert.equal(emailRegisterStepAt(0), 'email');
    assert.equal(nextEmailRegisterStep(0), 'password');
    assert.equal(nextEmailRegisterStep(1), 'birth');
    assert.equal(nextEmailRegisterStep(2), 'phone');
    assert.equal(nextEmailRegisterStep(3), 'submit');
  });

  it('Back from Email (first step) leaves the wizard', () => {
    assert.equal(previousEmailRegisterStep(0), 'welcome');
  });

  it('E — age >= 18 rule unchanged', () => {
    assert.equal(MIN_REGISTRATION_AGE, 18);
    const asOf = new Date(2026, 7, 13);
    const eighteen: BirthDateParts = { day: 13, month: 8, year: 2008 };
    const seventeen: BirthDateParts = { day: 14, month: 8, year: 2008 };
    assert.equal(meetsMinimumRegistrationAge(eighteen, asOf), true);
    assert.equal(meetsMinimumRegistrationAge(seventeen, asOf), false);
  });

  it('F — canonical YYYY-MM-DD persistence unchanged', () => {
    assert.equal(
      birthDateToIso({ day: 31, month: 12, year: 1990 }),
      '1990-12-31',
    );
  });

  it('G — social auth does not start the Email/Password wizard', () => {
    assert.equal(
      resolveAppleAuthNavigationTarget('CompleteProfile'),
      'ProfileCompletion',
    );
    assert.equal(resolveAppleAuthNavigationTarget('MainTabs'), 'MainTabs');

    const login = readSharedSource('screens/LoginScreen.tsx');
    const loginSocial = login.slice(
      login.indexOf('const handleSocialPress'),
      login.indexOf('const handleCreateProfile'),
    );
    assert.match(loginSocial, /signInWithGoogle/);
    assert.match(loginSocial, /signInWithApple/);
    assert.match(loginSocial, /signInWithLinkedIn/);
    assert.doesNotMatch(loginSocial, /navigate\('Register'/);

    const welcome = readSharedSource('screens/WelcomeScreen.tsx');
    const welcomeSocial = welcome.slice(
      welcome.indexOf('function onProvider'),
      welcome.indexOf('const socialLabels'),
    );
    assert.match(welcomeSocial, /signInWithGoogle/);
    assert.match(welcomeSocial, /signInWithApple/);
    assert.doesNotMatch(welcomeSocial, /navigate\('Register'/);
  });

  it('RegisterScreen uses the shared email-register step machine', () => {
    const register = readSharedSource('screens/RegisterScreen.tsx');
    assert.match(register, /EMAIL_REGISTER_STEPS/);
    assert.doesNotMatch(
      register,
      /\['birth',\s*'email',\s*'password',\s*'phone'\]/,
    );
    assert.match(
      register,
      /Email → Password → Birth → Phone\+Terms/,
    );
  });

  it('I — Name/Last Name identity fields remain separate FormInputs', () => {
    const source = readSharedSource('screens/ProfileCompletionScreen.tsx');
    assert.match(source, /identity\.nameLabel/);
    assert.match(source, /identity\.lastNameLabel/);
    assert.match(source, /onFirstNameChange/);
    assert.match(source, /onLastNameChange/);
    assert.match(source, /formBlock: \{ marginTop: spacing\.xxl, gap: spacing\.lg \}/);
  });
});

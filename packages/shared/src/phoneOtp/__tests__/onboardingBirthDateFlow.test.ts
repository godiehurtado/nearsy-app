import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildBirthDatePersistencePatch } from '../../settings/settingsContracts';
import {
  mergeOnboardingProfileSnapshots,
  normalizeBirthDateIsoValue,
  normalizeOnboardingProfileSnapshot,
} from '../onboardingProfileSnapshot';
import {
  resolveOnboardingRoute,
  resolvePostAuthNavigationTarget,
} from '../onboardingResolver';
import { meetsRegistrationAgeRange } from '../../utils/birthDate';

const here = dirname(fileURLToPath(import.meta.url));

function readSharedSource(relativeFromSharedSrc: string): string {
  return readFileSync(join(here, '..', '..', relativeFromSharedSrc), 'utf8');
}

describe('onboarding birth date persistence flow', () => {
  const asOf = new Date(2026, 8, 1);

  it('Google new without DOB resolves to needsDateOfBirth', () => {
    assert.equal(resolveOnboardingRoute({ phoneVerified: false }).kind, 'needsDateOfBirth');
  });

  it('valid saved DOB resolves to needsPhoneVerification', () => {
    assert.equal(
      resolveOnboardingRoute(
        { birthDate: '1994-05-20', birthYear: 1994, phoneVerified: false },
        asOf,
      ).kind,
      'needsPhoneVerification',
    );
    assert.equal(
      resolvePostAuthNavigationTarget(
        { birthDate: '1994-05-20', birthYear: 1994, phoneVerified: false },
        asOf,
      ),
      'PhoneVerification',
    );
  });

  it('stale remote snapshot without DOB does not loop after persisted overlay', () => {
    const merged = mergeOnboardingProfileSnapshots(
      { phoneVerified: false, profileSetupCompleted: false },
      { birthDate: '1991-03-15', birthYear: 1991 },
    );
    assert.equal(resolveOnboardingRoute(merged, asOf).kind, 'needsPhoneVerification');
    assert.equal(resolvePostAuthNavigationTarget(merged, asOf), 'PhoneVerification');
  });

  it('reload with persisted DOB does not return to DOB screen', () => {
    assert.equal(
      resolvePostAuthNavigationTarget(
        { birthDate: '1988-07-12', phoneVerified: false },
        asOf,
      ),
      'PhoneVerification',
    );
  });

  it('normalizes Firestore Timestamp birthDate to canonical ISO for resolver', () => {
    const iso = normalizeBirthDateIsoValue({
      toDate: () => new Date(1990, 11, 31),
    });
    assert.equal(iso, '1990-12-31');
    assert.equal(
      resolveOnboardingRoute({ birthDate: iso, phoneVerified: false }, asOf).kind,
      'needsPhoneVerification',
    );
  });

  it('invalid under-18 birth date is not accepted for persistence patch', () => {
    assert.throws(() =>
      buildBirthDatePersistencePatch({ day: 2, month: 9, year: 2008 }, asOf),
    );
  });

  it('exactly 18 by full birth date is valid', () => {
    const parts = { day: 1, month: 9, year: 2008 };
    assert.equal(meetsRegistrationAgeRange(parts, asOf), true);
    const patch = buildBirthDatePersistencePatch(parts, asOf);
    assert.equal(patch.birthDate, '2008-09-01');
    assert.equal(
      resolveOnboardingRoute({ ...patch, phoneVerified: false }, asOf).kind,
      'needsPhoneVerification',
    );
  });

  it('age 99 is valid', () => {
    const patch = buildBirthDatePersistencePatch(
      { day: 1, month: 9, year: 1927 },
      asOf,
    );
    assert.equal(
      resolveOnboardingRoute({ ...patch, phoneVerified: false }, asOf).kind,
      'needsPhoneVerification',
    );
  });

  it('age over 99 is rejected before persistence', () => {
    assert.throws(() =>
      buildBirthDatePersistencePatch({ day: 1, month: 9, year: 1926 }, asOf),
    );
  });

  it('Apple and LinkedIn share the same resolver after DOB save', () => {
    const saved = { birthDate: '1993-01-20', birthYear: 1993, phoneVerified: false };
    assert.equal(resolvePostAuthNavigationTarget(saved, asOf), 'PhoneVerification');
    assert.equal(resolvePostAuthNavigationTarget(saved, asOf), 'PhoneVerification');
  });

  it('social with DOB and phoneVerified true routes to ProfileCompletion', () => {
    assert.equal(
      resolvePostAuthNavigationTarget(
        { birthDate: '1990-01-01', phoneVerified: true },
        asOf,
      ),
      'ProfileCompletion',
    );
  });

  it('completed profile ignores later phone invalidation', () => {
    assert.equal(
      resolvePostAuthNavigationTarget(
        { profileSetupCompleted: true, phoneVerified: false, birthDate: '1990-01-01' },
        asOf,
      ),
      'MainTabs',
    );
  });
});

describe('onboarding birth date screen wiring', () => {
  it('persists via canonical patch then passes profileSnapshot to central navigation', () => {
    const dob = readSharedSource('screens/OnboardingBirthDateScreen.ios.tsx');
    assert.match(dob, /buildBirthDatePersistencePatch/);
    assert.match(dob, /profileSnapshot:/);
    assert.match(dob, /getUserProfile\(route\.params\.uid\)/);
    assert.match(dob, /submitting \|\| !ageOk/);
    assert.doesNotMatch(dob, /navigation\.replace\('PhoneVerification'/);
  });

  it('applyPostAuthNavigation merges persisted snapshot over remote read', () => {
    const nav = readSharedSource('phoneOtp/applyPostAuthNavigation.ts');
    assert.match(nav, /mergeOnboardingProfileSnapshots/);
    assert.match(nav, /profileSnapshot/);
    assert.match(nav, /resolvePostAuthNavigationTarget/);
  });

  it('AppNavigator no longer remounts onboarding stack on route changes', () => {
    const appNav = readSharedSource('navigation/AppNavigator.tsx');
    assert.match(appNav, /key=\{`auth-complete-\$\{uid\}`\}/);
    assert.doesNotMatch(appNav, /onboardingInitialRoute\}`\}/);
  });

  it('six-digit OTP component remains unchanged by DOB loop fix', () => {
    const otp = readSharedSource('components/phoneOtp/OtpSixDigitInput.tsx');
    assert.match(otp, /textContentType="oneTimeCode"/);
    assert.match(otp, /otpDigitCells/);
    const screen = readSharedSource('screens/PhoneVerificationScreen.ios.tsx');
    assert.match(screen, /OtpSixDigitInput/);
    assert.match(screen, /styles\.primaryActionSection/);
  });
});

describe('normalizeOnboardingProfileSnapshot', () => {
  it('rejects birthYear-only without canonical birthDate', () => {
    const snapshot = normalizeOnboardingProfileSnapshot({ birthYear: 1990 });
    assert.equal(snapshot.birthDate, undefined);
    assert.equal(resolveOnboardingRoute(snapshot).kind, 'needsDateOfBirth');
  });
});

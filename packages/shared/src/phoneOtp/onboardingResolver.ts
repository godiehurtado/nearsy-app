/**
 * Central onboarding route resolver for authenticated users.
 *
 * DOB social blocker: `needsDateOfBirth` is exposed for a future DOB screen.
 * Until that screen ships, navigation may still route social users without DOB
 * to ProfileCompletion — see `resolveAuthenticatedStackInitialRoute`.
 */

import { isProfileDocumentComplete } from '../utils/profileDocumentComplete';
import {
  ageFromBirthDate,
  birthPartsFromIso,
  isCompleteBirthDate,
  type BirthDateParts,
} from '../utils/birthDate';

export const ONBOARDING_MIN_AGE = 18;
export const ONBOARDING_MAX_AGE = 99;

export type OnboardingRouteKind =
  | 'complete'
  | 'needsDateOfBirth'
  | 'needsPhoneVerification'
  | 'needsProfileCompletion';

export type OnboardingRoute = {
  kind: OnboardingRouteKind;
};

export type OnboardingProfileSnapshot = {
  profileSetupCompleted?: boolean;
  birthDate?: string | null;
  birthYear?: number | null;
  phoneVerified?: boolean;
};

export function extractOnboardingBirthParts(
  profile: OnboardingProfileSnapshot | null | undefined,
): BirthDateParts | null {
  if (!profile || typeof profile.birthDate !== 'string' || !profile.birthDate.trim()) {
    return null;
  }
  return birthPartsFromIso(profile.birthDate.trim());
}

export function hasValidOnboardingBirthDate(
  profile: OnboardingProfileSnapshot | null | undefined,
  asOf: Date = new Date(),
): boolean {
  const parts = extractOnboardingBirthParts(profile);
  if (!parts || !isCompleteBirthDate(parts)) return false;
  const age = ageFromBirthDate(parts, asOf);
  return age !== null && age >= ONBOARDING_MIN_AGE && age <= ONBOARDING_MAX_AGE;
}

export function resolveOnboardingRoute(
  profile: unknown,
  asOf: Date = new Date(),
): OnboardingRoute {
  if (isProfileDocumentComplete(profile)) {
    return { kind: 'complete' };
  }

  const snapshot = (profile ?? {}) as OnboardingProfileSnapshot;

  if (!hasValidOnboardingBirthDate(snapshot, asOf)) {
    return { kind: 'needsDateOfBirth' };
  }

  if (snapshot.phoneVerified !== true) {
    return { kind: 'needsPhoneVerification' };
  }

  return { kind: 'needsProfileCompletion' };
}

/**
 * Stack initial route for incomplete onboarding.
 * Preserves legacy ProfileCompletion entry for missing DOB (social blocker).
 */
export type AuthenticatedOnboardingStackRoute =
  | 'PhoneVerification'
  | 'ProfileCompletion';

export function resolveAuthenticatedStackInitialRoute(
  profile: unknown,
  asOf: Date = new Date(),
): AuthenticatedOnboardingStackRoute {
  const route = resolveOnboardingRoute(profile, asOf);
  if (route.kind === 'needsPhoneVerification') {
    return 'PhoneVerification';
  }
  return 'ProfileCompletion';
}

/**
 * Post-auth navigation target for hooks / login.
 * `needsDateOfBirth` maps to ProfileCompletion until the DOB front ships.
 */
export type PostAuthNavigationTarget = 'MainTabs' | 'PhoneVerification' | 'ProfileCompletion';

export function resolvePostAuthNavigationTarget(
  profile: unknown,
  asOf: Date = new Date(),
): PostAuthNavigationTarget {
  const route = resolveOnboardingRoute(profile, asOf);
  switch (route.kind) {
    case 'complete':
      return 'MainTabs';
    case 'needsPhoneVerification':
      return 'PhoneVerification';
    case 'needsDateOfBirth':
    case 'needsProfileCompletion':
      return 'ProfileCompletion';
    default:
      return 'ProfileCompletion';
  }
}

/**
 * Integration seam — future DOB screen should call this after persisting birthDate.
 * Not implemented in this branch.
 */
export const ONBOARDING_DOB_INTEGRATION_SEAM =
  'packages/shared/src/phoneOtp/onboardingResolver.ts — consume needsDateOfBirth before OTP.';

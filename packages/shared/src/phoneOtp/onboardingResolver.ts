/**
 * Central onboarding route resolver for authenticated users.
 */

import { isProfileDocumentComplete } from '../utils/profileDocumentComplete.ts';
import {
  ageFromBirthDate,
  birthPartsFromIso,
  isCompleteBirthDate,
  type BirthDateParts,
} from '../utils/birthDate.ts';
import {
  normalizeBirthDateIsoValue,
  normalizeOnboardingProfileSnapshot,
} from './onboardingProfileSnapshot.ts';

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
  const iso = normalizeBirthDateIsoValue(profile?.birthDate);
  if (!iso) return null;
  return birthPartsFromIso(iso);
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

  const snapshot = normalizeOnboardingProfileSnapshot(profile);

  if (!hasValidOnboardingBirthDate(snapshot, asOf)) {
    return { kind: 'needsDateOfBirth' };
  }

  if (snapshot.phoneVerified !== true) {
    return { kind: 'needsPhoneVerification' };
  }

  return { kind: 'needsProfileCompletion' };
}

export type AuthenticatedOnboardingStackRoute =
  | 'OnboardingBirthDate'
  | 'PhoneVerification'
  | 'ProfileCompletion';

export function resolveAuthenticatedStackInitialRoute(
  profile: unknown,
  asOf: Date = new Date(),
): AuthenticatedOnboardingStackRoute {
  const route = resolveOnboardingRoute(profile, asOf);
  switch (route.kind) {
    case 'needsDateOfBirth':
      return 'OnboardingBirthDate';
    case 'needsPhoneVerification':
      return 'PhoneVerification';
    case 'needsProfileCompletion':
      return 'ProfileCompletion';
    default:
      return 'ProfileCompletion';
  }
}

export type PostAuthNavigationTarget =
  | 'MainTabs'
  | 'OnboardingBirthDate'
  | 'PhoneVerification'
  | 'ProfileCompletion';

export function resolvePostAuthNavigationTarget(
  profile: unknown,
  asOf: Date = new Date(),
): PostAuthNavigationTarget {
  const route = resolveOnboardingRoute(profile, asOf);
  switch (route.kind) {
    case 'complete':
      return 'MainTabs';
    case 'needsDateOfBirth':
      return 'OnboardingBirthDate';
    case 'needsPhoneVerification':
      return 'PhoneVerification';
    case 'needsProfileCompletion':
      return 'ProfileCompletion';
    default:
      return 'ProfileCompletion';
  }
}

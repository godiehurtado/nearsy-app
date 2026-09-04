import type { SocialProfileData } from '../domain/socialProfileData';
import { mapSocialProfileToNamePrefill } from './mapSocialNamePrefill';

export type SocialNamePrefillSource = {
  uid: string;
  socialProfile: SocialProfileData;
};

export type AppliedSocialNamePrefill = {
  uid: string;
  firstName: string;
  lastName: string;
};

export type ResolveCrjNamePrefillInput = {
  uid: string;
  firstName: string;
  lastName: string;
  firstNameEdited: boolean;
  lastNameEdited: boolean;
  pending: SocialNamePrefillSource | null;
  retainedApplied: AppliedSocialNamePrefill | null;
};

export type ResolveCrjNamePrefillResult = {
  nextFirstName: string;
  nextLastName: string;
  prefillAppliedToFirstName: boolean;
  prefillAppliedToLastName: boolean;
  /** True when pending matched uid and apply was settled (applied or already satisfied). */
  shouldConsumePending: boolean;
  /** Snapshot to retain for remount after pending clear. */
  retainedApplied: AppliedSocialNamePrefill | null;
  diag: {
    pendingPresentAtNameStep: boolean;
    mappedFirstNamePresent: boolean;
    mappedLastNamePresent: boolean;
    firstNameEmptyBeforeApply: boolean;
    lastNameEmptyBeforeApply: boolean;
    prefillAppliedToFirstName: boolean;
    prefillAppliedToLastName: boolean;
    pendingConsumedAfterApply: boolean;
  };
};

function trimOrEmpty(value: string): string {
  return value.trim();
}

/**
 * Pure CRJ Name-step prefill resolver.
 * Applies given/family (or displayName→Name only) onto empty, non-edited fields.
 */
export function resolveCrjNamePrefill(
  input: ResolveCrjNamePrefillInput,
): ResolveCrjNamePrefillResult {
  const firstNameEmptyBeforeApply = !trimOrEmpty(input.firstName);
  const lastNameEmptyBeforeApply = !trimOrEmpty(input.lastName);

  const pendingMatches =
    input.pending != null && input.pending.uid === input.uid;
  const retainedMatches =
    input.retainedApplied != null &&
    input.retainedApplied.uid === input.uid;

  let mappedFirst = '';
  let mappedLast = '';
  if (pendingMatches && input.pending) {
    const mapped = mapSocialProfileToNamePrefill(input.pending.socialProfile);
    mappedFirst = mapped.firstName;
    mappedLast = mapped.lastName;
  } else if (retainedMatches && input.retainedApplied) {
    mappedFirst = input.retainedApplied.firstName;
    mappedLast = input.retainedApplied.lastName;
  }

  const mappedFirstNamePresent = mappedFirst.trim().length > 0;
  const mappedLastNamePresent = mappedLast.trim().length > 0;
  const hasMappedSource = mappedFirstNamePresent || mappedLastNamePresent;

  let nextFirstName = input.firstName;
  let nextLastName = input.lastName;
  let prefillAppliedToFirstName = false;
  let prefillAppliedToLastName = false;

  if (hasMappedSource) {
    if (
      !input.firstNameEdited &&
      firstNameEmptyBeforeApply &&
      mappedFirstNamePresent
    ) {
      nextFirstName = mappedFirst.trim();
      prefillAppliedToFirstName = true;
    }
    if (
      !input.lastNameEdited &&
      lastNameEmptyBeforeApply &&
      mappedLastNamePresent
    ) {
      nextLastName = mappedLast.trim();
      prefillAppliedToLastName = true;
    }
  }

  const fieldsSatisfiedForMapped =
    (!mappedFirstNamePresent || trimOrEmpty(nextFirstName).length > 0) &&
    (!mappedLastNamePresent || trimOrEmpty(nextLastName).length > 0);

  const shouldConsumePending =
    pendingMatches &&
    hasMappedSource &&
    (prefillAppliedToFirstName ||
      prefillAppliedToLastName ||
      fieldsSatisfiedForMapped);

  const retainedApplied: AppliedSocialNamePrefill | null = hasMappedSource
    ? {
        uid: input.uid,
        firstName: mappedFirst.trim(),
        lastName: mappedLast.trim(),
      }
    : retainedMatches
      ? input.retainedApplied
      : null;

  return {
    nextFirstName,
    nextLastName,
    prefillAppliedToFirstName,
    prefillAppliedToLastName,
    shouldConsumePending,
    retainedApplied,
    diag: {
      pendingPresentAtNameStep: pendingMatches,
      mappedFirstNamePresent,
      mappedLastNamePresent,
      firstNameEmptyBeforeApply,
      lastNameEmptyBeforeApply,
      prefillAppliedToFirstName,
      prefillAppliedToLastName,
      pendingConsumedAfterApply: shouldConsumePending,
    },
  };
}

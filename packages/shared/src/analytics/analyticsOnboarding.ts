/**
 * `onboarding_step_completed`: six product milestones over the CRJ steps.
 *
 * | # | Milestone    | CRJ steps                | Completed when                     |
 * |---|--------------|--------------------------|------------------------------------|
 * | 1 | profile_type | type                     | mode saved                         |
 * | 2 | basics       | identity, photo          | photo saved                        |
 * | 3 | about        | details                  | details saved                      |
 * | 4 | affiliations | affiliation:*            | last category saved                |
 * | 5 | interests    | interestsIntro, interest | last category saved                |
 * | 6 | socials      | socialMedia              | socials saved                      |
 *
 * The events come from the save handlers, never from `androidCrjResume`: that
 * cursor is written after the save and cannot acknowledge a sent event.
 */
import type { AnalyticsProperties } from './analyticsContract.ts';
import { splitAffiliations, splitInterests } from './analyticsProfileLists.ts';

export const ONBOARDING_STEP_NUMBERS = {
  profile_type: 1,
  basics: 2,
  about: 3,
  affiliations: 4,
  interests: 5,
  socials: 6,
} as const;

export type OnboardingStepName = keyof typeof ONBOARDING_STEP_NUMBERS;

/** Highest milestone already behind a CRJ step, for a resumed session. */
const COMPLETED_BEFORE_STEP: Record<string, number> = {
  type: 0,
  identity: 1,
  photo: 1,
  details: 2,
  affiliation: 3,
  interestsIntro: 4,
  interest: 4,
  interestsCelebration: 5,
  socialMedia: 5,
};

/**
 * One emission per milestone and account in this process. Back and forward
 * does not repeat it, and resuming does not invent the milestones behind the
 * cursor: they are only marked as done, so they cannot fire again either.
 */
export function createOnboardingMilestoneTracker() {
  const done = new Map<string, number[]>();
  const doneFor = (uid: string) => {
    const list = done.get(uid) ?? [];
    done.set(uid, list);
    return list;
  };
  return {
    noteResumeAt(uid: string, stepKind: string): void {
      const list = doneFor(uid);
      const completed = COMPLETED_BEFORE_STEP[stepKind] ?? 6;
      for (let number = 1; number <= completed; number += 1) {
        if (!list.includes(number)) list.push(number);
      }
    },
    claim(uid: string, step: OnboardingStepName): boolean {
      const list = doneFor(uid);
      const number = ONBOARDING_STEP_NUMBERS[step];
      if (list.includes(number)) return false;
      list.push(number);
      return true;
    },
  };
}

export type OnboardingStepInput =
  | { step: 'profile_type'; profileType: string }
  | { step: 'basics' }
  | { step: 'about' }
  | { step: 'affiliations'; selected: readonly unknown[] }
  | { step: 'interests'; selected: readonly unknown[] }
  | { step: 'socials'; manualValues: readonly unknown[] };

function base(step: OnboardingStepName, skipped: boolean): AnalyticsProperties {
  return {
    step,
    step_number: ONBOARDING_STEP_NUMBERS[step],
    skipped,
  };
}

/**
 * `skipped` means the milestone ended without content. Partial content is
 * `false`, with its amounts. `verifiedCount` is undefined while unknown.
 */
export function buildOnboardingStepProperties(
  input: OnboardingStepInput,
  verifiedCount?: number,
): AnalyticsProperties {
  switch (input.step) {
    case 'profile_type':
      return { ...base('profile_type', false), profile_type: input.profileType };
    case 'basics':
    case 'about':
      return base(input.step, false);
    case 'affiliations':
    case 'interests': {
      const split =
        input.step === 'interests'
          ? splitInterests(input.selected)
          : splitAffiliations(input.selected);
      const total = split.catalog.length + split.custom.length;
      return {
        ...base(input.step, total === 0),
        item_count: total,
        catalog_count: split.catalog.length,
        custom_count: split.custom.length,
      };
    }
    case 'socials': {
      const manual = input.manualValues.filter(
        (value) => typeof value === 'string' && value.trim().length > 0,
      ).length;
      const total = manual + (verifiedCount ?? 0);
      return {
        ...base('socials', total === 0),
        item_count: total,
        manual_count: manual,
        ...(verifiedCount === undefined ? {} : { verified_count: verifiedCount }),
      };
    }
  }
}

import {
  listOnboardingAffiliationCategoryIds,
  type OnboardingAffiliationCategoryId,
} from '../../affiliations/onboardingAffiliationCatalog.ts';
import {
  listOnboardingCategoryIds,
  type OnboardingInterestCategoryId,
} from '../../interests/onboardingInterestCatalog.ts';
import { POST_GALLERY_CRJ_STEP } from '../../gallery/onboardingGalleryPersistence.ts';
import { POST_SOCIAL_MEDIA_CRJ_STEP } from '../../social/onboardingSocialPersistence.ts';

export const CRJ_PRE_CATALOG_STEPS = [
  'type',
  'identity',
  'photo',
  'details',
] as const;

export const CRJ_POST_SOCIAL_STEPS = [
  POST_SOCIAL_MEDIA_CRJ_STEP,
  POST_GALLERY_CRJ_STEP,
  'notifications',
  'success',
] as const;

export type CrjFixedPreStep = (typeof CRJ_PRE_CATALOG_STEPS)[number];
export type CrjPostSocialStep = (typeof CRJ_POST_SOCIAL_STEPS)[number];

export type CrjResolvedStep =
  | { kind: CrjFixedPreStep }
  | { kind: 'interestsIntro' }
  | {
      kind: 'interest';
      interestCategoryIndex: number;
      categoryId: OnboardingInterestCategoryId;
    }
  | { kind: 'interestsCelebration' }
  | {
      kind: 'affiliation';
      affiliationCategoryIndex: number;
      categoryId: OnboardingAffiliationCategoryId;
    }
  | { kind: 'socialMedia' }
  | { kind: CrjPostSocialStep };

export function listCrjInterestCategoryIds(): OnboardingInterestCategoryId[] {
  return listOnboardingCategoryIds();
}

export function listCrjAffiliationCategoryIds(): OnboardingAffiliationCategoryId[] {
  return listOnboardingAffiliationCategoryIds();
}

function takeInterestBlock(
  offset: number,
  interestIds: readonly OnboardingInterestCategoryId[],
): { step: CrjResolvedStep; consumed: true } | { consumed: false; offset: number } {
  if (offset === 0) return { consumed: true, step: { kind: 'interestsIntro' } };
  let next = offset - 1;
  if (next < interestIds.length) {
    const categoryId = interestIds[next]!;
    return {
      consumed: true,
      step: {
        kind: 'interest',
        interestCategoryIndex: next,
        categoryId,
      },
    };
  }
  next -= interestIds.length;
  if (next === 0) {
    return { consumed: true, step: { kind: 'interestsCelebration' } };
  }
  return { consumed: false, offset: next - 1 };
}

function takeAffiliationBlock(
  offset: number,
  affiliationIds: readonly OnboardingAffiliationCategoryId[],
): { step: CrjResolvedStep; consumed: true } | { consumed: false; offset: number } {
  if (offset < affiliationIds.length) {
    const categoryId = affiliationIds[offset]!;
    return {
      consumed: true,
      step: {
        kind: 'affiliation',
        affiliationCategoryIndex: offset,
        categoryId,
      },
    };
  }
  return { consumed: false, offset: offset - affiliationIds.length };
}

function takeTail(offset: number): CrjResolvedStep {
  if (offset === 0) return { kind: 'socialMedia' };
  return { kind: CRJ_POST_SOCIAL_STEPS[offset - 1]! };
}

export function crjStepsEqual(a: CrjResolvedStep, b: CrjResolvedStep): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'affiliation' && b.kind === 'affiliation') {
    return a.categoryId === b.categoryId;
  }
  if (a.kind === 'interest' && b.kind === 'interest') {
    return a.categoryId === b.categoryId;
  }
  return true;
}

/** Named step → session index for the given walk. Unknown target → 0. */
export function crjStepIndexFromFlag(
  target: CrjResolvedStep,
  affiliationsBeforeInterests: boolean,
): number {
  for (let i = 0; i < 80; i += 1) {
    const step = resolveCrjStepFromFlag(i, affiliationsBeforeInterests);
    if (crjStepsEqual(step, target)) return i;
    if (step.kind === 'success') break;
  }
  return 0;
}

/**
 * CRJ wizard walk. Android persists a named resume cursor separately;
 * this function only maps an index to a step.
 */
export function resolveCrjStepFromFlag(
  stepIndex: number,
  affiliationsBeforeInterests: boolean,
): CrjResolvedStep {
  const interestIds = listCrjInterestCategoryIds();
  const affiliationIds = listCrjAffiliationCategoryIds();

  if (stepIndex < CRJ_PRE_CATALOG_STEPS.length) {
    return { kind: CRJ_PRE_CATALOG_STEPS[stepIndex]! };
  }

  let offset = stepIndex - CRJ_PRE_CATALOG_STEPS.length;

  if (affiliationsBeforeInterests) {
    const affiliations = takeAffiliationBlock(offset, affiliationIds);
    if (affiliations.consumed === true) return affiliations.step;
    offset = affiliations.offset;
    const interests = takeInterestBlock(offset, interestIds);
    if (interests.consumed === true) return interests.step;
    return takeTail(interests.offset);
  }

  const interests = takeInterestBlock(offset, interestIds);
  if (interests.consumed === true) return interests.step;
  offset = interests.offset;
  const affiliations = takeAffiliationBlock(offset, affiliationIds);
  if (affiliations.consumed === true) return affiliations.step;
  return takeTail(affiliations.offset);
}

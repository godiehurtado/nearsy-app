/**
 * CRJ wizard step map for Nearsy 2.0.9.
 *
 * Order: Type → Identity → Photo → Details → Affiliations (one screen per
 * category) → Interests intro → Interests (one screen per category) →
 * Interests celebration → Social → Gallery → Location → Notifications →
 * Success.
 *
 * stepIndex is in-memory only. Incomplete registrations resume by hydrating
 * persisted bags (affiliations, interests, social) and re-walking from step 0
 * with fields filled — never by remapping a stored numeric index, which would
 * land mid-flow users on the wrong screen after this reorder.
 */
import {
  listOnboardingAffiliationCategoryIds,
  type OnboardingAffiliationCategoryId,
} from '../affiliations/onboardingAffiliationCatalog';
import {
  listOnboardingCategoryIds,
  type OnboardingInterestCategoryId,
} from '../interests/onboardingInterestCatalog';
import { POST_GALLERY_CRJ_STEP } from '../gallery/onboardingGalleryPersistence';
import { POST_SOCIAL_MEDIA_CRJ_STEP } from '../social/onboardingSocialPersistence';
import { POST_AFFILIATIONS_CRJ_STEP as PERSISTED_POST_AFFILIATIONS_CRJ_STEP } from '../affiliations/onboardingAffiliationPersistence';

export const PRE_AFFILIATION_STEPS = [
  'type',
  'identity',
  'photo',
  'details',
] as const;

export const CRJ_AFFILIATION_CATEGORY_IDS = listOnboardingAffiliationCategoryIds();
export const CRJ_INTEREST_CATEGORY_IDS = listOnboardingCategoryIds();

export const POST_SOCIAL_STEPS = [
  POST_SOCIAL_MEDIA_CRJ_STEP,
  POST_GALLERY_CRJ_STEP,
  'notifications',
  'success',
] as const;

export type FixedPreAffiliationStep = (typeof PRE_AFFILIATION_STEPS)[number];
export type PostSocialStep = (typeof POST_SOCIAL_STEPS)[number];

export type ResolvedCrjStep =
  | { kind: FixedPreAffiliationStep }
  | {
      kind: 'affiliation';
      affiliationCategoryIndex: number;
      categoryId: OnboardingAffiliationCategoryId;
    }
  | { kind: 'interestsIntro' }
  | {
      kind: 'interest';
      interestCategoryIndex: number;
      categoryId: OnboardingInterestCategoryId;
    }
  | { kind: 'interestsCelebration' }
  | { kind: 'socialMedia' }
  | { kind: PostSocialStep };

/** After the last affiliation category — Interests intro, not Social. */
export const POST_AFFILIATIONS_CRJ_STEP = PERSISTED_POST_AFFILIATIONS_CRJ_STEP;

export function crjStepCount(): number {
  return (
    PRE_AFFILIATION_STEPS.length +
    CRJ_AFFILIATION_CATEGORY_IDS.length +
    1 +
    CRJ_INTEREST_CATEGORY_IDS.length +
    1 +
    1 +
    POST_SOCIAL_STEPS.length
  );
}

export function resolveCrjStep(stepIndex: number): ResolvedCrjStep {
  const safeIndex = Math.max(0, stepIndex);
  if (safeIndex < PRE_AFFILIATION_STEPS.length) {
    return { kind: PRE_AFFILIATION_STEPS[safeIndex]! };
  }
  let offset = safeIndex - PRE_AFFILIATION_STEPS.length;
  if (offset < CRJ_AFFILIATION_CATEGORY_IDS.length) {
    const categoryId = CRJ_AFFILIATION_CATEGORY_IDS[offset]!;
    return {
      kind: 'affiliation',
      affiliationCategoryIndex: offset,
      categoryId,
    };
  }
  offset -= CRJ_AFFILIATION_CATEGORY_IDS.length;
  if (offset === 0) return { kind: POST_AFFILIATIONS_CRJ_STEP };
  offset -= 1;
  if (offset < CRJ_INTEREST_CATEGORY_IDS.length) {
    const categoryId = CRJ_INTEREST_CATEGORY_IDS[offset]!;
    return {
      kind: 'interest',
      interestCategoryIndex: offset,
      categoryId,
    };
  }
  offset -= CRJ_INTEREST_CATEGORY_IDS.length;
  if (offset === 0) return { kind: 'interestsCelebration' };
  offset -= 1;
  if (offset === 0) return { kind: 'socialMedia' };
  offset -= 1;
  const post = POST_SOCIAL_STEPS[offset] ?? POST_SOCIAL_STEPS[POST_SOCIAL_STEPS.length - 1]!;
  return { kind: post };
}

export function isLastAffiliationCategory(step: ResolvedCrjStep): boolean {
  return (
    step.kind === 'affiliation' &&
    step.affiliationCategoryIndex >= CRJ_AFFILIATION_CATEGORY_IDS.length - 1
  );
}

export function isFirstAffiliationCategory(step: ResolvedCrjStep): boolean {
  return step.kind === 'affiliation' && step.affiliationCategoryIndex === 0;
}

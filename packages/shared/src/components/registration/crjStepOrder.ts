import { resolveCrjStepFromFlag } from './crjStepOrderCore.ts';

export const CRJ_AFFILIATIONS_BEFORE_INTERESTS = false;

export {
  CRJ_POST_SOCIAL_STEPS,
  CRJ_PRE_CATALOG_STEPS,
  listCrjAffiliationCategoryIds,
  listCrjInterestCategoryIds,
  type CrjFixedPreStep,
  type CrjPostSocialStep,
  type CrjResolvedStep,
} from './crjStepOrderCore.ts';

export function resolveCrjStep(stepIndex: number) {
  return resolveCrjStepFromFlag(stepIndex, CRJ_AFFILIATIONS_BEFORE_INTERESTS);
}

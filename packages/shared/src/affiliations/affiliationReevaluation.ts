/**
 * After a successful affiliation save, ask Functions to reevaluate proximity
 * notices, only when the saved selection really changed. Reuses the debounced
 * scheduler shared with interests and blocks, so repeated saves collapse into
 * one call. A scheduling failure never turns the save into a failure.
 */

import type { OnboardingSelectedAffiliation } from './onboardingAffiliationCatalog';
import { areOnboardingAffiliationSelectionsEqual } from './postCrjAffiliationEditor';
import { scheduleReevaluateProximityNotices } from '../alerts/reevaluateProximityNotices';

export function reevaluateAfterAffiliationSave(
  before: OnboardingSelectedAffiliation[],
  after: OnboardingSelectedAffiliation[],
  schedule: () => void = scheduleReevaluateProximityNotices,
): boolean {
  if (areOnboardingAffiliationSelectionsEqual(before, after)) return false;
  try {
    schedule();
  } catch {
    // The profile is already saved; a later reevaluation can still catch up.
  }
  return true;
}

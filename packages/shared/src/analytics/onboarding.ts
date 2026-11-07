/** Pure onboarding milestone payloads. See docs/ios-posthog-analytics.md. */
import { ONBOARDING_STEPS, type OnboardingStep } from './contract';
import { toIsoCreationTime } from './client';

export type OnboardingStepCounts = {
  itemCount: number;
  catalogCount?: number;
  customCount?: number;
  manualCount?: number;
  verifiedCount?: number;
};

/** profile_type, basics and about have required fields: they cannot be empty. */
export function buildOnboardingStepProperties(
  step: OnboardingStep,
  counts?: OnboardingStepCounts,
): Record<string, unknown> {
  return {
    step,
    step_number: ONBOARDING_STEPS[step],
    // Finished with no content. Partial content is false. Never the button text.
    skipped: counts ? counts.itemCount === 0 : false,
    ...(counts
      ? {
          item_count: counts.itemCount,
          catalog_count: counts.catalogCount,
          custom_count: counts.customCount,
          manual_count: counts.manualCount,
          verified_count: counts.verifiedCount,
        }
      : {}),
  };
}

/**
 * Minutes since the Firebase account was created, pauses included. Omitted when
 * the date is missing, invalid or in the future.
 */
export function computeCompletionTimeMin(
  creationTime: string | null | undefined,
  nowMs: number,
): number | undefined {
  const created = toIsoCreationTime(creationTime);
  if (!created) return undefined;
  const elapsedMs = nowMs - Date.parse(created);
  if (elapsedMs < 0) return undefined;
  return Math.round((elapsedMs / 60000) * 10) / 10;
}

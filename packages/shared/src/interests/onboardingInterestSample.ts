import type { InterestLabel, LogoPick } from '../types/profile';
import { getInterestLogoCatalog } from '../components/InterestsWithLogo';

export type OnboardingInterestItem = LogoPick & {
  category: InterestLabel;
};

/** Stable category order for onboarding (not random). */
export const ONBOARDING_CATEGORY_ORDER: InterestLabel[] = [
  'Sports',
  'Music',
  'Healthy Lifestyle',
  'Extra-Curricular Activities',
  'Language',
  'Other',
];

const SAMPLE_PER_CATEGORY = 4;

/**
 * Deterministic sample: first N active interests from each category that has items.
 * Uses real catalog IDs — never invents interests.
 */
export function buildOnboardingInterestSample(
  perCategory: number = SAMPLE_PER_CATEGORY,
): OnboardingInterestItem[] {
  const catalog = getInterestLogoCatalog();
  const out: OnboardingInterestItem[] = [];

  for (const category of ONBOARDING_CATEGORY_ORDER) {
    const options = catalog[category] ?? [];
    if (options.length === 0) continue;
    for (const opt of options.slice(0, perCategory)) {
      out.push({
        id: opt.id,
        name: opt.name,
        emoji: opt.emoji,
        category,
      });
    }
  }

  return out;
}

/** Build InterestAffiliations map from selected onboarding items. */
export function affiliationsFromSelectedItems(
  items: OnboardingInterestItem[],
  selectedIds: Set<string> | string[],
): Partial<Record<InterestLabel, LogoPick[]>> {
  const selected =
    selectedIds instanceof Set ? selectedIds : new Set(selectedIds);
  const map: Partial<Record<InterestLabel, LogoPick[]>> = {};

  for (const item of items) {
    if (!selected.has(item.id)) continue;
    const list = map[item.category] ?? [];
    list.push({ id: item.id, name: item.name, emoji: item.emoji });
    map[item.category] = list;
  }

  return map;
}

export function labelsFromAffiliations(
  aff: Partial<Record<InterestLabel, LogoPick[]>>,
): InterestLabel[] {
  return (Object.keys(aff) as InterestLabel[]).filter(
    (k) => (aff[k]?.length ?? 0) > 0,
  );
}

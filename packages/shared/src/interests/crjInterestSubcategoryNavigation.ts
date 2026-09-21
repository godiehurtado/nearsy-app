/**
 * BUG-CRJ-01 — CRJ hierarchical interest subcategory navigation.
 *
 * Category overview (no active group) → enter subcategory → select/deselect →
 * back to overview → advance. Selections persist across group and category moves.
 *
 * Post-CRJ InterestsScreen keeps auto-selecting the first group; this module is
 * for ProfileCompletion CRJ only.
 */
import type {
  OnboardingInterestCategory,
  OnboardingInterestCategoryId,
  OnboardingSelectedInterest,
} from './onboardingInterestCatalog';
import {
  isHierarchicalInterestCategory,
  resolveActiveGroupId,
} from './interestHierarchy';

export type CrjActiveGroupMap = Partial<
  Record<OnboardingInterestCategoryId, string>
>;

/** null = category overview (subcategory list); string = browsed group. */
export function readCrjActiveSubcategory(
  map: CrjActiveGroupMap,
  categoryId: OnboardingInterestCategoryId,
): string | null {
  const stored = map[categoryId];
  return typeof stored === 'string' && stored.length > 0 ? stored : null;
}

export function enterCrjInterestSubcategory(
  map: CrjActiveGroupMap,
  category: OnboardingInterestCategory,
  groupId: string,
): CrjActiveGroupMap {
  if (!isHierarchicalInterestCategory(category)) {
    return map;
  }
  const resolved = resolveActiveGroupId(category, groupId);
  return { ...map, [category.id]: resolved };
}

/** Leave the open subcategory and return to the category overview. */
export function leaveCrjInterestSubcategory(
  map: CrjActiveGroupMap,
  categoryId: OnboardingInterestCategoryId,
): CrjActiveGroupMap {
  if (!(categoryId in map)) return map;
  const next = { ...map };
  delete next[categoryId];
  return next;
}

/**
 * CRJ header Back while on an interest step:
 * - hierarchical + open subcategory → close subcategory (stay on category)
 * - otherwise → previous wizard step
 */
export function resolveCrjInterestBackAction(input: {
  category: OnboardingInterestCategory;
  activeGroupMap: CrjActiveGroupMap;
}): 'leave_subcategory' | 'previous_step' {
  if (!isHierarchicalInterestCategory(input.category)) {
    return 'previous_step';
  }
  const open = readCrjActiveSubcategory(
    input.activeGroupMap,
    input.category.id,
  );
  return open ? 'leave_subcategory' : 'previous_step';
}

export function toggleCrjInterestSelection(
  selected: OnboardingSelectedInterest[],
  item: OnboardingSelectedInterest,
): OnboardingSelectedInterest[] {
  const exists = selected.some((s) => s.id === item.id);
  if (exists) return selected.filter((s) => s.id !== item.id);
  return [...selected, item];
}

export function selectionsInCategory(
  selected: OnboardingSelectedInterest[],
  categoryId: OnboardingInterestCategoryId,
): OnboardingSelectedInterest[] {
  return selected.filter((s) => s.categoryId === categoryId);
}

/**
 * BUG-CRJ-01 — CRJ hierarchical interest subcategory navigation.
 *
 * Next walks overview → each catalog group in order → next category.
 * Back reverses that path. Chip selection never advances navigation.
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
  getHierarchicalGroups,
  isHierarchicalInterestCategory,
  resolveActiveGroupId,
} from './interestHierarchy';

export type CrjActiveGroupMap = Partial<
  Record<OnboardingInterestCategoryId, string>
>;

export type CrjInterestNextAction =
  | { kind: 'enter_subcategory'; groupId: string }
  | { kind: 'leave_category' };

export type CrjInterestBackAction =
  | { kind: 'show_overview' }
  | { kind: 'enter_subcategory'; groupId: string }
  | { kind: 'previous_step' };

/** Catalog order of subcategory ids (empty for flat categories). */
export function listCrjSubcategoryIds(
  category: OnboardingInterestCategory,
): string[] {
  if (!isHierarchicalInterestCategory(category)) return [];
  return getHierarchicalGroups(category).map((group) => group.id);
}

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
 * Next within an interest category:
 * overview → first group → … → last group → leave category.
 * Flat categories always leave.
 */
export function resolveCrjInterestNextAction(input: {
  category: OnboardingInterestCategory;
  activeGroupMap: CrjActiveGroupMap;
}): CrjInterestNextAction {
  const groupIds = listCrjSubcategoryIds(input.category);
  if (groupIds.length === 0) {
    return { kind: 'leave_category' };
  }

  const open = readCrjActiveSubcategory(
    input.activeGroupMap,
    input.category.id,
  );
  if (open == null) {
    return { kind: 'enter_subcategory', groupId: groupIds[0]! };
  }

  const index = groupIds.indexOf(open);
  if (index < 0) {
    return { kind: 'enter_subcategory', groupId: groupIds[0]! };
  }
  if (index >= groupIds.length - 1) {
    return { kind: 'leave_category' };
  }
  return { kind: 'enter_subcategory', groupId: groupIds[index + 1]! };
}

/**
 * Back reverses Next:
 * group[i] → group[i-1] → overview → previous wizard step.
 */
export function resolveCrjInterestBackAction(input: {
  category: OnboardingInterestCategory;
  activeGroupMap: CrjActiveGroupMap;
}): CrjInterestBackAction {
  const groupIds = listCrjSubcategoryIds(input.category);
  if (groupIds.length === 0) {
    return { kind: 'previous_step' };
  }

  const open = readCrjActiveSubcategory(
    input.activeGroupMap,
    input.category.id,
  );
  if (open == null) {
    return { kind: 'previous_step' };
  }

  const index = groupIds.indexOf(open);
  if (index <= 0) {
    return { kind: 'show_overview' };
  }
  return { kind: 'enter_subcategory', groupId: groupIds[index - 1]! };
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

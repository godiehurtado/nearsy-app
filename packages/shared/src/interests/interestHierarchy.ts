import type {
  OnboardingInterestCategory,
  OnboardingInterestCategoryId,
  OnboardingInterestGroup,
} from './onboardingInterestCatalog.ts';

export function isHierarchicalInterestCategory(
  category: OnboardingInterestCategory,
): boolean {
  return Array.isArray(category.groups) && category.groups.length > 0;
}

/** Returns the stored group when valid, otherwise the first group id. */
export function resolveActiveGroupId(
  category: OnboardingInterestCategory,
  storedGroupId?: string | null,
): string {
  const groups = category.groups;
  if (!groups?.length) {
    throw new Error(
      `resolveActiveGroupId called for non-hierarchical category: ${category.id}`,
    );
  }
  if (
    storedGroupId &&
    groups.some((group) => group.id === storedGroupId)
  ) {
    return storedGroupId;
  }
  return groups[0]!.id;
}

export function getHierarchicalGroups(
  category: OnboardingInterestCategory,
): OnboardingInterestGroup[] {
  if (!isHierarchicalInterestCategory(category)) {
    return [];
  }
  return category.groups!;
}

/** Dev/test guard — hierarchical categories must ship non-empty groups. */
export function assertHierarchicalCategoryGroups(
  category: OnboardingInterestCategory,
): void {
  if (!isHierarchicalInterestCategory(category)) {
    return;
  }
  for (const group of category.groups!) {
    if (!group.items?.length) {
      throw new Error(
        `Hierarchical group has no items: ${category.id}/${group.id}`,
      );
    }
  }
}

export function assertKnownHierarchicalCategories(
  categories: OnboardingInterestCategory[],
): void {
  const hierarchicalIds: OnboardingInterestCategoryId[] = [
    'music',
    'food',
    'sports_outdoors',
  ];
  for (const id of hierarchicalIds) {
    const category = categories.find((entry) => entry.id === id);
    if (!category) {
      throw new Error(`Missing hierarchical category: ${id}`);
    }
    assertHierarchicalCategoryGroups(category);
    const groups = getHierarchicalGroups(category);
    if (id === 'music' && groups.length !== 6) {
      throw new Error(`Music expected 6 groups, got ${groups.length}`);
    }
    if (id === 'food' && groups.length !== 4) {
      throw new Error(`Food expected 4 groups, got ${groups.length}`);
    }
    if (id === 'sports_outdoors' && groups.length !== 2) {
      throw new Error(
        `Sports/Outdoors expected 2 groups, got ${groups.length}`,
      );
    }
    for (const group of groups) {
      if (!group.items.some((item) => !item.isOther)) {
        throw new Error(
          `Hierarchical group has no selectable items: ${id}/${group.id}`,
        );
      }
    }
  }
}

/**
 * Per-category active group map — Music/Food/Sports do not share selection.
 * Pure helper for tests and ProfileCompletionScreen state updates.
 */
export function setActiveGroupForCategory(
  map: Partial<Record<OnboardingInterestCategoryId, string>>,
  categoryId: OnboardingInterestCategoryId,
  groupId: string,
): Partial<Record<OnboardingInterestCategoryId, string>> {
  return { ...map, [categoryId]: groupId };
}

export function readActiveGroupForCategory(
  map: Partial<Record<OnboardingInterestCategoryId, string>>,
  category: OnboardingInterestCategory,
): string {
  return resolveActiveGroupId(category, map[category.id]);
}

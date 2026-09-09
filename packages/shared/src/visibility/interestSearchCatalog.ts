/**
 * CRJ official interest catalog — search helpers for Visibility discovery filters.
 * Reuses onboardingInterestCatalog IDs, categories, groups, and i18n keys.
 */

import {
  ONBOARDING_INTEREST_CATEGORIES,
  type OnboardingInterestCategoryId,
} from '../interests/onboardingInterestCatalog';

export function normalizeSearchQuery(query: string): string {
  return query
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export type InterestCatalogLabels = {
  category: (nameKey: string, fallback: string) => string;
  group: (nameKey: string, fallback: string) => string;
  item: (nameKey: string, fallback: string) => string;
};

export type InterestSearchEntry = {
  id: string;
  categoryId: OnboardingInterestCategoryId;
  categoryLabel: string;
  groupId?: string;
  groupLabel?: string;
  itemLabel: string;
  icon: string;
  iconColor: string;
  haystack: string;
};

export function buildInterestSearchEntries(
  officialIds: ReadonlySet<string>,
  labels: InterestCatalogLabels,
): InterestSearchEntry[] {
  const out: InterestSearchEntry[] = [];

  for (const cat of ONBOARDING_INTEREST_CATEGORIES) {
    const categoryLabel = labels.category(cat.nameKey, cat.name);

    if (cat.items) {
      for (const item of cat.items) {
        if (item.isOther || !officialIds.has(item.id)) continue;
        const itemLabel = labels.item(item.nameKey, item.name);
        const haystack = normalizeSearchQuery(
          [itemLabel, categoryLabel, item.name].join(' '),
        );
        out.push({
          id: item.id,
          categoryId: cat.id,
          categoryLabel,
          itemLabel,
          icon: item.icon,
          iconColor: item.iconColor,
          haystack,
        });
      }
    }

    if (cat.groups) {
      for (const group of cat.groups) {
        const groupLabel = labels.group(group.nameKey, group.name);
        for (const item of group.items) {
          if (item.isOther || !officialIds.has(item.id)) continue;
          const itemLabel = labels.item(item.nameKey, item.name);
          const haystack = normalizeSearchQuery(
            [itemLabel, categoryLabel, groupLabel, item.name, group.name].join(
              ' ',
            ),
          );
          out.push({
            id: item.id,
            categoryId: cat.id,
            categoryLabel,
            groupId: group.id,
            groupLabel,
            itemLabel,
            icon: item.icon,
            iconColor: item.iconColor,
            haystack,
          });
        }
      }
    }
  }

  return out;
}

export type GroupedInterestSearchResults = {
  categoryId: OnboardingInterestCategoryId;
  categoryLabel: string;
  items: InterestSearchEntry[];
};

export function searchInterestEntries(
  entries: InterestSearchEntry[],
  query: string,
  selectedIds: ReadonlySet<string>,
  maxPerCategory = 50,
): GroupedInterestSearchResults[] {
  const q = normalizeSearchQuery(query);
  if (!q) return [];

  const byCategory = new Map<
    OnboardingInterestCategoryId,
    GroupedInterestSearchResults
  >();

  for (const entry of entries) {
    if (selectedIds.has(entry.id)) continue;
    if (!entry.haystack.includes(q)) continue;

    let group = byCategory.get(entry.categoryId);
    if (!group) {
      group = {
        categoryId: entry.categoryId,
        categoryLabel: entry.categoryLabel,
        items: [],
      };
      byCategory.set(entry.categoryId, group);
    }
    if (group.items.length < maxPerCategory) {
      group.items.push(entry);
    }
  }

  return ONBOARDING_INTEREST_CATEGORIES.map((cat) => byCategory.get(cat.id))
    .filter(
      (group): group is GroupedInterestSearchResults =>
        !!group && group.items.length > 0,
    );
}

export function findInterestEntryById(
  entries: InterestSearchEntry[],
  id: string,
): InterestSearchEntry | undefined {
  return entries.find((entry) => entry.id === id);
}

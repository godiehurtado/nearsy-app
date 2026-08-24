/**
 * Resolve CRJ interest IDs to localized labels + icons for discovery UI.
 */

import {
  flattenCatalogInterestItems,
  type OnboardingInterestItem,
} from '../interests/onboardingInterestCatalog';
import { normalizeSearchQuery } from './interestSearchCatalog';

export type ResolvedInterestChip = {
  id: string;
  label: string;
  icon: string;
  iconColor: string;
};

const catalogById = (): Map<string, OnboardingInterestItem> => {
  const map = new Map<string, OnboardingInterestItem>();
  for (const item of flattenCatalogInterestItems()) {
    map.set(item.id, item);
  }
  return map;
};

let cachedCatalog: Map<string, OnboardingInterestItem> | null = null;

function catalogMap(): Map<string, OnboardingInterestItem> {
  if (!cachedCatalog) cachedCatalog = catalogById();
  return cachedCatalog;
}

export function resolveInterestChip(
  id: string,
  translateItem: (nameKey: string, fallback: string) => string,
): ResolvedInterestChip | null {
  const item = catalogMap().get(id);
  if (!item) return null;
  return {
    id,
    label: translateItem(item.nameKey, item.name),
    icon: item.icon,
    iconColor: item.iconColor,
  };
}

export function resolveInterestChips(
  ids: readonly string[],
  translateItem: (nameKey: string, fallback: string) => string,
  limit = 3,
): ResolvedInterestChip[] {
  const out: ResolvedInterestChip[] = [];
  for (const id of ids) {
    if (out.length >= limit) break;
    const chip = resolveInterestChip(id, translateItem);
    if (chip) out.push(chip);
  }
  return out;
}

/** Count shared interest IDs between viewer filter and candidate profile. */
export function countSharedInterestIds(
  viewerIds: readonly string[],
  candidateIds: readonly string[],
): number {
  if (viewerIds.length === 0) return 0;
  const set = new Set(viewerIds);
  let count = 0;
  for (const id of candidateIds) {
    if (set.has(id)) count += 1;
  }
  return count;
}

export function matchesNearbyLocalQuery(
  query: string,
  input: {
    displayName: string;
    occupation: string;
    interestLabels: readonly string[];
  },
): boolean {
  const q = normalizeSearchQuery(query);
  if (!q) return true;
  const haystack = normalizeSearchQuery(
    [input.displayName, input.occupation, ...input.interestLabels].join(' '),
  );
  return haystack.includes(q);
}

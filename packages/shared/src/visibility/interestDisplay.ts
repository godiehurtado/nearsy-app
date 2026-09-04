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
  /** Optional cap. Nearby icons-only should omit this and use layout overflow. */
  limit?: number,
): ResolvedInterestChip[] {
  const out: ResolvedInterestChip[] = [];
  const max =
    typeof limit === 'number' && Number.isFinite(limit) && limit >= 0
      ? Math.floor(limit)
      : Number.POSITIVE_INFINITY;
  for (const id of ids) {
    if (out.length >= max) break;
    const chip = resolveInterestChip(id, translateItem);
    if (chip) out.push(chip);
  }
  return out;
}

export type NearbyInterestIconLayout = {
  visibleCount: number;
  overflowCount: number;
};

/**
 * How many circular interest icons fit in a Nearby card row.
 * When not all fit, reserves room for a `+N` chip.
 */
export function planNearbyInterestIconLayout(
  totalCount: number,
  containerWidth: number,
  options?: {
    iconSize?: number;
    gap?: number;
    plusWidth?: number;
  },
): NearbyInterestIconLayout {
  const total = Math.max(0, Math.floor(totalCount));
  if (total === 0) return { visibleCount: 0, overflowCount: 0 };

  const iconSize = options?.iconSize ?? 28;
  const gap = options?.gap ?? 6;
  const plusWidth = options?.plusWidth ?? 28;
  const width = Math.max(0, containerWidth);
  if (width <= 0) {
    // Before first layout: show a conservative row; overflow refined onLayout.
    const provisional = Math.min(total, 6);
    return {
      visibleCount: provisional,
      overflowCount: Math.max(0, total - provisional),
    };
  }

  const unit = iconSize + gap;
  const maxWithoutPlus = Math.max(0, Math.floor((width + gap) / unit));
  if (total <= maxWithoutPlus) {
    return { visibleCount: total, overflowCount: 0 };
  }

  const maxWithPlus = Math.max(
    1,
    Math.floor((width - plusWidth + gap) / unit),
  );
  const visibleCount = Math.min(total - 1, maxWithPlus);
  return {
    visibleCount,
    overflowCount: Math.max(0, total - visibleCount),
  };
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

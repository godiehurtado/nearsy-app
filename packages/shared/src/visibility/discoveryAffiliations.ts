/**
 * Public affiliations for getDiscoveryProfile (Detail only).
 * No provider / website / topic / source bags.
 */

import {
  getOnboardingAffiliationCategory,
  listOnboardingAffiliationCategoryIds,
  type OnboardingAffiliationCategoryId,
} from '../affiliations/onboardingAffiliationCatalog.ts';

/** Contract cap — matches backend `MAX_PUBLIC_AFFILIATIONS`. */
export const MAX_DISCOVERY_AFFILIATIONS = 48;

/** Narrowest tile before the inline grid drops a column. */
export const DISCOVERY_AFFILIATION_MIN_TILE_WIDTH = 120;
export const DISCOVERY_AFFILIATION_MAX_COLUMNS = 3;

export type DiscoveryPublicAffiliation = {
  id: string;
  name: string;
  type: string | null;
  logoUrl: string | null;
};

const AFFILIATION_ALLOWED_KEYS = new Set(['id', 'name', 'type', 'logoUrl']);

const KNOWN_CATEGORY_IDS = new Set<string>(listOnboardingAffiliationCategoryIds());

function nonEmptyTrimmed(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Invalid / non-https logo → null so the logo mark uses its initials/emoji fallback. */
function sanitizeLogoUrl(value: unknown): string | null {
  const trimmed = nonEmptyTrimmed(value);
  if (!trimmed || !/^https:\/\//i.test(trimmed)) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
      return null;
    }
  } catch {
    return null;
  }
  return trimmed;
}

function parseAffiliationItem(value: unknown): DiscoveryPublicAffiliation | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const row = value as Record<string, unknown>;
  if (Object.keys(row).some((key) => !AFFILIATION_ALLOWED_KEYS.has(key))) {
    return null;
  }
  const id = nonEmptyTrimmed(row.id);
  const name = nonEmptyTrimmed(row.name);
  if (!id || !name) return null;

  return {
    id,
    name,
    type: nonEmptyTrimmed(row.type),
    logoUrl: sanitizeLogoUrl(row.logoUrl),
  };
}

/**
 * Wire parser for getDiscoveryProfile.affiliations.
 *
 * Fail-open per entry: absent / non-array → []; malformed rows (non-object, missing
 * id/name, forbidden private fields) and duplicate IDs are dropped individually.
 * Never throws, so one bad affiliation cannot fail the whole profile.
 * Preserves order; keeps at most MAX_DISCOVERY_AFFILIATIONS valid rows.
 */
export function parseDiscoveryAffiliations(
  raw: unknown,
): DiscoveryPublicAffiliation[] {
  if (!Array.isArray(raw)) return [];

  const out: DiscoveryPublicAffiliation[] = [];
  const seen = new Set<string>();

  for (const entry of raw) {
    if (out.length >= MAX_DISCOVERY_AFFILIATIONS) break;
    const item = parseAffiliationItem(entry);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }

  return out;
}

/**
 * Inline grid sizing for Profile Exploration affiliations: about two tiles per row on
 * phones, fewer on very narrow widths, at most three on wide screens.
 * Returns null until the container width is known.
 */
export function resolveDiscoveryAffiliationGrid(
  containerWidth: number,
  gap: number,
): { columns: number; tileWidth: number } | null {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) return null;
  const safeGap = Math.max(0, gap);
  const fit = Math.floor(
    (containerWidth + safeGap) / (DISCOVERY_AFFILIATION_MIN_TILE_WIDTH + safeGap),
  );
  const columns = Math.min(DISCOVERY_AFFILIATION_MAX_COLUMNS, Math.max(1, fit));
  const tileWidth = Math.floor(
    (containerWidth - safeGap * (columns - 1)) / columns,
  );
  return { columns, tileWidth };
}

/**
 * Localized category label when `type` matches CRJ onboarding category id;
 * otherwise a safe humanized presentation (never raw technical dumps).
 */
export function formatDiscoveryAffiliationTypeLabel(
  type: string | null | undefined,
  translateCategory: (nameKey: string, fallback: string) => string,
): string | null {
  if (typeof type !== 'string') return null;
  const trimmed = type.trim();
  if (!trimmed) return null;

  if (KNOWN_CATEGORY_IDS.has(trimmed)) {
    const cat = getOnboardingAffiliationCategory(
      trimmed as OnboardingAffiliationCategoryId,
    );
    return translateCategory(cat.nameKey, cat.name);
  }

  if (/^[a-z0-9]+(?:_[a-z0-9]+)*$/i.test(trimmed)) {
    return trimmed
      .split('_')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(' ');
  }

  return trimmed;
}

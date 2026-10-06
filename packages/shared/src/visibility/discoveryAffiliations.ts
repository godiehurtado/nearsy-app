/**
 * Public affiliations for getDiscoveryProfile (Detail only).
 * No provider / website / topic / source bags.
 */

import {
  getOnboardingAffiliationCategory,
  listOnboardingAffiliationCategoryIds,
  type OnboardingAffiliationCategoryId,
} from '../affiliations/onboardingAffiliationCatalog';
import { isAllowedDiscoverySocialHttpsUrl } from './discoverySocialLinks';

/** Contractual cap — mirrors Functions `MAX_PUBLIC_AFFILIATIONS`. */
export const MAX_DISCOVERY_AFFILIATIONS = 48;

export type DiscoveryPublicAffiliation = {
  id: string;
  name: string;
  type: string | null;
  logoUrl: string | null;
};

const AFFILIATION_ALLOWED_KEYS = new Set(['id', 'name', 'type', 'logoUrl']);

const KNOWN_CATEGORY_IDS = new Set<string>(listOnboardingAffiliationCategoryIds());

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Unusable logo → null so the UI falls back to initials / category mark. */
function httpsLogoOrNull(value: unknown): string | null {
  const trimmed = nonEmptyString(value);
  if (!trimmed) return null;
  return isAllowedDiscoverySocialHttpsUrl(trimmed) ? trimmed : null;
}

/**
 * One wire row → affiliation, or null when it must be hidden
 * (not an object, extra/private fields, missing id or name).
 */
function parseAffiliationItem(value: unknown): DiscoveryPublicAffiliation | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const row = value as Record<string, unknown>;
  for (const key of Object.keys(row)) {
    if (!AFFILIATION_ALLOWED_KEYS.has(key)) return null;
  }

  const id = nonEmptyString(row.id);
  const name = nonEmptyString(row.name);
  if (!id || !name) return null;

  return {
    id,
    name,
    type: nonEmptyString(row.type),
    logoUrl: httpsLogoOrNull(row.logoUrl),
  };
}

/**
 * Wire parser for getDiscoveryProfile.affiliations.
 *
 * Fail-open per entry, like the backend: malformed rows are hidden
 * individually and never fail the profile. Absent / non-array → [].
 * Preserves order; first row wins per id; reads at most
 * MAX_DISCOVERY_AFFILIATIONS rows.
 */
export function parseDiscoveryAffiliations(
  raw: unknown,
): DiscoveryPublicAffiliation[] {
  if (!Array.isArray(raw)) return [];

  const out: DiscoveryPublicAffiliation[] = [];
  const seen = new Set<string>();

  for (const entry of raw.slice(0, MAX_DISCOVERY_AFFILIATIONS)) {
    const item = parseAffiliationItem(entry);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }

  return out;
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

/**
 * Public affiliations for getDiscoveryProfile (Detail only).
 * Optional `topic` is adopted from the pending Functions contract so
 * Family / subcategory labels can render. Extra private bags still hide the row.
 */

import {
  formatAffiliationDisplay,
  type AffiliationTranslate,
} from '../affiliations/affiliationPresentation';
import { listOnboardingAffiliationCategoryIds } from '../affiliations/onboardingAffiliationCatalog';
import { isAllowedDiscoverySocialHttpsUrl } from './discoverySocialLinks';

/** Contractual cap — mirrors Functions `MAX_PUBLIC_AFFILIATIONS`. */
export const MAX_DISCOVERY_AFFILIATIONS = 48;

export type DiscoveryPublicAffiliation = {
  id: string;
  name: string;
  type: string | null;
  topic: string | null;
  logoUrl: string | null;
};

const AFFILIATION_ALLOWED_KEYS = new Set([
  'id',
  'name',
  'type',
  'topic',
  'logoUrl',
]);

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
  const name = nonEmptyString(row.name) ?? '';
  const topic = nonEmptyString(row.topic);
  if (!id || (!name && !topic)) return null;

  return {
    id,
    name,
    type: nonEmptyString(row.type),
    topic,
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

const KNOWN_CATEGORY_IDS = new Set<string>(listOnboardingAffiliationCategoryIds());

/**
 * Subcategory label for Discovery. General category ids are never shown.
 */
export function formatDiscoveryAffiliationTypeLabel(
  type: string | null | undefined,
  translate: AffiliationTranslate,
): string | null {
  if (typeof type !== 'string') return null;
  const trimmed = type.trim();
  if (!trimmed || KNOWN_CATEGORY_IDS.has(trimmed)) return null;
  return (
    formatAffiliationDisplay({
      name: null,
      topic: trimmed,
      translate,
    })?.primary ?? null
  );
}

export function formatDiscoveryAffiliationDisplay(
  item: Pick<DiscoveryPublicAffiliation, 'name' | 'type' | 'topic'>,
  translate: AffiliationTranslate,
) {
  return formatAffiliationDisplay({
    name: item.name,
    categoryId: item.type,
    topic: item.topic ?? undefined,
    translate,
  });
}

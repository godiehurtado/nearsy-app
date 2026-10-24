/**
 * Public affiliations for getDiscoveryProfile (Detail only).
 * Four-key DTO: { id, name, type, logoUrl }. `type` is the subcategory ID
 * when known; never a private `topic` bag (2.0.8 drops extra keys).
 * Contract: docs/design/NEARSY-209-affiliations-final-contract.md
 */

import {
  formatAffiliationDisplay,
  isFamilyTopicId,
  isKnownAffiliationCategoryId,
  type AffiliationTranslate,
} from '../affiliations/affiliationPresentation';
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

function stringOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Unusable logo → null so the UI falls back to initials / category mark. */
function httpsLogoOrNull(value: unknown): string | null {
  const trimmed = stringOrNull(value);
  if (!trimmed) return null;
  return isAllowedDiscoverySocialHttpsUrl(trimmed) ? trimmed : null;
}

/**
 * One wire row → affiliation, or null when it must be hidden
 * (not an object, extra/private fields, missing id).
 * Nameless civic/faith rows keep `name: ""` when `type` is a subcategory.
 */
function parseAffiliationItem(value: unknown): DiscoveryPublicAffiliation | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const row = value as Record<string, unknown>;
  for (const key of Object.keys(row)) {
    if (!AFFILIATION_ALLOWED_KEYS.has(key)) return null;
  }

  const id = stringOrNull(row.id);
  if (!id) return null;

  const name =
    typeof row.name === 'string' ? row.name.trim() : null;
  if (name === null) return null;
  const type = stringOrNull(row.type);
  if (!name && !type) return null;
  if (!name && isKnownAffiliationCategoryId(type)) return null;

  return {
    id,
    name,
    type,
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
 * Subcategory label for Discovery. General category ids are never shown.
 */
export function formatDiscoveryAffiliationTypeLabel(
  type: string | null | undefined,
  translate: AffiliationTranslate,
): string | null {
  if (typeof type !== 'string') return null;
  const trimmed = type.trim();
  if (!trimmed || isKnownAffiliationCategoryId(trimmed)) return null;
  return (
    formatAffiliationDisplay({
      name: null,
      categoryId: isFamilyTopicId(trimmed) ? 'family' : null,
      topic: trimmed,
      translate,
    })?.primary ?? null
  );
}

export function formatDiscoveryAffiliationDisplay(
  item: Pick<DiscoveryPublicAffiliation, 'name' | 'type'>,
  translate: AffiliationTranslate,
) {
  const type = item.type;
  const topic = type && !isKnownAffiliationCategoryId(type) ? type : null;
  return formatAffiliationDisplay({
    name: item.name,
    categoryId: isFamilyTopicId(type) ? 'family' : null,
    topic,
    translate,
  });
}

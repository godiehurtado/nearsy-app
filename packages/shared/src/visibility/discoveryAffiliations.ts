/**
 * Public affiliations for getDiscoveryProfile (Detail only).
 * No provider / website / topic / source bags.
 */

import {
  getOnboardingAffiliationCategory,
  listOnboardingAffiliationCategoryIds,
  type OnboardingAffiliationCategoryId,
} from '../affiliations/onboardingAffiliationCatalog';
import { createContractResponseError } from './callables/errors';
import { isAllowedDiscoverySocialHttpsUrl } from './discoverySocialLinks';

/** Defensive client cap (backend persists a small active-profile set). */
export const MAX_DISCOVERY_AFFILIATIONS = 24;

export type DiscoveryPublicAffiliation = {
  id: string;
  name: string;
  type: string | null;
  logoUrl: string | null;
};

const AFFILIATION_ALLOWED_KEYS = new Set(['id', 'name', 'type', 'logoUrl']);

const KNOWN_CATEGORY_IDS = new Set<string>(listOnboardingAffiliationCategoryIds());

function requireHttpsOrNull(value: unknown, path: string): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw createContractResponseError(
      `${path} must be https URL string or null`,
      value,
    );
  }
  const trimmed = value.trim();
  if (!isAllowedDiscoverySocialHttpsUrl(trimmed)) {
    throw createContractResponseError(
      `${path} must be a valid https URL or null`,
      value,
    );
  }
  return trimmed;
}

function requireTypeOrNull(value: unknown, path: string): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw createContractResponseError(
      `${path} must be a non-empty string or null`,
      value,
    );
  }
  return value.trim();
}

function parseAffiliationItem(
  value: unknown,
  path: string,
): DiscoveryPublicAffiliation {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw createContractResponseError(`${path} must be an object`, value);
  }
  const row = value as Record<string, unknown>;
  for (const key of Object.keys(row)) {
    if (!AFFILIATION_ALLOWED_KEYS.has(key)) {
      throw createContractResponseError(
        `Forbidden affiliations field "${key}" at ${path}`,
        value,
      );
    }
  }

  const id =
    typeof row.id === 'string' && row.id.trim().length > 0
      ? row.id.trim()
      : null;
  if (!id) {
    throw createContractResponseError(`${path}.id must be a non-empty string`, row.id);
  }

  const name =
    typeof row.name === 'string' && row.name.trim().length > 0
      ? row.name.trim()
      : null;
  if (!name) {
    throw createContractResponseError(
      `${path}.name must be a non-empty string`,
      row.name,
    );
  }

  return {
    id,
    name,
    type: requireTypeOrNull(row.type, `${path}.type`),
    logoUrl: requireHttpsOrNull(row.logoUrl, `${path}.logoUrl`),
  };
}

/**
 * Wire parser for getDiscoveryProfile.affiliations.
 * Absent → []. Present but invalid → invalid-response.
 * Preserves order; rejects duplicate IDs.
 */
export function parseDiscoveryAffiliations(
  raw: unknown,
): DiscoveryPublicAffiliation[] {
  if (raw === undefined) {
    return [];
  }
  if (!Array.isArray(raw)) {
    throw createContractResponseError(
      'affiliations must be an array when present',
      raw,
    );
  }
  if (raw.length > MAX_DISCOVERY_AFFILIATIONS) {
    throw createContractResponseError(
      `affiliations exceeds max ${MAX_DISCOVERY_AFFILIATIONS}`,
      raw.length,
    );
  }

  const out: DiscoveryPublicAffiliation[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < raw.length; i += 1) {
    const item = parseAffiliationItem(raw[i], `affiliations[${i}]`);
    if (seen.has(item.id)) {
      throw createContractResponseError(
        `duplicate affiliations id "${item.id}"`,
        item.id,
      );
    }
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

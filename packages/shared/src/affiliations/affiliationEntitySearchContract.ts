/**
 * Normalized Nearsy Function contract for CRJ-I9 affiliation entity search.
 * Clients must not import Logo.dev or Brandfetch response types.
 */

import type { OnboardingAffiliationCategoryId } from './onboardingAffiliationCatalog.ts';
import type { AffiliationEntitySearchResult } from './affiliationEntitySearchProvider.ts';

export const SEARCH_AFFILIATION_ENTITIES_FUNCTION =
  'searchAffiliationEntities' as const;

export const AFFILIATION_ENTITY_SEARCH_MIN_QUERY = 2;
export const AFFILIATION_ENTITY_SEARCH_MAX_QUERY = 80;
export const AFFILIATION_ENTITY_SEARCH_DEFAULT_LIMIT = 8;
export const AFFILIATION_ENTITY_SEARCH_MAX_LIMIT = 10;
export const AFFILIATION_ENTITY_SEARCH_TIMEOUT_MS = 8_000;
export const AFFILIATION_ENTITY_SEARCH_DEBOUNCE_MS = 300;

export type AffiliationEntitySearchErrorCode =
  | 'INVALID_ARGUMENT'
  | 'UNAUTHENTICATED'
  | 'FAILED_PRECONDITION'
  | 'UNAVAILABLE'
  | 'DEADLINE_EXCEEDED'
  | 'RESOURCE_EXHAUSTED'
  | 'INTERNAL';

export type AffiliationEntitySearchRequest = {
  query: string;
  categoryId: OnboardingAffiliationCategoryId;
  limit?: number;
};

export type AffiliationEntitySearchNormalizedRow = {
  id: string;
  name: string;
  logoUrl?: string;
  domain?: string;
  subtitle?: string;
  provider: string;
  providerId?: string;
};

export type AffiliationEntitySearchResponse = {
  results: AffiliationEntitySearchNormalizedRow[];
};

export class AffiliationEntitySearchClientError extends Error {
  readonly code: AffiliationEntitySearchErrorCode;

  constructor(code: AffiliationEntitySearchErrorCode, message: string) {
    super(message);
    this.name = 'AffiliationEntitySearchClientError';
    this.code = code;
  }
}

export function normalizeAffiliationSearchQuery(query: string): string {
  return query.trim().replace(/\s+/g, ' ');
}

export function shouldSearchAffiliationEntities(query: string): boolean {
  const normalized = normalizeAffiliationSearchQuery(query);
  return (
    normalized.length >= AFFILIATION_ENTITY_SEARCH_MIN_QUERY &&
    normalized.length <= AFFILIATION_ENTITY_SEARCH_MAX_QUERY
  );
}

export function clampAffiliationSearchLimit(limit?: number): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) {
    return AFFILIATION_ENTITY_SEARCH_DEFAULT_LIMIT;
  }
  return Math.min(
    AFFILIATION_ENTITY_SEARCH_MAX_LIMIT,
    Math.max(1, Math.floor(limit)),
  );
}

export function mapNormalizedRowToUiResult(
  row: AffiliationEntitySearchNormalizedRow,
  categoryId: OnboardingAffiliationCategoryId,
): AffiliationEntitySearchResult {
  const providerId = row.providerId || row.id;
  const result: AffiliationEntitySearchResult = {
    providerId,
    name: row.name,
    categoryId,
    provider: row.provider,
  };
  if (row.logoUrl) result.logoUrl = row.logoUrl;
  if (row.domain) result.website = `https://${row.domain.replace(/^https?:\/\//i, '')}`;
  return result;
}

export type AffiliationSearchFailureKind =
  | 'auth'
  | 'app_check'
  | 'function_unavailable'
  | 'provider'
  | 'timeout'
  | 'internal';

/** Development diagnostics only — never includes tokens or keys. */
export function classifyAffiliationSearchFailure(
  err: AffiliationEntitySearchClientError,
): AffiliationSearchFailureKind {
  switch (err.code) {
    case 'UNAUTHENTICATED':
      return 'auth';
    case 'FAILED_PRECONDITION':
      return 'app_check';
    case 'UNAVAILABLE':
    case 'RESOURCE_EXHAUSTED':
      return 'function_unavailable';
    case 'DEADLINE_EXCEEDED':
      return 'timeout';
    case 'INTERNAL':
      return 'provider';
    default:
      return 'internal';
  }
}

export function mapAffiliationSearchCallableError(
  err: unknown,
): AffiliationEntitySearchClientError {
  if (err instanceof AffiliationEntitySearchClientError) return err;

  const anyErr = err as { code?: string; name?: string };
  const raw = String(anyErr?.code ?? '').trim();
  const normalized = raw.replace(/^functions\//i, '').toLowerCase();

  if (
    normalized === 'app_check_failed' ||
    normalized === 'app_check_timeout' ||
    normalized === 'failed-precondition' ||
    normalized === 'not_initialized' ||
    normalized === 'initializing'
  ) {
    return new AffiliationEntitySearchClientError(
      'FAILED_PRECONDITION',
      'Affiliation search is not ready.',
    );
  }
  if (normalized === 'unauthenticated') {
    return new AffiliationEntitySearchClientError(
      'UNAUTHENTICATED',
      'Affiliation search requires sign-in.',
    );
  }
  if (normalized === 'resource-exhausted') {
    return new AffiliationEntitySearchClientError(
      'RESOURCE_EXHAUSTED',
      'Affiliation search is busy.',
    );
  }
  if (normalized === 'deadline-exceeded') {
    return new AffiliationEntitySearchClientError(
      'DEADLINE_EXCEEDED',
      'Affiliation search timed out.',
    );
  }
  if (normalized === 'unavailable') {
    return new AffiliationEntitySearchClientError(
      'UNAVAILABLE',
      'Affiliation search is unavailable.',
    );
  }
  if (normalized === 'invalid-argument') {
    return new AffiliationEntitySearchClientError(
      'INVALID_ARGUMENT',
      'Affiliation search query is invalid.',
    );
  }
  return new AffiliationEntitySearchClientError(
    'INTERNAL',
    'Affiliation search failed.',
  );
}

export function parseAffiliationEntitySearchResponse(
  data: unknown,
): AffiliationEntitySearchResponse {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new AffiliationEntitySearchClientError(
      'INTERNAL',
      'Invalid affiliation search response.',
    );
  }
  const raw = data as { results?: unknown };
  if (!Array.isArray(raw.results)) {
    throw new AffiliationEntitySearchClientError(
      'INTERNAL',
      'Invalid affiliation search response.',
    );
  }

  const results: AffiliationEntitySearchNormalizedRow[] = [];
  for (const item of raw.results) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const id = typeof row.id === 'string' ? row.id.trim() : '';
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    const provider = typeof row.provider === 'string' ? row.provider.trim() : '';
    if (!id || !name || !provider) continue;
    if (/^(file|content|ph|assets-library|data):/i.test(String(row.logoUrl ?? ''))) {
      continue;
    }
    const mapped: AffiliationEntitySearchNormalizedRow = { id, name, provider };
    if (typeof row.logoUrl === 'string' && /^https:\/\//i.test(row.logoUrl)) {
      mapped.logoUrl = row.logoUrl;
    }
    if (typeof row.domain === 'string' && row.domain.trim()) {
      mapped.domain = row.domain.trim();
    }
    if (typeof row.subtitle === 'string' && row.subtitle.trim()) {
      mapped.subtitle = row.subtitle.trim();
    }
    if (typeof row.providerId === 'string' && row.providerId.trim()) {
      mapped.providerId = row.providerId.trim();
    }
    results.push(mapped);
  }

  return { results };
}

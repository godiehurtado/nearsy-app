import type {
  AffiliationEntitySearchProvider,
  AffiliationEntitySearchResult,
} from './affiliationEntitySearchProvider';
import type { OnboardingAffiliationCategoryId } from './onboardingAffiliationCatalog';
import {
  AFFILIATION_ENTITY_SEARCH_DEFAULT_LIMIT,
  AFFILIATION_ENTITY_SEARCH_TIMEOUT_MS,
  AffiliationEntitySearchClientError,
  SEARCH_AFFILIATION_ENTITIES_FUNCTION,
  clampAffiliationSearchLimit,
  classifyAffiliationSearchFailure,
  mapAffiliationSearchCallableError,
  mapNormalizedRowToUiResult,
  normalizeAffiliationSearchQuery,
  parseAffiliationEntitySearchResponse,
  shouldSearchAffiliationEntities,
  type AffiliationEntitySearchRequest,
} from './affiliationEntitySearchContract';

export type AffiliationEntitySearchCallable = (
  name: typeof SEARCH_AFFILIATION_ENTITIES_FUNCTION,
  data: AffiliationEntitySearchRequest,
) => Promise<unknown>;

export type FirebaseAffiliationEntitySearchProviderDeps = {
  invoke: AffiliationEntitySearchCallable;
  timeoutMs?: number;
  limit?: number;
  resolveLogoUrl?: (domain?: string) => string | undefined;
};

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new AffiliationEntitySearchClientError(
          'DEADLINE_EXCEEDED',
          'Affiliation search timed out.',
        ),
      );
    }, timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Calls Nearsy's searchAffiliationEntities Function.
 * Never talks to Logo.dev or Brandfetch directly.
 */
export function createFirebaseAffiliationEntitySearchProvider(
  deps: FirebaseAffiliationEntitySearchProviderDeps,
): AffiliationEntitySearchProvider {
  const timeoutMs = deps.timeoutMs ?? AFFILIATION_ENTITY_SEARCH_TIMEOUT_MS;
  const limit = clampAffiliationSearchLimit(deps.limit);

  return {
    id: 'firebase',
    async search(
      query: string,
      categoryId: OnboardingAffiliationCategoryId,
    ): Promise<AffiliationEntitySearchResult[]> {
      const normalized = normalizeAffiliationSearchQuery(query);
      if (!shouldSearchAffiliationEntities(normalized)) return [];

      try {
        const data = await withTimeout(
          deps.invoke(SEARCH_AFFILIATION_ENTITIES_FUNCTION, {
            query: normalized,
            categoryId,
            limit,
          }),
          timeoutMs,
        );
        const parsed = parseAffiliationEntitySearchResponse(data);
        return parsed.results
          .slice(0, AFFILIATION_ENTITY_SEARCH_DEFAULT_LIMIT)
          .map((row) => {
            const mapped = mapNormalizedRowToUiResult(row, categoryId);
            if (!mapped.logoUrl && deps.resolveLogoUrl) {
              const logoUrl = deps.resolveLogoUrl(row.domain || row.providerId);
              if (logoUrl) mapped.logoUrl = logoUrl;
            }
            return mapped;
          });
      } catch (error) {
        const mapped = mapAffiliationSearchCallableError(error);
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.warn(
            '[AffiliationSearch]',
            mapped.code,
            classifyAffiliationSearchFailure(mapped),
          );
        }
        throw mapped;
      }
    },
  };
}

/**
 * CRJ-I9 — Affiliation Entity Search Provider (future).
 *
 * The UI consumes this adapter only. Do not couple screens to Clearbit,
 * Brandfetch, Google Places, LinkedIn, Crunchbase, or any other vendor.
 * A real provider must be evaluated across all seven CRJ categories
 * (Education through Identity & Lifestyle), not companies alone.
 * Custom/manual affiliation must remain even after a live API ships.
 */
import type { OnboardingAffiliationCategoryId } from './onboardingAffiliationCatalog.ts';

/** Normalized entity search result — provider-agnostic. */
export type AffiliationEntitySearchResult = {
  providerId: string;
  name: string;
  logoUrl?: string;
  website?: string;
  categoryId: OnboardingAffiliationCategoryId;
  provider: string;
  /** True when this row is the exact typed query (custom entry candidate). */
  isQueryMatch?: boolean;
};

export type AffiliationEntitySearchProvider = {
  id: string;
  search: (
    query: string,
    categoryId: OnboardingAffiliationCategoryId,
  ) => Promise<AffiliationEntitySearchResult[]>;
};

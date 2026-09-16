import type { OnboardingAffiliationCategoryId } from './onboardingAffiliationCatalog.ts';
import type {
  AffiliationEntitySearchProvider,
  AffiliationEntitySearchResult,
} from './affiliationEntitySearchProvider.ts';

const QUERY_SUFFIXES: Record<OnboardingAffiliationCategoryId, string[]> = {
  education: ['University', 'College', 'High School'],
  professional: ['Inc.', 'Group', 'Technologies'],
  community: ['Foundation', 'Association', 'Collective'],
  sports_clubs: ['Club', 'League', 'Team'],
  faith: ['', 'Group', 'Community'],
  political_civic: ['', 'Group', 'Community'],
  identity_lifestyle: ['', 'Group', 'Community'],
};

function slugName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

/**
 * Claude `mockLogoLookup` — typed query first, then group suffixes, max 4.
 * Internal fixture only; UI never labels these as mock/demo.
 */
export function buildFixtureAffiliationNames(
  query: string,
  categoryId: OnboardingAffiliationCategoryId,
): string[] {
  const q = (query || '').trim();
  if (q.length < 2) return [];
  const tails = QUERY_SUFFIXES[categoryId] ?? ['', 'Group', 'Community'];
  const seen = new Set<string>();
  const names = [q].concat(tails.map((tail) => (tail ? `${q} ${tail}` : q)));
  return names.filter((name) => {
    const key = name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 4);
}

/** Deterministic local fixture — NOT live API data. */
export const fixtureAffiliationEntitySearchProvider: AffiliationEntitySearchProvider =
  {
    id: 'fixture',
    async search(query, categoryId) {
      const names = buildFixtureAffiliationNames(query, categoryId);
      const exact = query.trim().toLowerCase();
      return names.map((name) => {
        const isQueryMatch = name.toLowerCase() === exact;
        const result: AffiliationEntitySearchResult = {
          providerId: isQueryMatch
            ? `query:${slugName(name)}`
            : `fixture:${categoryId}:${slugName(name)}`,
          name,
          categoryId,
          provider: 'fixture',
        };
        if (isQueryMatch) result.isQueryMatch = true;
        return result;
      });
    },
  };

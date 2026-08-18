import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { AFFILIATION_ENTITY_SEARCH_COVERAGE_CORPUS } from '../affiliations/affiliationEntitySearchCoverageCorpus';
import {
  AFFILIATION_ENTITY_SEARCH_DEBOUNCE_MS,
  AFFILIATION_ENTITY_SEARCH_MIN_QUERY,
  AffiliationEntitySearchClientError,
  SEARCH_AFFILIATION_ENTITIES_FUNCTION,
  mapNormalizedRowToUiResult,
  parseAffiliationEntitySearchResponse,
  shouldSearchAffiliationEntities,
} from '../affiliations/affiliationEntitySearchContract';
import { createFirebaseAffiliationEntitySearchProvider } from '../affiliations/firebaseAffiliationEntitySearchProvider';
import {
  getAffiliationEntitySearchProvider,
  getRegisteredAffiliationEntitySearchCallable,
  registerAffiliationEntitySearchCallable,
  resolveAffiliationEntitySearchProviderKind,
} from '../affiliations/affiliationEntitySearchRuntime';
import { fixtureAffiliationEntitySearchProvider } from '../affiliations/fixtureAffiliationEntitySearchProvider';
import { listOnboardingAffiliationCategoryIds } from '../affiliations/onboardingAffiliationCatalog';

const here = dirname(fileURLToPath(import.meta.url));

function readSharedSource(relativeFromSharedSrc: string): string {
  return readFileSync(join(here, '..', relativeFromSharedSrc), 'utf8');
}

afterEach(() => {
  registerAffiliationEntitySearchCallable(null);
});

describe('CRJ-I9 client contract', () => {
  it('normalized Function name and query rules match I6 debounce', () => {
    assert.equal(SEARCH_AFFILIATION_ENTITIES_FUNCTION, 'searchAffiliationEntities');
    assert.equal(AFFILIATION_ENTITY_SEARCH_MIN_QUERY, 2);
    assert.equal(AFFILIATION_ENTITY_SEARCH_DEBOUNCE_MS, 300);
    assert.equal(shouldSearchAffiliationEntities('M'), false);
    assert.equal(shouldSearchAffiliationEntities('  Mi  '), true);
  });

  it('parses normalized Function rows and drops local URIs', () => {
    const parsed = parseAffiliationEntitySearchResponse({
      results: [
        {
          id: 'logo.dev:microsoft.com',
          name: 'Microsoft',
          domain: 'microsoft.com',
          logoUrl: 'https://img.logo.dev/microsoft.com?token=pk_x',
          provider: 'logo.dev',
          providerId: 'microsoft.com',
        },
        {
          id: 'bad',
          name: 'Local',
          provider: 'logo.dev',
          logoUrl: 'file:///tmp/a.jpg',
        },
      ],
    });
    assert.equal(parsed.results.length, 1);
    const ui = mapNormalizedRowToUiResult(parsed.results[0]!, 'professional');
    assert.equal(ui.providerId, 'microsoft.com');
    assert.equal(ui.website, 'https://microsoft.com');
    assert.equal(ui.categoryId, 'professional');
    assert.ok(!('logo_url' in ui));
    assert.ok(!('brandId' in ui));
  });

  it('rejects raw/invalid Function payloads', () => {
    assert.throws(
      () => parseAffiliationEntitySearchResponse([{ name: 'Microsoft' }]),
      AffiliationEntitySearchClientError,
    );
    assert.throws(
      () => parseAffiliationEntitySearchResponse({ ok: true }),
      AffiliationEntitySearchClientError,
    );
  });
});

describe('CRJ-I9 firebase provider adapter', () => {
  it('maps Function results onto the existing UI contract', async () => {
    const provider = createFirebaseAffiliationEntitySearchProvider({
      invoke: async (_name, data) => {
        assert.equal(_name, 'searchAffiliationEntities');
        assert.equal(data.query, 'Google');
        assert.equal(data.categoryId, 'professional');
        return {
          results: [
            {
              id: 'logo.dev:google.com',
              name: 'Google',
              domain: 'google.com',
              logoUrl: 'https://img.logo.dev/google.com?token=pk_x',
              provider: 'logo.dev',
            },
          ],
        };
      },
    });
    const rows = await provider.search('  Google  ', 'professional');
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.name, 'Google');
    assert.equal(rows[0]!.provider, 'logo.dev');
    assert.equal(rows[0]!.logoUrl?.startsWith('https://'), true);
  });

  it('returns empty on timeout/error without throwing to UI', async () => {
    const provider = createFirebaseAffiliationEntitySearchProvider({
      timeoutMs: 20,
      invoke: async () =>
        new Promise((resolve) => {
          setTimeout(resolve, 200);
        }),
    });
    const rows = await provider.search('Microsoft', 'professional');
    assert.deepEqual(rows, []);
  });

  it('returns empty results without calling Function for short queries', async () => {
    let called = 0;
    const provider = createFirebaseAffiliationEntitySearchProvider({
      invoke: async () => {
        called += 1;
        return { results: [] };
      },
    });
    const rows = await provider.search('G', 'professional');
    assert.deepEqual(rows, []);
    assert.equal(called, 0);
  });
});

describe('CRJ-I9 provider swap / fixture default', () => {
  it('defaults to fixture and does not enable firebase without an invoker', async () => {
    assert.equal(resolveAffiliationEntitySearchProviderKind(undefined), 'fixture');
    assert.equal(resolveAffiliationEntitySearchProviderKind('firebase'), 'firebase');
    assert.equal(getRegisteredAffiliationEntitySearchCallable(), null);
    const provider = getAffiliationEntitySearchProvider('firebase');
    assert.equal(provider.id, 'fixture');
    const rows = await provider.search('Microsoft', 'professional');
    assert.equal(rows[0]!.isQueryMatch, true);
    assert.equal(rows[0]!.provider, 'fixture');
  });

  it('uses firebase adapter only after an invoker is registered', async () => {
    registerAffiliationEntitySearchCallable(async () => ({
      results: [
        {
          id: 'logo.dev:microsoft.com',
          name: 'Microsoft',
          provider: 'logo.dev',
          domain: 'microsoft.com',
        },
      ],
    }));
    const provider = getAffiliationEntitySearchProvider('firebase');
    assert.equal(provider.id, 'firebase');
    const rows = await provider.search('Microsoft', 'professional');
    assert.equal(rows[0]!.provider, 'logo.dev');
    assert.equal(rows[0]!.website, 'https://microsoft.com');
  });

  it('fixture provider still works after runtime helper exists', async () => {
    const rows = await fixtureAffiliationEntitySearchProvider.search(
      'Miami',
      'education',
    );
    assert.deepEqual(
      rows.map((r) => r.name),
      ['Miami', 'Miami University', 'Miami College', 'Miami High School'],
    );
  });
});

describe('CRJ-I9 panel wiring / custom fallback', () => {
  it('panel uses injectable provider, debounce, and stale generation', () => {
    const panel = readSharedSource(
      'components/registration/OnboardingAffiliationCategoryPanel.tsx',
    );
    assert.ok(panel.includes('getAffiliationEntitySearchProvider()'));
    assert.ok(panel.includes('SEARCH_DEBOUNCE_MS = 300'));
    assert.ok(panel.includes('trimmedQuery.length < 2'));
    assert.ok(panel.includes('searchGenerationRef'));
    assert.ok(panel.includes("source: isCustom ? 'custom' : 'provider'"));
    assert.ok(!panel.includes('api.logo.dev'));
    assert.ok(!panel.includes('api.brandfetch.io'));
    assert.ok(!panel.includes('ActivityIndicator'));
  });

  it('coverage corpus spans all seven categories', () => {
    const ids = listOnboardingAffiliationCategoryIds();
    assert.deepEqual(ids, [
      'education',
      'professional',
      'community',
      'sports_clubs',
      'faith',
      'political_civic',
      'identity_lifestyle',
    ]);
    for (const id of ids) {
      const count = AFFILIATION_ENTITY_SEARCH_COVERAGE_CORPUS.filter(
        (row) => row.categoryId === id,
      ).length;
      assert.equal(count, 10, `${id} should have 10 queries`);
    }
  });
});

describe('CRJ-I9 isolation', () => {
  it('does not implement live Functions, Auth, or I9-B provider secrets', () => {
    const runtime = readSharedSource(
      'affiliations/affiliationEntitySearchRuntime.ts',
    );
    const firebase = readSharedSource(
      'affiliations/firebaseAffiliationEntitySearchProvider.ts',
    );
    const panel = readSharedSource(
      'components/registration/OnboardingAffiliationCategoryPanel.tsx',
    );
    assert.ok(runtime.includes("kind === 'firebase' && registeredCallable"));
    assert.ok(firebase.includes('Never talks to Logo.dev or Brandfetch directly'));
    assert.ok(!panel.includes('LOGO_DEV_SECRET_KEY'));
    assert.ok(!firebase.includes('sk_'));
    const functionsDirMissing = (() => {
      try {
        readFileSync(join(here, '../../../../functions/src/index.ts'), 'utf8');
        return false;
      } catch {
        return true;
      }
    })();
    assert.equal(functionsDirMissing, true);
  });
});

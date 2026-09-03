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
  classifyAffiliationSearchFailure,
  mapAffiliationSearchCallableError,
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
  resolveAffiliationEntitySearchProviderKindFromEnvironment,
  setAffiliationExpoExtraForTests,
} from '../affiliations/affiliationEntitySearchRuntime';
import {
  buildLogoDevImageUrl,
  isEphemeralProviderLogoUrl,
  isLogoDevPublishableKey,
  normalizeAffiliationDomain,
} from '../affiliations/affiliationLogoDev';
import {
  buildAffiliationSearchCallableUrl,
  invokeAffiliationSearchCallableHttp,
  unwrapFirebaseCallableHttpBody,
} from '../affiliations/affiliationCallableHttp';
import { buildCrjAffiliationPersistencePatch } from '../affiliations/onboardingAffiliationPersistence';
import { fixtureAffiliationEntitySearchProvider } from '../affiliations/fixtureAffiliationEntitySearchProvider';
import { listOnboardingAffiliationCategoryIds } from '../affiliations/onboardingAffiliationCatalog';
import { resolveAffiliationLogoPresentation } from '../affiliations/affiliationLogo';

const here = dirname(fileURLToPath(import.meta.url));

function readSharedSource(relativeFromSharedSrc: string): string {
  return readFileSync(join(here, '..', relativeFromSharedSrc), 'utf8');
}

afterEach(() => {
  registerAffiliationEntitySearchCallable(null);
  setAffiliationExpoExtraForTests(null);
  delete process.env.EXPO_PUBLIC_NEARSY_FIREBASE_ENV;
  delete process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
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
        assert.equal(data.limit, 8);
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

  it('throws a normalized error on timeout so custom entry can continue', async () => {
    const provider = createFirebaseAffiliationEntitySearchProvider({
      timeoutMs: 20,
      invoke: async () =>
        new Promise((resolve) => {
          setTimeout(resolve, 200);
        }),
    });
    await assert.rejects(
      () => provider.search('Microsoft', 'professional'),
      (err: unknown) =>
        err instanceof AffiliationEntitySearchClientError &&
        err.code === 'DEADLINE_EXCEEDED',
    );
  });

  it('D — attaches a client-safe logo URL when the Function omits logoUrl', async () => {
    const provider = createFirebaseAffiliationEntitySearchProvider({
      invoke: async () => ({
        results: [
          {
            id: 'logo.dev:microsoft.com',
            name: 'Microsoft',
            provider: 'logo.dev',
            domain: 'microsoft.com',
          },
        ],
      }),
      resolveLogoUrl: (domain) =>
        buildLogoDevImageUrl(domain, 'pk_test_placeholder'),
    });
    const rows = await provider.search('Microsoft', 'professional');
    assert.equal(
      rows[0]!.logoUrl,
      'https://img.logo.dev/microsoft.com?token=pk_test_placeholder',
    );
  });

  it('F — provider errors stay mapped so custom entry can continue', async () => {
    const provider = createFirebaseAffiliationEntitySearchProvider({
      invoke: async () => {
        throw { code: 'functions/unavailable' };
      },
    });
    await assert.rejects(
      () => provider.search('Agnostic', 'faith'),
      (err: unknown) =>
        err instanceof AffiliationEntitySearchClientError &&
        err.code === 'UNAVAILABLE',
    );
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
    assert.ok(panel.includes('explicitlyPicked'));
    assert.ok(panel.includes('suggestionsUnavailable'));
    assert.ok(panel.includes('resolveInMemorySelectedLogoUrl'));
    assert.ok(panel.includes('matched?.logoUrl'));
    assert.ok(!panel.includes('draftImage ? { logoUrl: draftImage }'));
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

describe('CRJ-I9-C environment / production safety', () => {
  it('A — Development selects firebase when callable is registered', async () => {
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
    const provider = getAffiliationEntitySearchProvider(undefined, {
      firebaseEnv: 'development',
      projectId: 'nearsy-dev',
    });
    assert.equal(provider.id, 'firebase');
    const rows = await provider.search('Microsoft', 'professional');
    assert.equal(rows[0]!.provider, 'logo.dev');
  });

  it('B — Production selects firebase when callable is registered', () => {
    registerAffiliationEntitySearchCallable(async () => ({ results: [] }));
    const provider = getAffiliationEntitySearchProvider(undefined, {
      firebaseEnv: 'production',
      projectId: 'nearsy-pj',
    });
    assert.equal(provider.id, 'firebase');
    assert.equal(
      resolveAffiliationEntitySearchProviderKindFromEnvironment(
        'production',
        'nearsy-pj',
      ),
      'firebase',
    );
  });

  it('C — missing callable registration falls back to fixture in Development', () => {
    const provider = getAffiliationEntitySearchProvider(undefined, {
      firebaseEnv: 'development',
      projectId: 'nearsy-dev',
    });
    assert.equal(provider.id, 'fixture');
  });

  it('rejects crossed and unknown environment/project pairs', () => {
    assert.equal(
      resolveAffiliationEntitySearchProviderKindFromEnvironment(
        'development',
        'nearsy-pj',
      ),
      'fixture',
    );
    assert.equal(
      resolveAffiliationEntitySearchProviderKindFromEnvironment(
        'production',
        'nearsy-dev',
      ),
      'fixture',
    );
    assert.equal(
      resolveAffiliationEntitySearchProviderKindFromEnvironment(
        'staging',
        'nearsy-pj',
      ),
      'fixture',
    );
    assert.equal(
      resolveAffiliationEntitySearchProviderKindFromEnvironment(
        'production',
        'unknown-project',
      ),
      'fixture',
    );
  });

  it('empty / production env stays on fixture even with a callable', () => {
    registerAffiliationEntitySearchCallable(async () => ({ results: [] }));
    assert.equal(
      resolveAffiliationEntitySearchProviderKindFromEnvironment('', 'nearsy-pj'),
      'fixture',
    );
    const provider = getAffiliationEntitySearchProvider(undefined, {
      firebaseEnv: '',
      projectId: 'nearsy-pj',
    });
    assert.equal(provider.id, 'fixture');
  });
});

describe('CRJ-I9-C Build 48 Store config regression', () => {
  it('Store process.env + Constants.extra selects firebase and invokes callable', async () => {
    // Exact Build 48 Store shape: EAS profile inlines only FIREBASE_ENV;
    // PROJECT_ID lives in expoConfig.extra from app.json / app.config.js.
    delete process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
    process.env.EXPO_PUBLIC_NEARSY_FIREBASE_ENV = 'production';
    setAffiliationExpoExtraForTests({
      EXPO_PUBLIC_NEARSY_FIREBASE_ENV: 'production',
      EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'nearsy-pj',
    });

    let invokedName: string | null = null;
    let invokedQuery: string | null = null;
    registerAffiliationEntitySearchCallable(async (name, data) => {
      invokedName = name;
      invokedQuery = data.query;
      return {
        results: [
          {
            id: 'logo.dev:microsoft.com',
            name: 'Microsoft',
            provider: 'logo.dev',
            domain: 'microsoft.com',
          },
        ],
      };
    });

    // Panel path: no explicit context argument.
    const provider = getAffiliationEntitySearchProvider();
    assert.equal(provider.id, 'firebase');
    assert.notEqual(provider.id, 'fixture');

    const rows = await provider.search('Microsoft', 'professional');
    assert.equal(invokedName, SEARCH_AFFILIATION_ENTITIES_FUNCTION);
    assert.equal(invokedQuery, 'Microsoft');
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.provider, 'logo.dev');
    assert.equal(rows[0]!.name, 'Microsoft');
  });

  it('DEV Constants.extra selects firebase without explicit context', () => {
    delete process.env.EXPO_PUBLIC_NEARSY_FIREBASE_ENV;
    delete process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
    setAffiliationExpoExtraForTests({
      EXPO_PUBLIC_NEARSY_FIREBASE_ENV: 'development',
      EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'nearsy-dev',
    });
    registerAffiliationEntitySearchCallable(async () => ({ results: [] }));
    assert.equal(getAffiliationEntitySearchProvider().id, 'firebase');
  });

  it('crossed env/project from Constants.extra stays fail-closed', () => {
    delete process.env.EXPO_PUBLIC_NEARSY_FIREBASE_ENV;
    delete process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
    setAffiliationExpoExtraForTests({
      EXPO_PUBLIC_NEARSY_FIREBASE_ENV: 'production',
      EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'nearsy-dev',
    });
    registerAffiliationEntitySearchCallable(async () => ({ results: [] }));
    assert.equal(getAffiliationEntitySearchProvider().id, 'fixture');

    setAffiliationExpoExtraForTests({
      EXPO_PUBLIC_NEARSY_FIREBASE_ENV: 'development',
      EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'nearsy-pj',
    });
    assert.equal(getAffiliationEntitySearchProvider().id, 'fixture');
  });
});

describe('CRJ-I9-C shared panel surfaces (CRJ + AffiliationsScreen)', () => {
  it('CRJ ProfileCompletionScreen and AffiliationsScreen share the corrected search path', () => {
    const panel = readSharedSource(
      'components/registration/OnboardingAffiliationCategoryPanel.tsx',
    );
    const crj = readSharedSource('screens/ProfileCompletionScreen.tsx');
    const own = readSharedSource('screens/AffiliationsScreen.tsx');

    assert.ok(panel.includes('getAffiliationEntitySearchProvider()'));
    assert.ok(panel.includes('trimmedQuery.length < 2'));
    assert.ok(panel.includes('SEARCH_DEBOUNCE_MS = 300'));
    assert.ok(
      !panel.includes('getAffiliationEntitySearchProvider(undefined'),
      'panel must call runtime without explicit context',
    );

    assert.ok(crj.includes('OnboardingAffiliationCategoryPanel'));
    assert.ok(own.includes('OnboardingAffiliationCategoryPanel'));
    assert.ok(
      !crj.includes('getAffiliationEntitySearchProvider'),
      'CRJ must not bypass the shared panel provider',
    );
    assert.ok(
      !own.includes('getAffiliationEntitySearchProvider'),
      'AffiliationsScreen must not bypass the shared panel provider',
    );
    assert.ok(!crj.includes('fixtureAffiliationEntitySearchProvider'));
    assert.ok(!own.includes('fixtureAffiliationEntitySearchProvider'));
  });
});

describe('CRJ-I9-C logo URL helper', () => {
  it('A — valid domain + test-only publishable key builds img.logo.dev URL', () => {
    const url = buildLogoDevImageUrl('microsoft.com', 'pk_test_placeholder');
    assert.equal(
      url,
      'https://img.logo.dev/microsoft.com?token=pk_test_placeholder',
    );
  });

  it('B — domain normalization strips scheme and www', () => {
    assert.equal(
      normalizeAffiliationDomain('https://www.Microsoft.com/about'),
      'microsoft.com',
    );
  });

  it('C — missing domain falls back to no URL', () => {
    assert.equal(buildLogoDevImageUrl(undefined, 'pk_test_placeholder'), undefined);
    assert.equal(normalizeAffiliationDomain('not-a-domain'), null);
  });

  it('D — missing publishable key yields no provider logo URL', () => {
    assert.equal(buildLogoDevImageUrl('microsoft.com', undefined), undefined);
    assert.equal(buildLogoDevImageUrl('microsoft.com', ''), undefined);
  });

  it('E — secret keys are rejected by the client helper', () => {
    assert.equal(isLogoDevPublishableKey('sk_test_secret'), false);
    assert.equal(buildLogoDevImageUrl('microsoft.com', 'sk_test_secret'), undefined);
  });

  it('F — custom uploaded logo wins over generated provider URL', () => {
    const custom = resolveAffiliationLogoPresentation({
      name: 'Microsoft',
      categoryId: 'professional',
      logoUrl: 'https://example.com/custom.png',
    });
    assert.equal(custom.kind, 'remote');
    assert.equal(custom.logoUrl, 'https://example.com/custom.png');
  });

  it('G — provider image failure can fall back to initials', () => {
    const fallback = resolveAffiliationLogoPresentation({
      name: 'Microsoft',
      categoryId: 'professional',
      logoUrl: null,
    });
    assert.equal(fallback.kind, 'initials');
  });

  it('does not persist ephemeral Logo.dev URLs', () => {
    assert.equal(
      isEphemeralProviderLogoUrl(
        'https://img.logo.dev/microsoft.com?token=pk_test_placeholder',
      ),
      true,
    );
    const patch = buildCrjAffiliationPersistencePatch('personal', [
      {
        id: 'microsoft.com',
        name: 'Microsoft',
        categoryId: 'professional',
        source: 'provider',
        providerId: 'microsoft.com',
        provider: 'logo.dev',
        website: 'https://microsoft.com',
        logoUrl: 'https://img.logo.dev/microsoft.com?token=pk_test_placeholder',
      },
    ]);
    const row = patch.personalOnboardingAffiliations?.[0];
    assert.equal(row?.logoUrl, undefined);
    assert.equal(row?.providerId, 'microsoft.com');
    assert.equal(row?.provider, 'logo.dev');
    assert.equal(row?.website, 'https://microsoft.com');
    assert.equal(patch.profileSetupCompleted, false);
  });
});

describe('CRJ-I9-C callable errors', () => {
  it('maps Firebase HttpsError codes without exposing raw provider payloads', () => {
    assert.equal(
      mapAffiliationSearchCallableError({ code: 'functions/unauthenticated' })
        .code,
      'UNAUTHENTICATED',
    );
    assert.equal(
      mapAffiliationSearchCallableError({ code: 'functions/failed-precondition' })
        .code,
      'FAILED_PRECONDITION',
    );
    assert.equal(
      mapAffiliationSearchCallableError({ code: 'functions/unavailable' }).code,
      'UNAVAILABLE',
    );
    assert.equal(
      mapAffiliationSearchCallableError({ code: 'app_check_failed' }).code,
      'FAILED_PRECONDITION',
    );
    assert.equal(
      classifyAffiliationSearchFailure(
        mapAffiliationSearchCallableError({ code: 'functions/unauthenticated' }),
      ),
      'auth',
    );
    assert.equal(
      classifyAffiliationSearchFailure(
        mapAffiliationSearchCallableError({ code: 'app_check_failed' }),
      ),
      'app_check',
    );
    assert.equal(
      classifyAffiliationSearchFailure(
        mapAffiliationSearchCallableError({ code: 'functions/unavailable' }),
      ),
      'function_unavailable',
    );
    assert.equal(
      classifyAffiliationSearchFailure(
        new AffiliationEntitySearchClientError('INTERNAL', 'Affiliation search failed.'),
      ),
      'provider',
    );
  });
});

describe('CRJ-I9 isolation', () => {
  it('does not embed secrets or call Logo.dev Search from mobile', () => {
    const runtime = readSharedSource(
      'affiliations/affiliationEntitySearchRuntime.ts',
    );
    const firebase = readSharedSource(
      'affiliations/firebaseAffiliationEntitySearchProvider.ts',
    );
    const panel = readSharedSource(
      'components/registration/OnboardingAffiliationCategoryPanel.tsx',
    );
    const bootstrap = readSharedSource(
      'affiliations/iosAffiliationEntitySearchBootstrap.ios.ts',
    );
    const app = readSharedSource('App.tsx');
    assert.ok(runtime.includes("kind === 'firebase' && registeredCallable"));
    assert.ok(firebase.includes('Never talks to Logo.dev or Brandfetch directly'));
    assert.ok(bootstrap.includes('SEARCH_AFFILIATION_ENTITIES_FUNCTION'));
    assert.ok(bootstrap.includes('invokeAffiliationSearchCallableHttp'));
    assert.ok(bootstrap.includes('environment.functionsRegion'));
    assert.ok(bootstrap.includes('projectId: resolvedProjectId'));
    assert.ok(!bootstrap.includes("projectId: 'nearsy-dev'"));
    assert.ok(bootstrap.includes('appCheck.ensureReady()'));
    assert.ok(bootstrap.includes('firebaseAuth.currentUser'));
    assert.ok(!bootstrap.includes('@react-native-firebase/functions'));
    assert.ok(!bootstrap.includes('httpsCallable(functions'));
    const babel = readFileSync(
      join(here, '../../../../apps/nearsy-ios/babel.config.js'),
      'utf8',
    );
    assert.ok(babel.includes("'@react-native-firebase/auth'"));
    assert.ok(babel.includes('emptyFirebase.js'));
    assert.ok(app.includes('startAffiliationEntitySearchBootstrap()'));
    assert.ok(!panel.includes('LOGO_DEV_SECRET_KEY'));
    assert.ok(!panel.includes('[AffiliationLogo]'));
    assert.ok(!firebase.includes('sk_'));
    assert.ok(!bootstrap.includes('LOGO_DEV_SECRET_KEY'));
    assert.ok(!bootstrap.includes('api.logo.dev'));
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

  it('production app.config extra never receives the Logo.dev publishable key', () => {
    const config = readFileSync(
      join(here, '../../../../apps/nearsy-ios/app.config.js'),
      'utf8',
    );
    const dump = readFileSync(
      join(here, '../../../../apps/nearsy-ios/scripts/_dump-eas-env.cjs'),
      'utf8',
    );
    const prodChunk = config.split('} else {')[1] ?? '';
    assert.ok(config.includes('resolveLogoDevPublishableKey('));
    assert.ok(config.includes('{ required: true }'));
    assert.ok(dump.includes("'EXPO_PUBLIC_LOGO_DEV_PUBLISHABLE_KEY'"));
    assert.ok(prodChunk.includes("EXPO_PUBLIC_NEARSY_FIREBASE_ENV: 'production'"));
    assert.ok(!prodChunk.includes('EXPO_PUBLIC_LOGO_DEV_PUBLISHABLE_KEY'));
    assert.ok(!config.includes('LOGO_DEV_SECRET_KEY'));
    assert.ok(!config.includes('Bearer'));
  });
});

describe('CRJ-I9-C callable HTTP protocol (JS Auth + App Check)', () => {
  it('builds allowlisted callable URLs and rejects unknown projects', () => {
    assert.equal(
      buildAffiliationSearchCallableUrl(
        'nearsy-dev',
        'us-central1',
        'searchAffiliationEntities',
      ),
      'https://us-central1-nearsy-dev.cloudfunctions.net/searchAffiliationEntities',
    );
    assert.equal(
      buildAffiliationSearchCallableUrl(
        'nearsy-pj',
        'us-central1',
        'searchAffiliationEntities',
      ),
      'https://us-central1-nearsy-pj.cloudfunctions.net/searchAffiliationEntities',
    );
    assert.throws(
      () =>
        buildAffiliationSearchCallableUrl(
          'unknown-project',
          'us-central1',
          'searchAffiliationEntities',
        ),
      AffiliationEntitySearchClientError,
    );
  });

  it('unwraps callable HTTP { result } and rejects RNFB { data } wrappers', () => {
    const unwrapped = unwrapFirebaseCallableHttpBody({
      result: {
        results: [
          {
            id: 'logo.dev:microsoft.com',
            name: 'Microsoft',
            domain: 'microsoft.com',
            provider: 'logo.dev',
            providerId: 'microsoft.com',
          },
        ],
      },
    });
    const parsed = parseAffiliationEntitySearchResponse(unwrapped);
    assert.equal(parsed.results.length, 1);
    assert.equal(parsed.results[0]!.name, 'Microsoft');
    assert.equal(parsed.results[0]!.logoUrl, undefined);
    assert.throws(
      () => unwrapFirebaseCallableHttpBody({ data: { results: [] } }),
      AffiliationEntitySearchClientError,
    );
  });

  it('sends JS Auth and App Check headers without using RNFB httpsCallable', async () => {
    const seen: { url?: string; headers?: Record<string, string>; body?: string } =
      {};
    const payload = await invokeAffiliationSearchCallableHttp(
      {
        projectId: 'nearsy-dev',
        region: 'us-central1',
        functionName: 'searchAffiliationEntities',
        idToken: 'test-id-token',
        appCheckToken: 'test-app-check-token',
        data: {
          query: 'Microsoft',
          categoryId: 'professional',
          limit: 8,
        },
      },
      {
        fetchImpl: async (url, init) => {
          seen.url = String(url);
          seen.headers = init?.headers as Record<string, string>;
          seen.body = String(init?.body ?? '');
          return {
            ok: true,
            status: 200,
            json: async () => ({
              result: {
                results: [
                  {
                    id: 'logo.dev:microsoft.com',
                    name: 'Microsoft',
                    domain: 'microsoft.com',
                    provider: 'logo.dev',
                    providerId: 'microsoft.com',
                  },
                ],
              },
            }),
          } as Response;
        },
      },
    );
    assert.equal(
      seen.url,
      'https://us-central1-nearsy-dev.cloudfunctions.net/searchAffiliationEntities',
    );
    assert.equal(seen.headers?.Authorization, 'Bearer test-id-token');
    assert.equal(seen.headers?.['X-Firebase-AppCheck'], 'test-app-check-token');
    assert.deepEqual(JSON.parse(seen.body ?? '{}'), {
      data: { query: 'Microsoft', categoryId: 'professional', limit: 8 },
    });
    const parsed = parseAffiliationEntitySearchResponse(payload);
    assert.equal(parsed.results[0]!.name, 'Microsoft');
  });
});

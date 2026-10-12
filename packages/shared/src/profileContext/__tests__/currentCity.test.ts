/**
 * ANDROID-208 — Current city: contract, search controller, callable transport,
 * write patch and save → Discovery sync ordering.
 *
 * Run:
 *   node --experimental-strip-types --test packages/shared/src/profileContext/__tests__/currentCity.test.ts
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CITY_SEARCH_DEBOUNCE_MS,
  CITY_SEARCH_MAX_LIMIT,
  CitySearchClientError,
  currentCityKey,
  formatCurrentCityPlace,
  hasCityCoordinateKeys,
  isSameCurrentCity,
  mapCitySearchError,
  parseCitySearchResponse,
  parseCurrentCity,
  resolvePreferredCityCountryCode,
  shouldSearchCities,
  type CitySearchRequest,
  type CurrentCity,
} from '../currentCity.ts';
import {
  createCitySearchController,
  type CitySearchState,
} from '../citySearchController.ts';
import {
  buildCitySearchPayload,
  invokeCitySearchCallable,
} from '../citySearchCallable.ts';
import { buildCurrentCityWritePatch } from '../currentCityWrite.ts';
import {
  classifyDiscoveryContextSync,
  createSingleFlight,
  isSaveSessionCurrent,
  persistThenSyncDiscovery,
  syncDiscoveryContextSafely,
} from '../ownProfileSaveFlow.ts';

const city = (
  id: string,
  name: string,
  countryCode: string,
  region?: string,
): CurrentCity => ({
  id,
  provider: 'geonames',
  name,
  countryCode,
  ...(region ? { region } : {}),
});

const SPRINGFIELD_IL = city('4250542', 'Springfield', 'US', 'Illinois');
const SPRINGFIELD_MO = city('4409896', 'Springfield', 'US', 'Missouri');
const SPRINGFIELD_MA = city('4951788', 'Springfield', 'US', 'Massachusetts');
const CORDOBA_AR = city('3860259', 'Córdoba', 'AR', 'Córdoba');
const CORDOBA_ES = city('2519240', 'Córdoba', 'ES', 'Andalusia');
const NEW_YORK = city('5128581', 'New York City', 'US', 'New York');
const LONDON = city('2643743', 'London', 'GB', 'England');
const BOGOTA = city('3688689', 'Bogotá', 'CO', 'Bogota D.C.');
const MEDELLIN = city('3674962', 'Medellín', 'CO', 'Antioquia');

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

describe('currentCity contract', () => {
  it('accepts exactly {id, provider, name, countryCode, region?}', () => {
    assert.deepEqual(parseCurrentCity(SPRINGFIELD_IL), SPRINGFIELD_IL);
    assert.deepEqual(
      parseCurrentCity({ id: '2643743', provider: 'geonames', name: 'London', countryCode: 'GB' }),
      { id: '2643743', provider: 'geonames', name: 'London', countryCode: 'GB' },
    );
  });

  it('rejects coordinates and any extra field', () => {
    for (const key of ['latitude', 'longitude', 'lat', 'lng', 'geohash', 'location', 'population']) {
      assert.equal(parseCurrentCity({ ...LONDON, [key]: 1 }), null, key);
    }
    assert.equal(hasCityCoordinateKeys({ ...LONDON, lat: 51.5 }), true);
    assert.equal(hasCityCoordinateKeys(LONDON), false);
  });

  it('countryCode must be ISO alpha-2 uppercase; provider must be geonames', () => {
    assert.equal(parseCurrentCity({ ...LONDON, countryCode: 'gb' }), null);
    assert.equal(parseCurrentCity({ ...LONDON, countryCode: 'GBR' }), null);
    assert.equal(parseCurrentCity({ ...LONDON, provider: 'google' }), null);
    assert.equal(parseCurrentCity({ ...LONDON, id: 'abc' }), null);
    assert.equal(parseCurrentCity({ ...LONDON, id: 2643743 }), null);
    assert.equal(parseCurrentCity({ ...LONDON, name: '   ' }), null);
    assert.equal(parseCurrentCity({ ...LONDON, region: '' }), null);
  });

  it('malformed values never throw', () => {
    for (const bad of [null, undefined, 'London', 42, [], [LONDON], { nested: LONDON }]) {
      assert.equal(parseCurrentCity(bad), null);
    }
  });

  it('identity is provider + id (same-name cities stay distinct)', () => {
    assert.equal(currentCityKey(SPRINGFIELD_IL), 'geonames:4250542');
    assert.notEqual(currentCityKey(SPRINGFIELD_IL), currentCityKey(SPRINGFIELD_MO));
    assert.equal(isSameCurrentCity(SPRINGFIELD_IL, SPRINGFIELD_MO), false);
    assert.equal(isSameCurrentCity(SPRINGFIELD_IL, { ...SPRINGFIELD_IL }), true);
    assert.equal(isSameCurrentCity(null, undefined), true);
    assert.equal(isSameCurrentCity(SPRINGFIELD_IL, null), false);
  });

  it('a historical profile with only residence has no city', () => {
    const legacyDoc: Record<string, unknown> = { birthCountryCode: 'CO', residenceCountryCode: 'US' };
    assert.equal(parseCurrentCity(legacyDoc.currentCity), null);
  });

  it('formats city, optional region and country (no coordinates)', () => {
    assert.equal(
      formatCurrentCityPlace(SPRINGFIELD_IL, 'United States'),
      'Springfield, Illinois, United States',
    );
    assert.equal(
      formatCurrentCityPlace(city('2643743', 'London', 'GB'), 'Reino Unido'),
      'London, Reino Unido',
    );
  });

  it('preferred country comes from the device region, never location', () => {
    assert.equal(resolvePreferredCityCountryCode([{ regionCode: 'co' }]), 'CO');
    assert.equal(
      resolvePreferredCityCountryCode([{ regionCode: null }, { regionCode: 'MX' }]),
      'MX',
    );
    assert.equal(resolvePreferredCityCountryCode([{ regionCode: '419' }]), null);
    assert.equal(resolvePreferredCityCountryCode(undefined), null);
  });

  it('one-character queries never search', () => {
    assert.equal(shouldSearchCities(''), false);
    assert.equal(shouldSearchCities(' L '), false);
    assert.equal(shouldSearchCities('Lo'), true);
    assert.equal(shouldSearchCities('x'.repeat(81)), false);
  });
});

describe('searchCities response parsing', () => {
  it('keeps the three Springfields distinct and collapses true duplicates', () => {
    const results = parseCitySearchResponse({
      results: [SPRINGFIELD_IL, SPRINGFIELD_MO, SPRINGFIELD_IL, SPRINGFIELD_MA],
    });
    assert.deepEqual(results.map(currentCityKey), [
      'geonames:4250542',
      'geonames:4409896',
      'geonames:4951788',
    ]);
  });

  it('caps at 8 results', () => {
    const many = Array.from({ length: 12 }, (_, i) => city(String(1000 + i), `City ${i}`, 'US'));
    assert.equal(parseCitySearchResponse({ results: many }, 50).length, CITY_SEARCH_MAX_LIMIT);
  });

  it('skips malformed rows but keeps valid ones', () => {
    const results = parseCitySearchResponse({
      results: [{ id: 'x' }, LONDON, { ...BOGOTA, countryCode: 'co' }, 'oops'],
    });
    assert.deepEqual(results, [LONDON]);
  });

  it('rejects malformed envelopes', () => {
    for (const bad of [null, [], { results: null }, { cities: [] }, 'x']) {
      assert.throws(
        () => parseCitySearchResponse(bad),
        (err: unknown) => err instanceof CitySearchClientError && err.code === 'INVALID_RESPONSE',
      );
    }
  });

  it('rejects any response row with coordinates', () => {
    assert.throws(
      () => parseCitySearchResponse({ results: [LONDON, { ...BOGOTA, latitude: 4.6, longitude: -74 }] }),
      (err: unknown) => err instanceof CitySearchClientError && err.code === 'INVALID_RESPONSE',
    );
  });

  it('maps rate limit, auth, cancel and unknown errors without technical text', () => {
    assert.equal(mapCitySearchError({ code: 'functions/resource-exhausted' }).code, 'RATE_LIMITED');
    assert.equal(mapCitySearchError({ code: 'unauthenticated' }).code, 'UNAUTHENTICATED');
    assert.equal(mapCitySearchError({ code: 'functions/cancelled' }).code, 'CANCELLED');
    assert.equal(mapCitySearchError(new Error('socket hang up')).code, 'UNAVAILABLE');
    assert.doesNotMatch(mapCitySearchError(new Error('socket hang up')).message, /socket/);
  });
});

// ---------------------------------------------------------------------------
// Search controller
// ---------------------------------------------------------------------------

type Call = {
  request: CitySearchRequest;
  signal: AbortSignal;
  resolve: (r: CurrentCity[]) => void;
  reject: (e: unknown) => void;
};

function harness(debounceMs = CITY_SEARCH_DEBOUNCE_MS) {
  const calls: Call[] = [];
  const states: CitySearchState[] = [];
  const timers: Array<{ fn: () => void; ms: number; cancelled: boolean }> = [];
  const controller = createCitySearchController({
    debounceMs,
    search: (request, signal) =>
      new Promise<CurrentCity[]>((resolve, reject) => {
        calls.push({ request, signal, resolve, reject });
      }),
    onChange: (s) => states.push(s),
    schedule: (fn, ms) => {
      const t = { fn, ms, cancelled: false };
      timers.push(t);
      return t;
    },
    cancelSchedule: (h) => {
      (h as { cancelled: boolean }).cancelled = true;
    },
  });
  const flush = () => {
    for (const t of timers.splice(0)) if (!t.cancelled) t.fn();
  };
  const tick = () => new Promise((r) => setImmediate(r));
  return { controller, calls, states, timers, flush, tick, last: () => states[states.length - 1] };
}

describe('city search controller', () => {
  it('opening sends an empty query with the device country preference', async () => {
    const h = harness();
    h.controller.open('CO');
    assert.equal(h.calls.length, 1);
    assert.deepEqual(h.calls[0].request, { query: '', limit: 8, preferredCountryCode: 'CO' });
    h.calls[0].resolve([BOGOTA, MEDELLIN]);
    await h.tick();
    assert.deepEqual(h.last(), { status: 'suggestions', query: '', results: [BOGOTA, MEDELLIN] });
  });

  it('without a device country, opening does not hit the network', () => {
    const h = harness();
    h.controller.open(null);
    assert.equal(h.calls.length, 0);
    assert.equal(h.last().status, 'idle');
  });

  it('typed search is worldwide (no preferred country) after a 300 ms debounce', async () => {
    const h = harness();
    h.controller.open('CO');
    h.controller.setQuery('Londres');
    assert.equal(h.timers[0].ms, 300);
    assert.equal(h.calls.length, 1, 'only the opening call before the debounce fires');
    h.flush();
    assert.deepEqual(h.calls[1].request, { query: 'Londres', limit: 8 });
    h.calls[1].resolve([LONDON]);
    await h.tick();
    assert.deepEqual(h.last(), { status: 'results', query: 'Londres', results: [LONDON] });
  });

  it('one character never searches; empty query restores suggestions', async () => {
    const h = harness();
    h.controller.open('US');
    h.calls[0].resolve([NEW_YORK]);
    await h.tick();
    h.controller.setQuery('N');
    h.flush();
    assert.equal(h.calls.length, 1);
    assert.equal(h.last().status, 'idle');
    h.controller.setQuery('');
    assert.deepEqual(h.last(), { status: 'suggestions', query: '', results: [NEW_YORK] });
  });

  it('debounce: rapid typing produces one request for the last query', () => {
    const h = harness();
    h.controller.open(null);
    h.controller.setQuery('Có');
    h.controller.setQuery('Córd');
    h.controller.setQuery('Córdoba');
    assert.equal(h.timers.filter((t) => !t.cancelled).length, 1);
    h.flush();
    assert.equal(h.calls.length, 1);
    assert.equal(h.calls[0].request.query, 'Córdoba');
  });

  it('a new query aborts the previous request and ignores its late answer', async () => {
    const h = harness();
    h.controller.open(null);
    h.controller.setQuery('Nueva York');
    h.flush();
    const first = h.calls[0];
    h.controller.setQuery('Londres');
    assert.equal(first.signal.aborted, true);
    h.flush();
    h.calls[1].resolve([LONDON]);
    await h.tick();
    first.resolve([NEW_YORK]);
    await h.tick();
    assert.deepEqual(h.last(), { status: 'results', query: 'Londres', results: [LONDON] });
  });

  it('out-of-order responses: only the latest query wins', async () => {
    const h = harness();
    h.controller.open(null);
    h.controller.setQuery('Cordoba');
    h.flush();
    h.controller.setQuery('Córdoba');
    h.flush();
    h.calls[1].resolve([CORDOBA_AR, CORDOBA_ES]);
    await h.tick();
    h.calls[0].resolve([]);
    await h.tick();
    assert.deepEqual(h.last(), {
      status: 'results',
      query: 'Córdoba',
      results: [CORDOBA_AR, CORDOBA_ES],
    });
  });

  it('cancellation is silent (no error state)', async () => {
    const h = harness();
    h.controller.open(null);
    h.controller.setQuery('London');
    h.flush();
    h.calls[0].reject(new CitySearchClientError('CANCELLED', 'x'));
    await h.tick();
    assert.equal(h.last().status, 'loading');
  });

  it('network error → unavailable with retry; retry re-runs the same query at once', async () => {
    const h = harness();
    h.controller.open(null);
    h.controller.setQuery('Springfield');
    h.flush();
    h.calls[0].reject(new CitySearchClientError('UNAVAILABLE', 'x'));
    await h.tick();
    assert.deepEqual(h.last(), { status: 'error', query: 'Springfield', reason: 'unavailable' });
    h.controller.retry();
    assert.equal(h.calls.length, 2);
    assert.equal(h.calls[1].request.query, 'Springfield');
    h.calls[1].resolve([SPRINGFIELD_IL, SPRINGFIELD_MO]);
    await h.tick();
    assert.equal(h.last().status, 'results');
  });

  it('rate limit → rate-limited reason (temporary, retryable)', async () => {
    const h = harness();
    h.controller.open(null);
    h.controller.setQuery('Lon');
    h.flush();
    h.calls[0].reject(new CitySearchClientError('RATE_LIMITED', 'x'));
    await h.tick();
    assert.deepEqual(h.last(), { status: 'error', query: 'Lon', reason: 'rate-limited' });
  });

  it('failed suggestions offer retry and reload suggestions', async () => {
    const h = harness();
    h.controller.open('AR');
    h.calls[0].reject(new CitySearchClientError('UNAVAILABLE', 'x'));
    await h.tick();
    assert.equal(h.last().status, 'error');
    h.controller.retry();
    assert.deepEqual(h.calls[1].request, { query: '', limit: 8, preferredCountryCode: 'AR' });
  });

  it('no results → empty state', async () => {
    const h = harness();
    h.controller.open(null);
    h.controller.setQuery('Zzzzqq');
    h.flush();
    h.calls[0].resolve([]);
    await h.tick();
    assert.deepEqual(h.last(), { status: 'empty', query: 'Zzzzqq' });
  });

  it('dispose aborts in-flight work and drops late answers', async () => {
    const h = harness();
    h.controller.open(null);
    h.controller.setQuery('London');
    h.flush();
    const count = h.states.length;
    h.controller.dispose();
    assert.equal(h.calls[0].signal.aborted, true);
    h.calls[0].resolve([LONDON]);
    await h.tick();
    assert.equal(h.states.length, count);
  });
});

// ---------------------------------------------------------------------------
// Callable transport
// ---------------------------------------------------------------------------

type FetchCall = { url: string; init: RequestInit };

function fakeFetch(
  respond: (call: FetchCall) => { status: number; body: unknown } | Promise<never>,
) {
  const calls: FetchCall[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const call = { url, init };
    calls.push(call);
    const out = await respond(call);
    return {
      ok: out.status >= 200 && out.status < 300,
      status: out.status,
      json: async () => out.body,
    };
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

const BASE = {
  projectId: 'nearsy-dev',
  region: 'us-central1',
  idToken: 'id-token',
  appCheckToken: 'app-check-token',
};

describe('searchCities callable', () => {
  it('payload sends preferredCountryCode only with the empty query', () => {
    assert.deepEqual(
      buildCitySearchPayload({ query: '', limit: 8, preferredCountryCode: 'co' }),
      { query: '', limit: 8, preferredCountryCode: 'CO' },
    );
    assert.deepEqual(
      buildCitySearchPayload({ query: 'Londres', limit: 8, preferredCountryCode: 'CO' }),
      { query: 'Londres', limit: 8 },
    );
    assert.deepEqual(buildCitySearchPayload({ query: '  Nueva   York ', limit: 99 }), {
      query: 'Nueva York',
      limit: 8,
    });
  });

  it('keeps the accent as typed (Córdoba vs Cordoba both reach the server)', () => {
    assert.equal(buildCitySearchPayload({ query: 'Córdoba', limit: 8 }).query, 'Córdoba');
    assert.equal(buildCitySearchPayload({ query: 'Cordoba', limit: 8 }).query, 'Cordoba');
  });

  it('calls us-central1 searchCities with Auth + App Check headers', async () => {
    const f = fakeFetch(() => ({ status: 200, body: { result: { results: [NEW_YORK] } } }));
    const results = await invokeCitySearchCallable(
      { ...BASE, request: { query: 'Nueva York', limit: 8 } },
      { fetchImpl: f.fetchImpl },
    );
    assert.deepEqual(results, [NEW_YORK]);
    assert.equal(f.calls[0].url, 'https://us-central1-nearsy-dev.cloudfunctions.net/searchCities');
    const headers = f.calls[0].init.headers as Record<string, string>;
    assert.equal(headers.Authorization, 'Bearer id-token');
    assert.equal(headers['X-Firebase-AppCheck'], 'app-check-token');
    assert.deepEqual(JSON.parse(String(f.calls[0].init.body)), {
      data: { query: 'Nueva York', limit: 8 },
    });
  });

  it('refuses unknown projects or regions before any network call', async () => {
    const f = fakeFetch(() => ({ status: 200, body: { result: { results: [] } } }));
    for (const bad of [{ projectId: 'other' }, { region: 'europe-west1' }]) {
      await assert.rejects(
        invokeCitySearchCallable(
          { ...BASE, ...bad, request: { query: 'London', limit: 8 } },
          { fetchImpl: f.fetchImpl },
        ),
        (err: unknown) => err instanceof CitySearchClientError && err.code === 'UNAVAILABLE',
      );
    }
    assert.equal(f.calls.length, 0);
  });

  it('resource-exhausted → RATE_LIMITED', async () => {
    const f = fakeFetch(() => ({
      status: 429,
      body: { error: { status: 'RESOURCE_EXHAUSTED', message: 'quota' } },
    }));
    await assert.rejects(
      invokeCitySearchCallable({ ...BASE, request: { query: 'London', limit: 8 } }, f),
      (err: unknown) => err instanceof CitySearchClientError && err.code === 'RATE_LIMITED',
    );
  });

  it('network failure → UNAVAILABLE; 401 → UNAUTHENTICATED', async () => {
    const down = fakeFetch(() => Promise.reject(new TypeError('Network request failed')));
    await assert.rejects(
      invokeCitySearchCallable({ ...BASE, request: { query: 'London', limit: 8 } }, down),
      (err: unknown) => err instanceof CitySearchClientError && err.code === 'UNAVAILABLE',
    );
    const unauth = fakeFetch(() => ({ status: 401, body: {} }));
    await assert.rejects(
      invokeCitySearchCallable({ ...BASE, request: { query: 'London', limit: 8 } }, unauth),
      (err: unknown) => err instanceof CitySearchClientError && err.code === 'UNAUTHENTICATED',
    );
  });

  it('malformed or coordinate-bearing responses → INVALID_RESPONSE', async () => {
    for (const result of [{ cities: [] }, { results: [{ ...LONDON, lat: 51.5, lng: -0.1 }] }]) {
      const f = fakeFetch(() => ({ status: 200, body: { result } }));
      await assert.rejects(
        invokeCitySearchCallable({ ...BASE, request: { query: 'London', limit: 8 } }, f),
        (err: unknown) => err instanceof CitySearchClientError && err.code === 'INVALID_RESPONSE',
      );
    }
  });

  it('caller abort → CANCELLED (not a timeout or network error)', async () => {
    const abort = new AbortController();
    const f = fakeFetch(
      ({ init }) =>
        new Promise<never>((_, reject) => {
          init.signal?.addEventListener('abort', () => {
            const err = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }),
    );
    const pending = invokeCitySearchCallable(
      { ...BASE, request: { query: 'London', limit: 8 }, signal: abort.signal },
      f,
    );
    abort.abort();
    await assert.rejects(
      pending,
      (err: unknown) => err instanceof CitySearchClientError && err.code === 'CANCELLED',
    );
  });

  it('errors never echo the query or tokens', async () => {
    const f = fakeFetch(() => ({
      status: 500,
      body: { error: { status: 'INTERNAL', message: 'boom Springfield id-token' } },
    }));
    await assert.rejects(
      invokeCitySearchCallable({ ...BASE, request: { query: 'Springfield', limit: 8 } }, f),
      (err: unknown) =>
        err instanceof CitySearchClientError &&
        !/Springfield|id-token|app-check-token/.test(err.message),
    );
  });
});

// ---------------------------------------------------------------------------
// Write patch (select / change / remove)
// ---------------------------------------------------------------------------

describe('currentCity write patch', () => {
  const DELETE = Symbol('delete');

  it('CRJ without a city writes nothing for the city', () => {
    assert.deepEqual(buildCurrentCityWritePatch(null, null, DELETE), {});
  });

  it('select writes only the contract fields', () => {
    assert.deepEqual(buildCurrentCityWritePatch(LONDON, null, DELETE), {
      currentCity: { ...LONDON },
    });
  });

  it('change between same-name cities writes the new id', () => {
    const patch = buildCurrentCityWritePatch(SPRINGFIELD_MO, SPRINGFIELD_IL, DELETE);
    assert.equal((patch.currentCity as CurrentCity).id, '4409896');
  });

  it('remove deletes the field entirely', () => {
    assert.deepEqual(buildCurrentCityWritePatch(null, LONDON, DELETE), {
      currentCity: DELETE,
    });
  });

  it('unchanged or malformed next value writes nothing', () => {
    assert.deepEqual(buildCurrentCityWritePatch({ ...LONDON }, LONDON, DELETE), {});
    assert.deepEqual(
      buildCurrentCityWritePatch({ ...LONDON, lat: 1 } as unknown as CurrentCity, null, DELETE),
      {},
    );
  });
});

// ---------------------------------------------------------------------------
// Save → Discovery sync
// ---------------------------------------------------------------------------

const synced = (currentCity?: CurrentCity | null) =>
  ({
    kind: 'synced',
    response: {
      contractVersion: 1,
      synced: true,
      serverTime: 1,
      ...(currentCity !== undefined ? { currentCity } : {}),
    },
  }) as const;

describe('save then Discovery sync', () => {
  it('writes first, then syncs', async () => {
    const order: string[] = [];
    const result = await persistThenSyncDiscovery({
      write: async () => {
        order.push('write');
      },
      isCurrent: () => true,
      onPersisted: () => order.push('persisted'),
      expectedCity: LONDON,
      sync: async () => {
        order.push('sync');
        return synced(LONDON) as never;
      },
    });
    assert.deepEqual(order, ['write', 'persisted', 'sync']);
    assert.equal(result, 'synced');
  });

  it('a failed write never calls the sync', async () => {
    let syncCalls = 0;
    await assert.rejects(
      persistThenSyncDiscovery({
        write: async () => {
          throw new Error('permission-denied');
        },
        isCurrent: () => true,
        onPersisted: () => assert.fail('must not apply'),
        expectedCity: null,
        sync: async () => {
          syncCalls += 1;
          return synced() as never;
        },
      }),
    );
    assert.equal(syncCalls, 0);
  });

  it('a failed sync keeps the write (no rewrite, no rollback) and reports failed', async () => {
    let writes = 0;
    const result = await persistThenSyncDiscovery({
      write: async () => {
        writes += 1;
      },
      isCurrent: () => true,
      onPersisted: () => undefined,
      expectedCity: LONDON,
      sync: async () => {
        throw new Error('unavailable');
      },
    });
    assert.equal(result, 'failed');
    assert.equal(writes, 1);
  });

  it('retry runs only the sync', async () => {
    let syncCalls = 0;
    const status = await syncDiscoveryContextSafely(async () => {
      syncCalls += 1;
      return synced(LONDON) as never;
    }, LONDON);
    assert.equal(status, 'synced');
    assert.equal(syncCalls, 1);
  });

  it('removal publishes currentCity: null; a stale echo is a failure', () => {
    assert.equal(classifyDiscoveryContextSync(synced(null) as never, null), 'synced');
    assert.equal(classifyDiscoveryContextSync(synced(LONDON) as never, null), 'failed');
    assert.equal(classifyDiscoveryContextSync(synced() as never, LONDON), 'synced');
    assert.equal(
      classifyDiscoveryContextSync({ kind: 'not_synced' } as never, LONDON),
      'not-projected',
    );
  });

  it('a late response for another user or an unmounted screen is ignored', async () => {
    let current = true;
    let applied = false;
    let syncCalls = 0;
    const result = await persistThenSyncDiscovery({
      write: async () => {
        current = false;
      },
      isCurrent: () => current,
      onPersisted: () => {
        applied = true;
      },
      expectedCity: LONDON,
      sync: async () => {
        syncCalls += 1;
        return synced(LONDON) as never;
      },
    });
    assert.equal(result, 'stale');
    assert.equal(applied, false);
    assert.equal(syncCalls, 0);

    assert.equal(isSaveSessionCurrent({ startedUid: 'a', currentUid: 'a', mounted: true }), true);
    assert.equal(isSaveSessionCurrent({ startedUid: 'a', currentUid: 'b', mounted: true }), false);
    assert.equal(isSaveSessionCurrent({ startedUid: 'a', currentUid: 'a', mounted: false }), false);
    assert.equal(isSaveSessionCurrent({ startedUid: 'a', currentUid: null, mounted: true }), false);
  });

  it('double tap does not duplicate saves', async () => {
    const flight = createSingleFlight();
    let writes = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const save = async () => {
      writes += 1;
      await gate;
    };
    const first = flight.run(save);
    const second = flight.run(save);
    assert.equal(await second, undefined);
    release();
    await first;
    assert.equal(writes, 1);
    await flight.run(save);
    assert.equal(writes, 2);
  });
});

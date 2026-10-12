/**
 * IOS-208-CURRENT-CITY-01 — optional current city (GeoNames via Functions).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { deleteField } from 'firebase/firestore';

import enOnboarding from '../i18n/resources/onboarding';
import enProfile from '../i18n/resources/profile';
import enDiscoveryProfile from '../i18n/resources/discoveryProfile';
import es from '../i18n/locales/es';
import { invokeFirebaseCallableHttp } from '../firebase/callableHttp';
import {
  CITY_SEARCH_DEFAULT_LIMIT,
  CITY_SEARCH_MAX_LIMIT,
  CitySearchClientError,
  formatCurrentCityPlace,
  isSameCurrentCity,
  parseCitySearchResponse,
  parseCurrentCity,
  resolvePreferredCityCountryCode,
  shouldSearchCities,
  type CitySearchRequest,
  type CurrentCity,
} from '../profile/currentCity';
import { buildCurrentCityWritePatch } from '../profile/currentCityWrite';
import {
  createCitySearchController,
  type CitySearchState,
} from '../profile/citySearchController';
import { invokeCitySearchCallable } from '../profile/citySearchCallable';
import { searchCitiesRemote } from '../profile/citySearchRuntime';
import {
  areProfileContextFieldsComplete,
  buildProfileContextWritePatch,
  isCrjProfileContextOriginValid,
  parseUserProfileContext,
} from '../profile/profileContextFields';
import {
  buildOwnProfileContextSavePatch,
  createOwnProfileDraftFromDoc,
  createOwnProfileSnapshot,
  isOwnProfileDraftDirty,
  type OwnProfileDraft,
} from '../profile/ownProfileEditorState';
import { parseGetDiscoveryProfileResponse } from '../visibility/callables';

const ROOT = join(__dirname, '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

const SPRINGFIELD_IL: CurrentCity = {
  id: '4250542',
  provider: 'geonames',
  name: 'Springfield',
  countryCode: 'US',
  region: 'Illinois',
};
const SPRINGFIELD_MO: CurrentCity = {
  id: '4409896',
  provider: 'geonames',
  name: 'Springfield',
  countryCode: 'US',
  region: 'Missouri',
};
const CORDOBA_AR: CurrentCity = {
  id: '3860259',
  provider: 'geonames',
  name: 'Córdoba',
  countryCode: 'AR',
  region: 'Córdoba',
};
const CORDOBA_ES: CurrentCity = {
  id: '2519240',
  provider: 'geonames',
  name: 'Córdoba',
  countryCode: 'ES',
  region: 'Andalusia',
};

const baseDraft: OwnProfileDraft = {
  realName: 'Ana',
  lastName: 'García',
  profileImage: 'https://cdn.example/ana.jpg',
  occupation: 'Engineer',
  bio: 'Hello nearby',
  company: '',
  birthCountryCode: 'CO',
  currentCity: null,
  languageCodes: ['es'],
};

const DELETE_SENTINEL = deleteField();
function isDeleteSentinel(value: unknown): boolean {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as object).constructor === DELETE_SENTINEL.constructor
  );
}

describe('currentCity contract parsing', () => {
  it('accepts the contract and keeps only its fields', () => {
    const parsed = parseCurrentCity({
      ...SPRINGFIELD_IL,
      countryCode: 'us',
      lat: 39.8,
      lng: -89.6,
      population: 114394,
      admin1Code: 'IL',
    });
    assert.deepEqual(parsed, SPRINGFIELD_IL);
  });

  it('region is optional', () => {
    const { region: _region, ...noRegion } = SPRINGFIELD_IL;
    assert.deepEqual(parseCurrentCity(noRegion), noRegion);
  });

  it('rejects free text, unknown providers and invented ids', () => {
    assert.equal(parseCurrentCity('Springfield'), null);
    assert.equal(parseCurrentCity({ name: 'Springfield', countryCode: 'US' }), null);
    assert.equal(parseCurrentCity({ ...SPRINGFIELD_IL, provider: 'google' }), null);
    assert.equal(parseCurrentCity({ ...SPRINGFIELD_IL, id: '' }), null);
    assert.equal(parseCurrentCity({ ...SPRINGFIELD_IL, id: 'abc' }), null);
    assert.equal(parseCurrentCity({ ...SPRINGFIELD_IL, id: 4250542 }), null);
    assert.equal(parseCurrentCity({ ...SPRINGFIELD_IL, id: '0' }), null);
    assert.equal(parseCurrentCity({ ...SPRINGFIELD_IL, name: '   ' }), null);
    assert.equal(parseCurrentCity({ ...SPRINGFIELD_IL, countryCode: 'ZZZ' }), null);
    assert.equal(parseCurrentCity({ ...SPRINGFIELD_IL, name: 'x'.repeat(121) }), null);
  });

  it('same-name cities in different regions or countries stay distinct', () => {
    assert.equal(isSameCurrentCity(SPRINGFIELD_IL, SPRINGFIELD_MO), false);
    assert.equal(isSameCurrentCity(CORDOBA_AR, CORDOBA_ES), false);
    assert.equal(isSameCurrentCity(SPRINGFIELD_IL, { ...SPRINGFIELD_IL }), true);
    assert.equal(isSameCurrentCity(null, null), true);
    assert.equal(isSameCurrentCity(null, SPRINGFIELD_IL), false);
  });

  it('formats city + region + country, region only when available', () => {
    assert.equal(
      formatCurrentCityPlace(SPRINGFIELD_IL, 'United States'),
      'Springfield, Illinois, United States',
    );
    const { region: _region, ...noRegion } = CORDOBA_ES;
    assert.equal(formatCurrentCityPlace(noRegion, 'Spain'), 'Córdoba, Spain');
  });
});

describe('searchCities response validation', () => {
  it('malformed envelopes throw INVALID_RESPONSE', () => {
    for (const bad of [null, [], 'x', {}, { results: 'x' }, { data: [] }]) {
      assert.throws(
        () => parseCitySearchResponse(bad),
        (err: unknown) =>
          err instanceof CitySearchClientError && err.code === 'INVALID_RESPONSE',
      );
    }
  });

  it('skips malformed rows, collapses duplicates, strips coordinates, caps results', () => {
    const rows = [
      { ...SPRINGFIELD_IL, lat: 1, lng: 2 },
      { ...SPRINGFIELD_IL },
      { name: 'No id', countryCode: 'US', provider: 'geonames' },
      SPRINGFIELD_MO,
      'free text',
      CORDOBA_AR,
      CORDOBA_ES,
    ];
    const parsed = parseCitySearchResponse({ results: rows }, 3);
    assert.deepEqual(parsed, [SPRINGFIELD_IL, SPRINGFIELD_MO, CORDOBA_AR]);
    for (const city of parsed) {
      assert.equal('lat' in city, false);
      assert.equal('lng' in city, false);
    }
  });

  it('limit is clamped to the contract maximum', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      ...SPRINGFIELD_IL,
      id: String(1000 + i),
    }));
    assert.equal(parseCitySearchResponse({ results: many }, 99).length, CITY_SEARCH_MAX_LIMIT);
  });
});

describe('query rules and regional preference', () => {
  it('requires 2..80 characters after trimming', () => {
    assert.equal(shouldSearchCities(''), false);
    assert.equal(shouldSearchCities(' a '), false);
    assert.equal(shouldSearchCities('ca'), true);
    assert.equal(shouldSearchCities('x'.repeat(81)), false);
  });

  it('device region is a hint from locale data, never a location', () => {
    assert.equal(
      resolvePreferredCityCountryCode([{ regionCode: null }, { regionCode: 'co' }]),
      'CO',
    );
    assert.equal(resolvePreferredCityCountryCode([]), null);
    assert.equal(resolvePreferredCityCountryCode(undefined), null);
  });
});

type FakeCall = {
  request: CitySearchRequest;
  signal: AbortSignal;
  resolve: (cities: CurrentCity[]) => void;
  reject: (err: unknown) => void;
};

function harness() {
  const calls: FakeCall[] = [];
  const states: CitySearchState[] = [];
  const timers: Array<{ fn: () => void; cancelled: boolean }> = [];
  const controller = createCitySearchController({
    search: (request, signal) =>
      new Promise<CurrentCity[]>((resolve, reject) => {
        calls.push({ request, signal, resolve, reject });
      }),
    onChange: (state) => states.push(state),
    schedule: (fn) => {
      const timer = { fn, cancelled: false };
      timers.push(timer);
      return timer;
    },
    cancelSchedule: (handle) => {
      (handle as { cancelled: boolean }).cancelled = true;
    },
  });
  const flushTimers = () => {
    for (const timer of timers.splice(0)) {
      if (!timer.cancelled) timer.fn();
    }
  };
  const tick = () => new Promise((r) => setImmediate(r));
  const last = () => states[states.length - 1];
  return { controller, calls, states, flushTimers, tick, last };
}

describe('city search controller', () => {
  it('opening with a device region asks for suggestions in that country', async () => {
    const h = harness();
    h.controller.open('CO');
    assert.equal(h.calls.length, 1);
    assert.deepEqual(h.calls[0].request, {
      query: '',
      limit: CITY_SEARCH_DEFAULT_LIMIT,
      preferredCountryCode: 'CO',
    });
    h.calls[0].resolve([CORDOBA_AR]);
    await h.tick();
    assert.deepEqual(h.last(), { status: 'suggestions', query: '', results: [CORDOBA_AR] });
  });

  it('typing searches globally without the regional hint', async () => {
    const h = harness();
    h.controller.open('CO');
    h.controller.setQuery('cordoba');
    h.flushTimers();
    const typed = h.calls[h.calls.length - 1];
    assert.deepEqual(typed.request, { query: 'cordoba', limit: CITY_SEARCH_DEFAULT_LIMIT });
    assert.equal('preferredCountryCode' in typed.request, false);
    typed.resolve([CORDOBA_AR, CORDOBA_ES]);
    await h.tick();
    assert.deepEqual(h.last(), {
      status: 'results',
      query: 'cordoba',
      results: [CORDOBA_AR, CORDOBA_ES],
    });
  });

  it('without a device region opens idle and makes no request', () => {
    const h = harness();
    h.controller.open(null);
    assert.equal(h.calls.length, 0);
    assert.deepEqual(h.last(), { status: 'idle', query: '' });
  });

  it('below the minimum length it does not search', () => {
    const h = harness();
    h.controller.open(null);
    h.controller.setQuery('c');
    h.flushTimers();
    assert.equal(h.calls.length, 0);
    assert.deepEqual(h.last(), { status: 'idle', query: 'c' });
  });

  it('debounces fast typing into a single request', () => {
    const h = harness();
    h.controller.open(null);
    h.controller.setQuery('sp');
    h.controller.setQuery('spr');
    h.controller.setQuery('spri');
    h.controller.setQuery('spring');
    h.flushTimers();
    assert.equal(h.calls.length, 1);
    assert.equal(h.calls[0].request.query, 'spring');
  });

  it('cancels the in-flight request and ignores out-of-order responses', async () => {
    const h = harness();
    h.controller.open(null);
    h.controller.setQuery('spr');
    h.flushTimers();
    const first = h.calls[0];
    h.controller.setQuery('springfield');
    assert.equal(first.signal.aborted, true);
    h.flushTimers();
    const second = h.calls[1];
    second.resolve([SPRINGFIELD_IL, SPRINGFIELD_MO]);
    await h.tick();
    first.resolve([CORDOBA_AR]);
    await h.tick();
    assert.deepEqual(h.last(), {
      status: 'results',
      query: 'springfield',
      results: [SPRINGFIELD_IL, SPRINGFIELD_MO],
    });
  });

  it('a cancelled request never surfaces as an error', async () => {
    const h = harness();
    h.controller.open(null);
    h.controller.setQuery('spr');
    h.flushTimers();
    h.calls[0].reject(new CitySearchClientError('CANCELLED', 'x'));
    await h.tick();
    assert.notEqual(h.last().status, 'error');
  });

  it('network errors show the friendly error state', async () => {
    const h = harness();
    h.controller.open(null);
    h.controller.setQuery('spr');
    h.flushTimers();
    h.calls[0].reject(new CitySearchClientError('UNAVAILABLE', 'x'));
    await h.tick();
    assert.deepEqual(h.last(), { status: 'error', query: 'spr' });
  });

  it('a failed suggestion request falls back silently to idle', async () => {
    const h = harness();
    h.controller.open('US');
    h.calls[0].reject(new CitySearchClientError('UNAVAILABLE', 'x'));
    await h.tick();
    assert.deepEqual(h.last(), { status: 'idle', query: '' });
  });

  it('no results shows the empty state', async () => {
    const h = harness();
    h.controller.open(null);
    h.controller.setQuery('zzzz');
    h.flushTimers();
    h.calls[0].resolve([]);
    await h.tick();
    assert.deepEqual(h.last(), { status: 'empty', query: 'zzzz' });
  });

  it('clearing the query brings suggestions back without a new request', async () => {
    const h = harness();
    h.controller.open('AR');
    h.calls[0].resolve([CORDOBA_AR]);
    await h.tick();
    h.controller.setQuery('spr');
    h.controller.setQuery('');
    h.flushTimers();
    assert.equal(h.calls.length, 1);
    assert.deepEqual(h.last(), { status: 'suggestions', query: '', results: [CORDOBA_AR] });
  });

  it('dispose aborts and silences late responses', async () => {
    const h = harness();
    h.controller.open(null);
    h.controller.setQuery('spr');
    h.flushTimers();
    const count = h.states.length;
    h.controller.dispose();
    assert.equal(h.calls[0].signal.aborted, true);
    h.calls[0].resolve([SPRINGFIELD_IL]);
    await h.tick();
    assert.equal(h.states.length, count);
  });
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const callableInput = (request: CitySearchRequest, signal?: AbortSignal) => ({
  projectId: 'nearsy-dev',
  region: 'us-central1',
  idToken: 'id-token',
  appCheckToken: 'app-check',
  request,
  signal,
});

describe('searchCities callable transport', () => {
  it('sends the request to the Nearsy Function and parses results', async () => {
    let seenUrl = '';
    let seenBody: unknown = null;
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seenUrl = url;
      seenBody = JSON.parse(String(init.body));
      return jsonResponse(200, { result: { results: [SPRINGFIELD_IL] } });
    }) as unknown as typeof fetch;
    const out = await invokeCitySearchCallable(
      callableInput({ query: 'spring', limit: 8 }),
      { fetchImpl },
    );
    assert.equal(seenUrl, 'https://us-central1-nearsy-dev.cloudfunctions.net/searchCities');
    assert.doesNotMatch(seenUrl, /geonames/i);
    assert.deepEqual(seenBody, { data: { query: 'spring', limit: 8 } });
    assert.deepEqual(out, [SPRINGFIELD_IL]);
  });

  it('a Function that is not deployed yet (404) maps to UNAVAILABLE', async () => {
    const fetchImpl = (async () => jsonResponse(404, {})) as unknown as typeof fetch;
    await assert.rejects(
      invokeCitySearchCallable(callableInput({ query: 'spring', limit: 8 }), { fetchImpl }),
      (err: unknown) => err instanceof CitySearchClientError && err.code === 'UNAVAILABLE',
    );
  });

  it('network failure maps to UNAVAILABLE', async () => {
    const fetchImpl = (async () => {
      throw new TypeError('Network request failed');
    }) as unknown as typeof fetch;
    await assert.rejects(
      invokeCitySearchCallable(callableInput({ query: 'spring', limit: 8 }), { fetchImpl }),
      (err: unknown) => err instanceof CitySearchClientError && err.code === 'UNAVAILABLE',
    );
  });

  it('malformed payload maps to INVALID_RESPONSE', async () => {
    const fetchImpl = (async () =>
      jsonResponse(200, { result: { cities: [] } })) as unknown as typeof fetch;
    await assert.rejects(
      invokeCitySearchCallable(callableInput({ query: 'spring', limit: 8 }), { fetchImpl }),
      (err: unknown) => err instanceof CitySearchClientError && err.code === 'INVALID_RESPONSE',
    );
  });

  it('401 maps to UNAUTHENTICATED', async () => {
    const fetchImpl = (async () => jsonResponse(401, {})) as unknown as typeof fetch;
    await assert.rejects(
      invokeCitySearchCallable(callableInput({ query: 'spring', limit: 8 }), { fetchImpl }),
      (err: unknown) => err instanceof CitySearchClientError && err.code === 'UNAUTHENTICATED',
    );
  });

  it('caller abort maps to CANCELLED and aborts the fetch', async () => {
    const controller = new AbortController();
    let fetchSignal: AbortSignal | undefined;
    const fetchImpl = ((_url: string, init: RequestInit) => {
      fetchSignal = init.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    }) as unknown as typeof fetch;
    const pending = invokeCitySearchCallable(
      callableInput({ query: 'spring', limit: 8 }, controller.signal),
      { fetchImpl },
    );
    controller.abort();
    await assert.rejects(
      pending,
      (err: unknown) => err instanceof CitySearchClientError && err.code === 'CANCELLED',
    );
    assert.equal(fetchSignal?.aborted, true);
  });

  it('an already-aborted signal never reaches the network', async () => {
    const controller = new AbortController();
    controller.abort();
    let fetched = false;
    const fetchImpl = (async () => {
      fetched = true;
      return jsonResponse(200, { result: { results: [] } });
    }) as unknown as typeof fetch;
    await assert.rejects(
      invokeFirebaseCallableHttp(
        {
          url: 'https://us-central1-nearsy-dev.cloudfunctions.net/searchCities',
          idToken: 'id',
          appCheckToken: 'ac',
          data: {},
          signal: controller.signal,
        },
        { fetchImpl },
      ),
      (err: unknown) => (err as { code?: string }).code === 'functions/cancelled',
    );
    assert.equal(fetched, false);
  });

  it('unknown projects are refused before any request', async () => {
    let fetched = false;
    const fetchImpl = (async () => {
      fetched = true;
      return jsonResponse(200, {});
    }) as unknown as typeof fetch;
    await assert.rejects(
      invokeCitySearchCallable(
        { ...callableInput({ query: 'spring', limit: 8 }), projectId: 'other' },
        { fetchImpl },
      ),
      (err: unknown) => err instanceof CitySearchClientError && err.code === 'UNAVAILABLE',
    );
    assert.equal(fetched, false);
  });

  it('non-iOS runtime is unavailable instead of inventing results', async () => {
    await assert.rejects(
      searchCitiesRemote({ query: 'spring', limit: 8 }, new AbortController().signal),
      (err: unknown) => err instanceof CitySearchClientError && err.code === 'UNAVAILABLE',
    );
  });
});

describe('currentCity writes', () => {
  it('unchanged city writes nothing', () => {
    assert.deepEqual(buildCurrentCityWritePatch(null, null), {});
    assert.deepEqual(buildCurrentCityWritePatch(SPRINGFIELD_IL, { ...SPRINGFIELD_IL }), {});
  });

  it('a new or changed selection writes only contract fields', () => {
    const patch = buildCurrentCityWritePatch({ ...SPRINGFIELD_MO, lat: 1 } as never, SPRINGFIELD_IL);
    assert.deepEqual(patch, { currentCity: SPRINGFIELD_MO });
  });

  it('removing the city deletes the field (real absence)', () => {
    const patch = buildCurrentCityWritePatch(null, SPRINGFIELD_IL);
    assert.deepEqual(Object.keys(patch), ['currentCity']);
    assert.equal(isDeleteSentinel(patch.currentCity), true);
  });

  it('free text can never be written', () => {
    assert.deepEqual(buildCurrentCityWritePatch('Springfield' as never, null), {});
    assert.deepEqual(
      buildCurrentCityWritePatch({ name: 'Springfield', countryCode: 'US' } as never, null),
      {},
    );
  });

  it('context patch never writes residenceCountryCode', () => {
    const patch = buildProfileContextWritePatch({
      birthCountryCode: 'CO',
      residenceCountryCode: 'US',
    } as never);
    assert.deepEqual(patch, { birthCountryCode: 'CO' });
  });
});

describe('historical profiles with only residenceCountryCode', () => {
  const legacyDoc = {
    birthCountryCode: 'CO',
    residenceCountryCode: 'US',
    languageCodes: ['es', 'en'],
  };

  it('residence is not read and never becomes a city', () => {
    const ctx = parseUserProfileContext(legacyDoc);
    assert.deepEqual(ctx, {
      birthCountryCode: 'CO',
      currentCity: null,
      languageCodes: ['es', 'en'],
    });
    assert.equal(areProfileContextFieldsComplete(ctx), true);
  });

  it('saving the editor without touching the city writes no city and no residence', () => {
    const draft = createOwnProfileDraftFromDoc(legacyDoc, {
      realName: 'Ana',
      lastName: 'García',
      profileImage: 'https://cdn.example/ana.jpg',
      occupation: 'Engineer',
      bio: 'Hi',
      company: '',
    } as never);
    const snapshot = createOwnProfileSnapshot(draft);
    const patch = buildOwnProfileContextSavePatch(draft, snapshot);
    assert.deepEqual(Object.keys(patch).sort(), ['birthCountryCode', 'languageCodes']);
  });

  it('Discovery ignores a legacy residence projection', () => {
    const parsed = parseGetDiscoveryProfileResponse({
      contractVersion: 1,
      uid: 'peer',
      distanceMeters: 10,
      profile: {
        mode: 'personal',
        displayName: 'Alex',
        profileImage: null,
        occupation: '',
        interestIds: [],
        company: '',
        bio: '',
        birthCountryCode: 'CO',
        residenceCountryCode: 'US',
        languageCodes: ['es'],
      },
      gallery: [],
      socialLinks: [],
      affiliations: [],
      serverTime: 1,
    });
    assert.equal(parsed.profile.currentCity, null);
    assert.equal('residenceCountryCode' in parsed.profile, false);
  });
});

describe('Own Profile editor city state', () => {
  it('adding, changing and removing the city are dirty and saved', () => {
    const snapshot = createOwnProfileSnapshot(baseDraft);
    const added = { ...baseDraft, currentCity: SPRINGFIELD_IL };
    assert.equal(isOwnProfileDraftDirty(added, snapshot, 'personal'), true);
    assert.deepEqual(
      buildOwnProfileContextSavePatch(added, snapshot).currentCity,
      SPRINGFIELD_IL,
    );

    const savedWithCity = createOwnProfileSnapshot(added);
    const changed = { ...baseDraft, currentCity: SPRINGFIELD_MO };
    assert.equal(isOwnProfileDraftDirty(changed, savedWithCity, 'personal'), true);
    assert.deepEqual(
      buildOwnProfileContextSavePatch(changed, savedWithCity).currentCity,
      SPRINGFIELD_MO,
    );

    const removed = { ...baseDraft, currentCity: null };
    assert.equal(isOwnProfileDraftDirty(removed, savedWithCity, 'personal'), true);
    const removePatch = buildOwnProfileContextSavePatch(removed, savedWithCity);
    assert.equal(isDeleteSentinel(removePatch.currentCity), true);
    assert.equal('residenceCountryCode' in removePatch, false);
  });

  it('origin country and languages keep saving as before', () => {
    const snapshot = createOwnProfileSnapshot(baseDraft);
    const patch = buildOwnProfileContextSavePatch(
      { ...baseDraft, birthCountryCode: 'ar', languageCodes: ['es', 'pt'] },
      snapshot,
    );
    assert.deepEqual(patch, { birthCountryCode: 'AR', languageCodes: ['es', 'pt'] });
  });
});

describe('CRJ: city is optional', () => {
  it('origin alone validates the identity step', () => {
    assert.equal(isCrjProfileContextOriginValid('CO'), true);
    assert.equal(isCrjProfileContextOriginValid(null), false);
  });

  it('the identity step does not depend on the city', () => {
    const crj = read('screens/ProfileCompletionScreen.tsx');
    const identity = crj.slice(
      crj.indexOf("case 'identity':"),
      crj.indexOf("case 'photo':"),
    );
    assert.doesNotMatch(identity, /currentCity/);
    assert.doesNotMatch(crj, /residenceCountry/);
    assert.match(crj, /buildCurrentCityWritePatch\(\s*currentCity,\s*persistedCurrentCityRef\.current/);
  });
});

describe('Discovery DTO', () => {
  const payload = (city: unknown) => ({
    contractVersion: 1,
    uid: 'peer',
    distanceMeters: 10,
    profile: {
      mode: 'personal',
      displayName: 'Alex',
      profileImage: null,
      occupation: '',
      interestIds: [],
      company: '',
      bio: '',
      currentCity: city,
    },
    gallery: [],
    socialLinks: [],
    affiliations: [],
    serverTime: 1,
  });

  it('parses the public city reference', () => {
    const parsed = parseGetDiscoveryProfileResponse(payload(CORDOBA_ES));
    assert.deepEqual(parsed.profile.currentCity, CORDOBA_ES);
  });

  it('malformed city is dropped', () => {
    const parsed = parseGetDiscoveryProfileResponse(payload({ name: 'Somewhere' }));
    assert.equal(parsed.profile.currentCity, null);
  });

  it('a city carrying coordinates is rejected as a forbidden public DTO', () => {
    assert.throws(() =>
      parseGetDiscoveryProfileResponse(payload({ ...CORDOBA_ES, latitude: 37.88 })),
    );
    assert.throws(() =>
      parseGetDiscoveryProfileResponse(payload({ ...CORDOBA_ES, lng: -4.77 })),
    );
  });
});

describe('UI wiring and privacy guards', () => {
  const field = read('components/profile/CitySearchField.tsx');
  const cityModules = [
    'components/profile/CitySearchField.tsx',
    'profile/currentCity.ts',
    'profile/currentCityWrite.ts',
    'profile/citySearchController.ts',
    'profile/citySearchCallable.ts',
    'profile/citySearchRuntime.ts',
    'profile/citySearchRuntime.ios.ts',
  ];

  it('city modules never log, never use location or contacts, never call GeoNames', () => {
    for (const rel of cityModules) {
      assert.ok(existsSync(join(ROOT, rel)), rel);
      const src = read(rel);
      assert.doesNotMatch(src, /console\.|logger|analytics|crashlytics/i, rel);
      assert.doesNotMatch(src, /expo-location|getCurrentPositionAsync|requestForegroundPermissions/, rel);
      assert.doesNotMatch(src, /expo-contacts|Contacts/, rel);
      assert.doesNotMatch(src, /api\.geonames|secure\.geonames|geonames\.org/i, rel);
      assert.doesNotMatch(src, /setDoc|updateDoc|updateUserProfilePartial/, rel);
    }
  });

  it('the picker only saves provider suggestions or removal', () => {
    assert.match(field, /onChange\(city\)/);
    assert.match(field, /onChange\(null\)/);
    assert.doesNotMatch(field, /onChange\(query\)|onChange\(next\)/);
    assert.match(field, /resolvePreferredCityCountryCode\(Localization\.getLocales\(\)\)/);
    assert.match(field, /controller\.dispose\(\)/);
  });

  it('editor and Discovery render the city instead of residence', () => {
    const card = read('components/profile/OwnProfileContextCard.tsx');
    assert.match(card, /CitySearchField/);
    assert.doesNotMatch(card, /residence/i);
    const editor = read('screens/CompleteProfileScreen.tsx');
    assert.match(editor, /buildOwnProfileContextSavePatch\(\s*persistedDraft,\s*savedSnapshotRef\.current/);
    assert.doesNotMatch(editor, /residence/i);
    const discovery = read('components/profile/ProfileContextCard.tsx');
    assert.match(discovery, /formatCurrentCityPlace/);
    assert.doesNotMatch(discovery, /residence/i);
    assert.match(read('screens/DiscoveryProfileScreen.tsx'), /currentCity=\{profile\.currentCity\}/);
  });
});

describe('copy', () => {
  it('EN and ES name the field Current city / Ciudad actual', () => {
    assert.equal(enProfile.context.currentCity, 'Current city');
    assert.equal(es.profile.context.currentCity, 'Ciudad actual');
    assert.equal(enOnboarding.profileCompletion.identity.currentCityLabel, 'Current city');
    assert.equal(es.onboarding.profileCompletion.identity.currentCityLabel, 'Ciudad actual');
    assert.equal(enProfile.context.optional, 'Optional');
    assert.equal(es.profile.context.optional, 'Opcional');
  });

  it('residence copy is gone and origin/language copy is unchanged', () => {
    assert.equal('residenceCountry' in enProfile.context, false);
    assert.equal('residenceCountry' in es.profile.context, false);
    assert.equal('residenceCountryLabel' in enOnboarding.profileCompletion.identity, false);
    assert.equal('residenceCountryLabel' in es.onboarding.profileCompletion.identity, false);
    assert.equal(enProfile.context.birthCountry, 'Country of origin');
    assert.equal(es.profile.context.birthCountry, 'País de origen');
    assert.equal(enProfile.context.languages, 'Languages');
    assert.equal(es.profile.context.languages, 'Idiomas');
  });

  it('Discovery shows the city place', () => {
    assert.equal(enDiscoveryProfile.livesIn, 'Lives in {{flag}} {{place}}');
    assert.equal(es.discoveryProfile.livesIn, 'Vive en {{flag}} {{place}}');
  });

  it('the search error keeps the field optional', () => {
    assert.match(enProfile.context.citySearchError, /later/);
    assert.match(es.profile.context.citySearchError, /más tarde/);
  });
});

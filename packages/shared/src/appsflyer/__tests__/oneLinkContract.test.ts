/**
 * AppsFlyer/OneLink contract nc1 (iOS ↔ Android, provisional until the Owner approves).
 * Fixtures are synthetic. Covers: parsing (F1–F5 and extras), PostHog mapping and
 * acquisition evidence through the analytics facade (F1, F2, F7), the destination
 * store (C6) and the SDK runtime (C7).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createInstallRecord, createPendingAttributionStore } from '../../analytics/attribution';
import { createAnalyticsClient, type AuthSnapshot } from '../../analytics/client';
import { POSTHOG_HOST, type AnalyticsConfig } from '../../analytics/config';
import { EVENT_RULES } from '../../analytics/contract';
import { createFakeTransport } from '../../analytics/fakeTransport';
import {
  bindAnalyticsServices,
  handleOneLinkTouch,
  trackSignupCompleted,
  type AnalyticsServices,
} from '../../analytics/index';
import { createEventLedger } from '../../analytics/ledger';
import type { StringStore } from '../../analytics/lifecycle';
import {
  resolveAppsFlyerRuntimeConfig,
  startAppsFlyerRuntime,
  type AppsFlyerSdkPort,
} from '../appsFlyerRuntime';
import { ONELINK_CONTRACT_VERSION, parseOneLinkResult } from '../oneLinkContract';
import {
  createPendingDestinationStore,
  DEFERRED_DESTINATION_TTL_MS,
  DIRECT_DESTINATION_TTL_MS,
} from '../pendingDestination';

const here = dirname(fileURLToPath(import.meta.url));
const NOW = Date.parse('2026-11-21T12:00:00Z');

function memoryStore(): StringStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key, value) => {
      data.set(key, value);
    },
    removeItem: async (key) => {
      data.delete(key);
    },
  };
}

const SUBS = {
  deep_link_sub1: 'email',
  deep_link_sub2: 'lanzamiento-27',
  deep_link_sub3: 'hero',
  deep_link_sub4: 'mailchimp',
  deep_link_sub5: 'nc1',
};

function direct(extra: Record<string, unknown> = {}) {
  return { status: 'FOUND', deepLink: { is_deferred: false, ...SUBS, ...extra } };
}

describe('nc1 parsing', () => {
  it('F1 direct link: confirmed onelink_direct with the four slugs', () => {
    const touch = parseOneLinkResult(direct(), NOW);
    assert.deepEqual(touch?.attribution, {
      source: 'email',
      campaign: 'lanzamiento-27',
      content: 'hero',
      tool: 'mailchimp',
      method: 'onelink_direct',
      capturedAtMs: NOW,
    });
    assert.equal(touch?.isDeferred, false);
    assert.equal(ONELINK_CONTRACT_VERSION, 'nc1');
  });

  it('F3 deferred probabilistic (iOS without IDFA) is an estimate: never attributed', () => {
    for (const match of ['probabilistic', 'id_matching', 'srn', undefined]) {
      const touch = parseOneLinkResult(
        { status: 'FOUND', deepLink: { is_deferred: true, match_type: match, ...SUBS, deep_link_value: 'home' } },
        NOW,
      );
      assert.equal(touch?.attribution, null, String(match));
      assert.equal(touch?.estimated, true);
      // Navigation is not attribution: the destination survives.
      assert.equal(touch?.destination, 'home');
    }
  });

  it('deferred with a deterministic (referrer) match is onelink_deferred', () => {
    const touch = parseOneLinkResult(
      { status: 'FOUND', deepLink: { isDeferred: 'true', match_type: 'referrer', ...SUBS } },
      NOW,
    );
    assert.equal(touch?.attribution?.method, 'onelink_deferred');
  });

  it('unknown delivery mode is treated as deferred (stricter)', () => {
    const touch = parseOneLinkResult({ status: 'FOUND', deepLink: { ...SUBS } }, NOW);
    assert.equal(touch, null);
  });

  it('F4 pid/c/af_* are never read; sub5 must be nc1', () => {
    assert.equal(parseOneLinkResult({ status: 'FOUND', deepLink: { is_deferred: false, pid: 'linktree', c: 'x', af_channel: 'email', media_source: 'm', campaign: 'k' } }, NOW), null);
    for (const version of [undefined, 'nc2', 'NC1', 1]) {
      assert.equal(parseOneLinkResult(direct({ deep_link_sub5: version }), NOW), null, String(version));
    }
  });

  it('F5 invalid or reserved values are dropped field by field', () => {
    const touch = parseOneLinkResult(direct({ deep_link_sub1: 'Organic', deep_link_sub3: 'hero!', deep_link_sub4: 'unknown' }), NOW);
    assert.deepEqual(touch?.attribution, { campaign: 'lanzamiento-27', method: 'onelink_direct', capturedAtMs: NOW });
    assert.equal(parseOneLinkResult(direct({ deep_link_sub1: 'none', deep_link_sub2: '' }), NOW), null);
  });

  it('non-FOUND results, OAuth-looking payloads and junk are ignored', () => {
    assert.equal(parseOneLinkResult({ status: 'NOT_FOUND' }, NOW), null);
    assert.equal(parseOneLinkResult({ status: 'ERROR', error: 'x' }, NOW), null);
    assert.equal(parseOneLinkResult(null, NOW), null);
    assert.equal(parseOneLinkResult('nope', NOW), null);
    for (const key of ['code', 'state', 'transactionId', 'error', 'access_token', 'refresh_token', 'Refresh_Token']) {
      assert.equal(parseOneLinkResult(direct({ [key]: 'x' }), NOW), null, key);
    }
  });

  it('Android string payloads are parsed the same way', () => {
    const touch = parseOneLinkResult({ status: 'FOUND', deepLink: JSON.stringify({ is_deferred: false, ...SUBS }) }, NOW);
    assert.equal(touch?.attribution?.method, 'onelink_direct');
  });

  it('destination: closed list only, no parameters', () => {
    assert.equal(parseOneLinkResult(direct({ deep_link_value: 'alerts' }), NOW)?.destination, 'alerts');
    assert.equal(parseOneLinkResult(direct({ deep_link_value: 'profile/uid123' }), NOW)?.destination, null);
    assert.equal(parseOneLinkResult(direct({ deep_link_value: 'settings' }), NOW)?.destination, null);
  });

  it('attribution_method enum carries onelink_direct and onelink_deferred only as new values', () => {
    const rule = EVENT_RULES.signup_completed.attribution_method as { values: readonly string[] };
    assert.deepEqual([...rule.values], ['universal_link', 'onelink_direct', 'onelink_deferred']);
  });
});

const ENABLED: AnalyticsConfig = {
  enabled: true,
  token: 'phc_test',
  host: POSTHOG_HOST,
  environment: 'production',
  distributionChannel: 'beta',
  isTestInstall: true,
  attributionHosts: [],
};

async function settle(): Promise<void> {
  for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setImmediate(resolve));
}

function facade(now: number, store = memoryStore(), installMarkerAt = now - 3600000) {
  const fake = createFakeTransport();
  const client = createAnalyticsClient({
    config: ENABLED,
    createTransport: async () => fake,
    binary: () => ({ appVersion: '2.1.0', appBuild: '86' }),
  });
  const services: AnalyticsServices = {
    client,
    ledger: createEventLedger(store),
    attribution: createPendingAttributionStore(store),
    attributionHosts: [],
    install: createInstallRecord(store, () => installMarkerAt),
    now: () => now,
    scheduleProfileSync: () => {},
    noteVerifiedSocialsChanged: () => {},
    observeLocationPermissions: () => {},
    noteExternalAuthFlow: () => {},
  };
  bindAnalyticsServices(services);
  return { fake, client, services, store };
}

const user = (uid: string, createdMs: number): AuthSnapshot => ({
  uid,
  email: null,
  creationTime: new Date(createdMs).toUTCString(),
});

describe('nc1 → PostHog', () => {
  it('F1 signed out → signup: acquisition with onelink_direct, $set_once, no URL stored', async () => {
    const { fake, client, store } = facade(NOW);
    await client.start();
    client.reportAuthState(null);
    handleOneLinkTouch(parseOneLinkResult(direct(), NOW - 60000)!.attribution!);
    await settle();
    assert.equal(JSON.stringify([...store.data.values()]).includes('https://'), false);
    client.reportAuthState(user('uidN', NOW - 1000));
    trackSignupCompleted({ uid: 'uidN', method: 'email' });
    await settle();
    const props = fake.captured('signup_completed')[0]?.properties;
    assert.equal(props?.signup_source, 'email');
    assert.equal(props?.signup_tool, 'mailchimp');
    assert.equal(props?.attribution_method, 'onelink_direct');
    const person = fake.calls.find((c) => c.op === 'setPerson');
    assert.ok(person && person.op === 'setPerson' && person.setOnce.signup_campaign === 'lanzamiento-27');
  });

  it('F2 link opened with a session: campaign_accessed only', async () => {
    const { fake, client } = facade(NOW);
    await client.start();
    client.reportAuthState(user('uidE', NOW - 3600000 * 2));
    handleOneLinkTouch(parseOneLinkResult(direct(), NOW)!.attribution!);
    await settle();
    assert.equal(fake.captured('acquisition_attributed').length, 0);
    const [event] = fake.captured('campaign_accessed');
    assert.equal(event?.properties.campaign_name, 'lanzamiento-27');
    assert.equal(event?.properties.attribution_method, 'onelink_direct');
  });

  it('same touch from direct and deferred within 10 min counts once', async () => {
    const { fake, client } = facade(NOW);
    await client.start();
    client.reportAuthState(user('uidE', NOW - 3600000 * 2));
    const touch = parseOneLinkResult(direct(), NOW)!.attribution!;
    handleOneLinkTouch(touch);
    handleOneLinkTouch({ ...touch, method: 'onelink_deferred' });
    await settle();
    assert.equal(fake.captured('campaign_accessed').length, 1);
  });

  it('F7 second account created on the same install gets no acquisition', async () => {
    const store = memoryStore();
    const first = facade(NOW, store);
    await first.client.start();
    first.client.reportAuthState(null);
    handleOneLinkTouch(parseOneLinkResult(direct(), NOW - 60000)!.attribution!);
    await settle();
    first.client.reportAuthState(user('uidA', NOW - 1000));
    trackSignupCompleted({ uid: 'uidA', method: 'email' });
    await settle();
    assert.equal(first.fake.captured('signup_completed')[0]?.properties.attribution_method, 'onelink_direct');

    const second = facade(NOW + 60000, store);
    await second.client.start();
    second.client.reportAuthState(null);
    handleOneLinkTouch(parseOneLinkResult(direct({ deep_link_sub2: 'otra' }), NOW + 30000)!.attribution!);
    await settle();
    second.client.reportAuthState(user('uidB', NOW + 50000));
    trackSignupCompleted({ uid: 'uidB', method: 'email' });
    await settle();
    const props = second.fake.captured('signup_completed')[0]?.properties ?? {};
    assert.equal('signup_campaign' in props, false);
    bindAnalyticsServices(null);
  });
});

describe('nc1 destination store (C6)', () => {
  const at = (ms: number) => () => ms;

  it('consumed once by the account in MainTabs; TTLs 30 min / 24 h', async () => {
    const store = memoryStore();
    await createPendingDestinationStore(store, at(NOW)).capture({ key: 'alerts', deferred: false, uid: null });
    assert.equal(await createPendingDestinationStore(store, at(NOW + DIRECT_DESTINATION_TTL_MS + 1)).take('u1'), null);

    await createPendingDestinationStore(store, at(NOW)).capture({ key: 'home', deferred: true, uid: null });
    const later = createPendingDestinationStore(store, at(NOW + DEFERRED_DESTINATION_TTL_MS - 1));
    assert.equal(await later.take('u1'), 'home');
    assert.equal(await later.take('u1'), null);
    assert.equal(JSON.stringify([...store.data.values()]).includes('http'), false);
  });

  it('account A capture is discarded for B; signed-out capture binds to the first account', async () => {
    const s = createPendingDestinationStore(memoryStore(), at(NOW));
    await s.capture({ key: 'profile', deferred: false, uid: 'A' });
    assert.equal(await s.take('B'), null);
    await s.capture({ key: 'profile', deferred: false, uid: null });
    await s.noteAccount('B');
    await s.noteAccount('C');
    assert.equal(await s.take('C'), null);
  });

  it('sign-out clears; the same key within 10 min opens once', async () => {
    const s = createPendingDestinationStore(memoryStore(), at(NOW));
    await s.capture({ key: 'home', deferred: false, uid: null });
    await s.clear();
    assert.equal(await s.take('u'), null);
    await s.capture({ key: 'home', deferred: false, uid: null });
    assert.equal(await s.take('u'), 'home');
    await s.capture({ key: 'home', deferred: true, uid: null });
    assert.equal(await s.take('u'), null);
  });
});

function fakeSdk() {
  const calls: { name: string; params?: unknown }[] = [];
  let deepLink: ((data: unknown) => void) | undefined;
  let ready: (() => void) | undefined;
  const record = (name: string) => async (params?: unknown) => {
    calls.push({ name, params });
  };
  const sdk: AppsFlyerSdkPort & Record<string, unknown> = {
    registerDeepLinkListener: async (cb) => {
      calls.push({ name: 'registerDeepLinkListener' });
      deepLink = cb.onDeepLinking;
    },
    init: record('init') as AppsFlyerSdkPort['init'],
    enableDebug: record('enableDebug') as AppsFlyerSdkPort['enableDebug'],
    setDisableAdvertisingIdentifiers: record('setDisableAdvertisingIdentifiers') as any,
    setDisableCollectASA: record('setDisableCollectASA') as any,
    setDisableAppleAdsAttribution: record('setDisableAppleAdsAttribution') as any,
    setDisableSKAdNetwork: record('setDisableSKAdNetwork') as any,
    setShouldCollectDeviceName: record('setShouldCollectDeviceName') as any,
    setSharingFilterForPartners: record('setSharingFilterForPartners') as any,
    registerSessionReadyListener: async (cb) => {
      calls.push({ name: 'registerSessionReadyListener' });
      ready = cb;
    },
    start: record('start') as AppsFlyerSdkPort['start'],
  };
  return { sdk, calls, fireDeepLink: (d: unknown) => deepLink?.(d), fireReady: () => ready?.() };
}

const RUNTIME_ON_EXTRA = { NEARSY_APPSFLYER_ENABLED: 'true', NEARSY_APPSFLYER_DEV_KEY: 'synthetickey0123456', NEARSY_APPSFLYER_APPLE_APP_ID: '6759302206' };
const RUNTIME_ON = resolveAppsFlyerRuntimeConfig(RUNTIME_ON_EXTRA, 'production');

describe('nc1 SDK runtime (C7)', () => {
  it('off unless enabled with key and App Store id; never loads the SDK when off', () => {
    let loads = 0;
    const deps = { loadSdk: () => (loads++, null), now: () => NOW, currentUid: () => null, onAttribution: () => {}, onDestination: () => {} };
    for (const extra of [{}, { NEARSY_APPSFLYER_ENABLED: 'true' }, { NEARSY_APPSFLYER_ENABLED: 'false', NEARSY_APPSFLYER_DEV_KEY: 'k', NEARSY_APPSFLYER_APPLE_APP_ID: '6759302206' }]) {
      const config = resolveAppsFlyerRuntimeConfig(extra, 'production');
      assert.equal(config.enabled, false);
      assert.equal(startAppsFlyerRuntime({ ...deps, config }), false);
    }
    assert.equal(loads, 0);
  });

  it('SDK debug stays off on every build, nearsy-dev included', () => {
    for (const env of ['development', 'production', undefined]) {
      assert.equal(resolveAppsFlyerRuntimeConfig(RUNTIME_ON_EXTRA, env).debug, false, String(env));
    }
  });

  it('listener before init, privacy setters before start, start only on session ready', async () => {
    const { sdk, calls, fireReady } = fakeSdk();
    assert.equal(
      startAppsFlyerRuntime({ config: RUNTIME_ON, loadSdk: () => sdk, now: () => NOW, currentUid: () => null, onAttribution: () => {}, onDestination: () => {} }),
      true,
    );
    await settle();
    const names = calls.map((c) => c.name);
    assert.equal(names[0], 'registerDeepLinkListener');
    assert.equal(names[1], 'init');
    assert.deepEqual(calls[1]?.params, { devKey: 'synthetickey0123456', appId: '6759302206' });
    assert.equal(names.includes('enableDebug'), false, 'SDK debug off on every build');
    assert.equal(names.includes('start'), false);
    fireReady();
    await settle();
    const startAt = calls.findIndex((c) => c.name === 'start');
    for (const setter of ['setDisableAdvertisingIdentifiers', 'setDisableCollectASA', 'setDisableAppleAdsAttribution', 'setDisableSKAdNetwork', 'setShouldCollectDeviceName', 'setSharingFilterForPartners']) {
      const i = calls.findIndex((c) => c.name === setter);
      assert.ok(i > 0 && i < startAt, setter);
    }
    assert.deepEqual(calls.find((c) => c.name === 'setDisableAdvertisingIdentifiers')?.params, { disable: true });
    assert.deepEqual(calls.find((c) => c.name === 'setSharingFilterForPartners')?.params, { partners: ['all'] });
  });

  it('routes a result to attribution and destination separately', async () => {
    const { sdk, fireDeepLink } = fakeSdk();
    const attributions: unknown[] = [];
    const destinations: unknown[] = [];
    startAppsFlyerRuntime({
      config: RUNTIME_ON,
      loadSdk: () => sdk,
      now: () => NOW,
      currentUid: () => 'uidX',
      onAttribution: (a) => attributions.push(a),
      onDestination: (d) => destinations.push(d),
    });
    fireDeepLink(direct({ deep_link_value: 'alerts' }));
    fireDeepLink({ status: 'FOUND', deepLink: { is_deferred: true, match_type: 'probabilistic', ...SUBS } });
    fireDeepLink({ status: 'FOUND', deepLink: 42 });
    assert.equal(attributions.length, 1);
    assert.deepEqual(destinations, [{ key: 'alerts', deferred: false, uid: 'uidX' }]);
  });

  it('the runtime never calls identity, event or clipboard APIs', () => {
    const source = readFileSync(join(here, '..', 'appsFlyerRuntime.ts'), 'utf8').replace(/\/\*\*[\s\S]*?\*\//g, '');
    for (const forbidden of ['setCustomerUserId', 'logEvent', 'setUserEmail', 'setUserPhone', 'Clipboard', 'registerConversionListener', 'handleOpenURL', 'continueUserActivity']) {
      assert.equal(source.includes(forbidden), false, forbidden);
    }
  });
});

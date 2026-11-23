/**
 * AppsFlyer OneLink contract nc1 on Android (provisional, shared with iOS).
 * Synthetic payloads only: no SDK, no network, no real keys.
 * Run: node --experimental-strip-types --test src/__tests__/androidAppsFlyerOneLink.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  decideEvidence,
  decideHeldTouchForExistingAccount,
  parseCampaignLink,
  signupAttributionProperties,
  campaignAccessedProperties,
} from '../analytics/analyticsAttribution.ts';
import {
  acceptOneLinkAcquisition,
  createDestinationStore,
  createInstallClaim,
  DEFERRED_DESTINATION_TTL_MS,
  DIRECT_DESTINATION_TTL_MS,
  DESTINATION_DEDUPE_MS,
  isOneLinkUrl,
  normalizeOneLinkValue,
  ONELINK_LATE_ACQUISITION_CAP_MS,
  oneLinkTouchKey,
  readConversionFallback,
  readUnifiedDeepLink,
  resolveAppsFlyerSettings,
} from '../attribution/oneLinkContract.ts';

const here = dirname(fileURLToPath(import.meta.url));
const androidApp = join(here, '../../../../apps/nearsy-android');
const require = createRequire(import.meta.url);

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: async (key: string) => map.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: async (key: string) => {
      map.delete(key);
    },
  };
}

const NC1 = {
  deep_link_sub1: 'nearsy_share',
  deep_link_sub2: 'spring_t',
  deep_link_sub5: 'nc1',
};

describe('OneLink URL', () => {
  it('accepts only https nearsy.onelink.me/Uxo6', () => {
    assert.equal(isOneLinkUrl('https://nearsy.onelink.me/Uxo6/abc'), true);
    assert.equal(isOneLinkUrl('https://NEARSY.onelink.me/Uxo6?x=1'), true);
    assert.equal(isOneLinkUrl('https://nearsy.onelink.me/Uxo6'), true);
    assert.equal(isOneLinkUrl('http://nearsy.onelink.me/Uxo6/abc'), false);
    assert.equal(isOneLinkUrl('https://nearsy.onelink.me/Other/abc'), false);
    assert.equal(isOneLinkUrl('https://nearsy.onelink.me/Uxo6x'), false);
    assert.equal(isOneLinkUrl('https://evil.example/nearsy.onelink.me/Uxo6'), false);
    assert.equal(isOneLinkUrl('nearsy://linkedin-auth?transactionId=t&result=ok'), false);
    assert.equal(isOneLinkUrl('nearsy://campaign?utm_source=x'), false);
    assert.equal(isOneLinkUrl(null), false);
  });

  it('the JS campaign parser never reads a OneLink, even if configured as App Link', () => {
    const settings = { appLinks: { host: 'nearsy.onelink.me', pathPrefix: '/Uxo6' } };
    assert.equal(
      parseCampaignLink('https://nearsy.onelink.me/Uxo6/a?utm_source=x', settings),
      null,
    );
  });
});

describe('values', () => {
  it('lowercases slugs and rejects reserved and unsafe values', () => {
    assert.equal(normalizeOneLinkValue('Spring_T'), 'spring_t');
    assert.equal(normalizeOneLinkValue('a.b-c_1'), 'a.b-c_1');
    for (const bad of ['organic', 'Unknown', 'none', 'null', 'undefined', '', '-x', 'Mi Herramienta!', 'a'.repeat(65), 7]) {
      assert.equal(normalizeOneLinkValue(bad), undefined, String(bad));
    }
  });
});

describe('Unified Deep Linking', () => {
  it('direct link with nc1 is onelink_direct; pid/c/af_channel are never read', () => {
    const reading = readUnifiedDeepLink({
      status: 'FOUND',
      deepLink: { ...NC1, deep_link_sub4: 'QR', pid: 'other', c: 'other', af_channel: 'x', is_deferred: false },
    });
    assert.deepEqual(reading, {
      deferred: false,
      touch: { source: 'nearsy_share', campaign: 'spring_t', tool: 'qr', method: 'onelink_direct' },
      destination: null,
    });
    assert.deepEqual(signupAttributionProperties(reading!.touch!), {
      signup_source: 'nearsy_share',
      signup_campaign: 'spring_t',
      signup_tool: 'qr',
      attribution_method: 'onelink_direct',
    });
    assert.deepEqual(campaignAccessedProperties(reading!.touch!), {
      campaign_source: 'nearsy_share',
      campaign_name: 'spring_t',
      campaign_tool: 'qr',
      attribution_method: 'onelink_direct',
    });
  });

  it('reads a deep link delivered as a JSON string (Android)', () => {
    const reading = readUnifiedDeepLink({
      status: 'FOUND',
      deepLink: JSON.stringify({ ...NC1, deep_link_value: 'alerts', is_deferred: false }),
    });
    assert.equal(reading?.touch?.method, 'onelink_direct');
    assert.equal(reading?.destination, 'alerts');
  });

  it('deferred counts only with match_type referrer', () => {
    const referrer = readUnifiedDeepLink({
      status: 'FOUND',
      deepLink: { ...NC1, is_deferred: true, match_type: 'referrer' },
    });
    assert.equal(referrer?.touch?.method, 'onelink_deferred');
    for (const match of ['probabilistic', 'srn', 'id_matching', undefined]) {
      const reading = readUnifiedDeepLink({
        status: 'FOUND',
        deepLink: { ...NC1, is_deferred: true, match_type: match, deep_link_value: 'home' },
      });
      assert.equal(reading?.touch, null, String(match));
      assert.equal(reading?.destination, 'home', 'a destination is navigation, not attribution');
      assert.equal(reading?.deferred, true);
    }
  });

  it('an unknown is_deferred is deferred (stricter path); a probabilistic match still navigates', () => {
    const reading = readUnifiedDeepLink({ status: 'FOUND', deepLink: { ...NC1, deep_link_value: 'profile' } });
    assert.equal(reading?.deferred, true);
    assert.equal(reading?.touch, null);
    assert.equal(reading?.destination, 'profile');
    assert.equal(
      readUnifiedDeepLink({ status: 'FOUND', deepLink: { ...NC1, match_type: 'referrer' } })?.touch?.method,
      'onelink_deferred',
    );
  });

  it('without nc1, or without source and campaign, nothing is attributed', () => {
    assert.equal(
      readUnifiedDeepLink({ status: 'FOUND', deepLink: { ...NC1, deep_link_sub5: 'nc2', is_deferred: false } })?.touch,
      null,
    );
    assert.equal(
      readUnifiedDeepLink({ status: 'FOUND', deepLink: { deep_link_sub3: 'x', deep_link_sub5: 'nc1' } })
        ?.touch,
      null,
    );
    const partial = readUnifiedDeepLink({
      status: 'FOUND',
      deepLink: { deep_link_sub1: 'Organic', deep_link_sub2: 'ok', deep_link_sub3: 'bad value', deep_link_sub5: 'nc1', is_deferred: 'false' },
    });
    assert.deepEqual(partial?.touch, { campaign: 'ok', method: 'onelink_direct' });
  });

  it('NOT_FOUND, ERROR, garbage and OAuth-looking payloads are ignored whole', () => {
    assert.equal(readUnifiedDeepLink({ status: 'NOT_FOUND' }), null);
    assert.equal(readUnifiedDeepLink({ status: 'ERROR', error: 'TIMEOUT' }), null);
    assert.equal(readUnifiedDeepLink('nope'), null);
    assert.equal(readUnifiedDeepLink({ status: 'FOUND', deepLink: '{bad json' }), null);
    for (const key of ['code', 'state', 'transactionId', 'transaction_id', 'result', 'error', 'mode', 'id_token']) {
      assert.equal(
        readUnifiedDeepLink({ status: 'FOUND', deepLink: { ...NC1, deep_link_value: 'home', [key]: 'x' } }),
        null,
        key,
      );
    }
  });

  it('only the closed destination list', () => {
    for (const value of ['home', 'profile', 'alerts', 'ALERTS']) {
      assert.ok(readUnifiedDeepLink({ status: 'FOUND', deepLink: { deep_link_value: value } })?.destination);
    }
    for (const value of ['settings', 'profile?uid=1', 'https://x', '']) {
      assert.equal(
        readUnifiedDeepLink({ status: 'FOUND', deepLink: { deep_link_value: value } })?.destination,
        null,
      );
    }
  });
});

describe('conversion data fallback', () => {
  const base = { ...NC1, is_first_launch: true, af_status: 'Non-organic', match_type: 'referrer' };
  it('first launch, non-organic, referrer, nc1 -> onelink_deferred', () => {
    assert.equal(readConversionFallback(base)?.touch?.method, 'onelink_deferred');
    assert.equal(readConversionFallback({ ...base, is_first_launch: 'true' })?.touch?.method, 'onelink_deferred');
  });
  it('is_first_launch, Non-organic or a window alone never attribute', () => {
    assert.equal(readConversionFallback({ ...base, is_first_launch: false }), null);
    assert.equal(readConversionFallback({ ...base, af_status: 'Organic' }), null);
    assert.equal(readConversionFallback({ ...base, is_retargeting: true }), null);
    assert.equal(readConversionFallback({ ...base, match_type: 'probabilistic' }), null);
    assert.equal(readConversionFallback({ ...base, deep_link_sub5: undefined }), null);
    assert.equal(readConversionFallback({ ...base, code: 'x' }), null);
  });
});

describe('acquisition evidence (C4)', () => {
  const touch = { source: 's', method: 'onelink_deferred' as const };
  const ok = {
    touch,
    observedAt: 1_000,
    accountCreatedAt: 5_000,
    installTime: 1_000,
    installClaimedBy: null,
    uid: 'a',
    late: null,
  };
  it('accepts a held touch on a new account after this install', () => {
    assert.equal(acceptOneLinkAcquisition(ok), true);
  });
  it('rejects an account older than the install, a later touch, or a claimed install', () => {
    assert.equal(acceptOneLinkAcquisition({ ...ok, accountCreatedAt: 500 }), false);
    assert.equal(acceptOneLinkAcquisition({ ...ok, observedAt: 6_000 }), false);
    assert.equal(acceptOneLinkAcquisition({ ...ok, installClaimedBy: 'b' }), false);
    assert.equal(acceptOneLinkAcquisition({ ...ok, installClaimedBy: 'a' }), false);
    assert.equal(acceptOneLinkAcquisition({ ...ok, accountCreatedAt: null }), false);
    assert.equal(acceptOneLinkAcquisition({ ...ok, installTime: null }), false);
  });
  it('late evidence only within 24 h of the Firebase creation time', () => {
    const late = (age: number) => ({ now: ok.accountCreatedAt + age });
    assert.equal(acceptOneLinkAcquisition({ ...ok, late: late(ONELINK_LATE_ACQUISITION_CAP_MS) }), true);
    assert.equal(acceptOneLinkAcquisition({ ...ok, late: late(ONELINK_LATE_ACQUISITION_CAP_MS + 1) }), false);
  });
  it('a deferred touch is never a later access; a direct one is', () => {
    const signup = { at: 10, attributed: false };
    assert.equal(
      decideEvidence({ signedIn: true, touch, observedAt: 50, signup }),
      'drop',
    );
    assert.equal(
      decideEvidence({ signedIn: true, touch: { source: 's', method: 'onelink_direct' }, observedAt: 50, signup }),
      'campaign_accessed',
    );
    assert.equal(decideEvidence({ signedIn: false, touch, observedAt: 50, signup: null }), 'hold');
    assert.equal(decideHeldTouchForExistingAccount(touch), 'drop');
    assert.equal(decideHeldTouchForExistingAccount({ source: 's', method: 'onelink_direct' }), 'campaign_accessed');
  });
  it('one claim per install; a claim restored from another install does not count', async () => {
    const claim = createInstallClaim(memoryStorage());
    assert.equal(await claim.claimedBy(1_000), null);
    await claim.claim(1_000, 'a');
    assert.equal(await claim.claimedBy(1_000), 'a');
    assert.equal(await claim.claimedBy(2_000), null);
  });
  it('direct and deferred deliveries of the same touch share one key', () => {
    assert.equal(
      oneLinkTouchKey({ source: 's', method: 'onelink_direct' }),
      oneLinkTouchKey({ source: 's', method: 'onelink_deferred' }),
    );
  });
});

describe('pending destination (C6)', () => {
  function store(start = 1_000_000) {
    let now = start;
    const storage = memoryStorage();
    return {
      storage,
      advance: (ms: number) => {
        now += ms;
      },
      s: createDestinationStore({ storage, now: () => now }),
    };
  }
  it('consumed once, by the next account when captured signed out', async () => {
    const { s } = store();
    assert.equal(await s.offer('alerts', { deferred: false, uid: null }), true);
    assert.equal(await s.take('a'), 'alerts');
    assert.equal(await s.take('a'), null);
  });
  it('direct expires after 30 min, deferred after 24 h', async () => {
    const direct = store();
    await direct.s.offer('home', { deferred: false, uid: null });
    direct.advance(DIRECT_DESTINATION_TTL_MS + 1);
    assert.equal(await direct.s.take('a'), null);
    const deferred = store();
    await deferred.s.offer('home', { deferred: true, uid: null });
    deferred.advance(DEFERRED_DESTINATION_TTL_MS - 1);
    assert.equal(await deferred.s.take('a'), 'home');
  });
  it('captured with account A, discarded for B', async () => {
    const { s } = store();
    await s.offer('profile', { deferred: false, uid: 'a' });
    assert.equal(await s.take('b'), null);
    assert.equal(await s.take('a'), null, 'the entry is gone either way');
  });
  it('same key within 10 min is a duplicate; after that it is new', async () => {
    const { s, advance } = store();
    assert.equal(await s.offer('home', { deferred: true, uid: null }), true);
    assert.equal(await s.offer('home', { deferred: false, uid: null }), false);
    assert.equal(await s.offer('alerts', { deferred: false, uid: null }), true);
    advance(DESTINATION_DEDUPE_MS - 1);
    assert.equal(await s.offer('alerts', { deferred: false, uid: null }), false);
    advance(1);
    assert.equal(await s.offer('alerts', { deferred: false, uid: null }), true);
  });
  it('sign-out clears it', async () => {
    const { s } = store();
    await s.offer('home', { deferred: false, uid: null });
    await s.clear();
    assert.equal(await s.take('a'), null);
  });
});

describe('build configuration', () => {
  const plugin = require(join(androidApp, 'plugins/appsflyerConfig.js'));

  it('runtime settings are off unless enabled with a well-formed key', () => {
    assert.deepEqual(resolveAppsFlyerSettings(undefined), { enabled: false });
    assert.deepEqual(resolveAppsFlyerSettings({ enabled: true }), { enabled: false });
    assert.deepEqual(resolveAppsFlyerSettings({ enabled: true, devKey: 'short' }), { enabled: false });
    assert.deepEqual(resolveAppsFlyerSettings({ enabled: true, devKey: 'SyntheticKey0001' }), {
      enabled: true,
      devKey: 'SyntheticKey0001',
    });
  });

  it('build extras: off by default, never carry a key when off, fail an EAS build without key', () => {
    assert.deepEqual(plugin.resolveAppsFlyerExtras({}), { enabled: false });
    assert.deepEqual(
      plugin.resolveAppsFlyerExtras({ NEARSY_APPSFLYER_DEV_KEY: 'SyntheticKey0001' }),
      { enabled: false },
    );
    assert.deepEqual(
      plugin.resolveAppsFlyerExtras({ NEARSY_APPSFLYER_ENABLED: 'true', NEARSY_APPSFLYER_DEV_KEY: 'SyntheticKey0001' }),
      { enabled: true, devKey: 'SyntheticKey0001' },
    );
    const warn = console.warn;
    console.warn = () => {};
    try {
      assert.deepEqual(plugin.resolveAppsFlyerExtras({ NEARSY_APPSFLYER_ENABLED: 'true' }), { enabled: false });
    } finally {
      console.warn = warn;
    }
    assert.throws(() =>
      plugin.resolveAppsFlyerExtras({ NEARSY_APPSFLYER_ENABLED: 'true', EAS_BUILD: 'true' }),
    );
  });

  it('OneLink App Link filter: https, exact host and template, autoVerify', () => {
    assert.deepEqual(plugin.oneLinkIntentFilters(), [
      {
        action: 'VIEW',
        autoVerify: true,
        category: ['BROWSABLE', 'DEFAULT'],
        data: [{ scheme: 'https', host: 'nearsy.onelink.me', pathPrefix: '/Uxo6' }],
      },
    ]);
  });

  it('MainActivity: setIntent only for OneLink, idempotent', () => {
    const template = `package com.nearsy.app\n\nclass MainActivity : ReactActivity() {\n  override fun getMainComponentName(): String = "main"\n}\n`;
    const once = plugin.addOneLinkOnNewIntent(template);
    assert.equal(plugin.addOneLinkOnNewIntent(once), once);
    assert.match(once, /if \(isOneLink\) setIntent\(intent\)/);
    assert.match(once, /super\.onNewIntent\(intent\)/);
    assert.match(once, /"nearsy\.onelink\.me"\.equals\(data\.host, ignoreCase = true\)/);
    assert.equal((once.match(/setIntent\(/g) ?? []).length, 1);
    assert.ok(once.trimEnd().endsWith('}'));
    assert.throws(() =>
      plugin.addOneLinkOnNewIntent(template.replace('}\n', '  override fun onNewIntent(i: Intent) {}\n}\n')),
    );
  });

  it('backup rules: secure-store rules kept, AppsFlyer state excluded, merge overrides the SDK', () => {
    for (const xml of [plugin.backupRulesXml(), plugin.dataExtractionRulesXml()]) {
      assert.match(xml, /<include domain="sharedpref" path="\."\/>/);
      assert.match(xml, /<exclude domain="sharedpref" path="SecureStore"\/>/);
      assert.match(xml, /<exclude domain="sharedpref" path="appsflyer-data"\/>/);
    }
    assert.equal((plugin.dataExtractionRulesXml().match(/path="SecureStore"/g) ?? []).length, 2);
    const manifest = plugin.applyAppsFlyerManifest({
      manifest: {
        $: {},
        'uses-permission': [{ $: { 'android:name': 'android.permission.INTERNET' } }],
        application: [{ $: { 'android:fullBackupContent': '@xml/secure_store_backup_rules' } }],
      },
    });
    const app = manifest.manifest.application[0].$;
    assert.equal(app['android:fullBackupContent'], '@xml/nearsy_backup_rules');
    assert.equal(app['android:dataExtractionRules'], '@xml/nearsy_data_extraction_rules');
    assert.equal(app['tools:replace'], 'android:fullBackupContent,android:dataExtractionRules');
    assert.ok(
      manifest.manifest['uses-permission'].some(
        (p: { $: Record<string, string> }) =>
          p.$['android:name'] === 'com.samsung.android.mapsagent.permission.READ_APP_INFO' &&
          p.$['tools:node'] === 'remove',
      ),
    );
  });

  it('native linking follows the flag', () => {
    const configPath = join(androidApp, 'react-native.config.js');
    const load = (value: string | undefined) => {
      const previous = process.env.NEARSY_APPSFLYER_ENABLED;
      if (value === undefined) delete process.env.NEARSY_APPSFLYER_ENABLED;
      else process.env.NEARSY_APPSFLYER_ENABLED = value;
      delete require.cache[require.resolve(configPath)];
      try {
        return require(configPath);
      } finally {
        if (previous === undefined) delete process.env.NEARSY_APPSFLYER_ENABLED;
        else process.env.NEARSY_APPSFLYER_ENABLED = previous;
      }
    };
    assert.deepEqual(load(undefined).dependencies['react-native-appsflyer'].platforms, {
      android: null,
      ios: null,
    });
    assert.deepEqual(load('true').dependencies, {});
  });

  it('only the release-candidate-appsflyer profile enables AppsFlyer: production, publishable', () => {
    type Profile = {
      extends?: string;
      env?: Record<string, string>;
      environment?: string;
      developmentClient?: boolean;
      distribution?: string;
      android?: { buildType?: string };
    };
    const eas = JSON.parse(readFileSync(join(androidApp, 'eas.json'), 'utf8')) as {
      build: Record<string, Profile>;
    };
    const resolve = (name: string): Profile => {
      const own = eas.build[name];
      const base = own.extends ? resolve(own.extends) : {};
      return {
        ...base,
        ...own,
        env: { ...(base.env ?? {}), ...(own.env ?? {}) },
        android: { ...(base.android ?? {}), ...(own.android ?? {}) },
      };
    };
    const enabled = Object.keys(eas.build).filter(
      (name) => resolve(name).env?.NEARSY_APPSFLYER_ENABLED === 'true',
    );
    assert.deepEqual(enabled, ['release-candidate-appsflyer']);
    const profile = resolve('release-candidate-appsflyer');
    // The public production configuration: nearsy-pj, general capture, no Beta marks.
    assert.equal(profile.extends, 'production');
    assert.equal(profile.env?.NEARSY_FIREBASE_ENV, 'production');
    assert.equal(profile.env?.NEARSY_DEV_CLIENT, 'false');
    assert.equal(profile.env?.NEARSY_ANALYTICS_ENABLED, 'true');
    assert.equal(profile.env?.NEARSY_ANALYTICS_ENV, 'production');
    assert.equal(profile.env?.NEARSY_ANALYTICS_BETA_ENABLED, undefined);
    assert.equal(profile.env?.NEARSY_ANALYTICS_DISTRIBUTION_CHANNEL, undefined);
    assert.equal(profile.environment, 'production');
    assert.equal(profile.distribution, 'store');
    assert.equal(profile.android?.buildType, 'app-bundle');
    // Same as production apart from the AppsFlyer switch, so the tested binary is publishable.
    const { NEARSY_APPSFLYER_ENABLED: _switch, ...rest } = profile.env ?? {};
    assert.deepEqual(rest, resolve('production').env);
    // Distribution: uploaded to Play Internal Testing first, then promoted as is.
    const submit = (
      JSON.parse(readFileSync(join(androidApp, 'eas.json'), 'utf8')) as {
        submit: Record<string, { extends?: string; android?: { track?: string } }>;
      }
    ).submit;
    assert.equal(submit['release-candidate-appsflyer']?.extends, 'production');
    assert.equal(submit['release-candidate-appsflyer']?.android?.track, 'internal');
    for (const value of Object.values(eas.build)) {
      assert.equal(value.env?.NEARSY_APPSFLYER_DEV_KEY, undefined, 'the key never lives in eas.json');
    }
  });

  it('release-candidate-appsflyer config: nearsy-pj, production capture, AppsFlyer and the OneLink filter', () => {
    const { build } = JSON.parse(readFileSync(join(androidApp, 'eas.json'), 'utf8')) as {
      build: Record<string, { extends?: string; env?: Record<string, string> }>;
    };
    const envOf = (name: string): Record<string, string> => {
      const own = build[name];
      return { ...(own.extends ? envOf(own.extends) : {}), ...(own.env ?? {}) };
    };
    const saved = { ...process.env };
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('NEARSY_') || key === 'EAS_BUILD') delete process.env[key];
    }
    Object.assign(process.env, envOf('release-candidate-appsflyer'), {
      NEARSY_APPSFLYER_DEV_KEY: 'SyntheticKey0001',
      NEARSY_POSTHOG_TOKEN: 'phc_fake_token_only_for_this_test_0001',
    });
    try {
      const appRequire = createRequire(join(androidApp, 'package.json'));
      delete appRequire.cache[appRequire.resolve('./app.config.js')];
      const { expo } = appRequire('./app.config.js') as {
        expo: {
          android?: { googleServicesFile?: string; intentFilters?: Array<{ data?: Array<{ host?: string }> }> };
          extra?: Record<string, any>;
        };
      };
      assert.equal(expo.android?.googleServicesFile, './google-services.json');
      assert.equal(expo.extra?.nearsyFirebaseEnv, 'production');
      assert.equal(expo.extra?.nearsyFirebaseProjectId, 'nearsy-pj');
      assert.equal(expo.extra?.nearsyDevClient, false);
      assert.equal(expo.extra?.nearsyAnalytics?.enabled, true);
      assert.equal(expo.extra?.nearsyAnalytics?.environment, 'production');
      assert.equal(expo.extra?.nearsyAnalytics?.beta, undefined);
      assert.equal(expo.extra?.nearsyAppsFlyer?.enabled, true);
      assert.ok(
        (expo.android?.intentFilters ?? []).some((filter) =>
          (filter.data ?? []).some((data) => data.host === 'nearsy.onelink.me'),
        ),
      );
    } finally {
      for (const key of Object.keys(process.env)) delete process.env[key];
      Object.assign(process.env, saved);
    }
  });

  it('the Android binding never sets a customer user id, logs events or reads the clipboard', () => {
    const source = readFileSync(join(here, '../attribution/appsflyer.android.ts'), 'utf8');
    for (const forbidden of ['setCustomerUserId', 'logEvent', 'Clipboard', 'setUserEmail', 'setUserPhone']) {
      assert.equal(source.includes(forbidden), false, forbidden);
    }
    for (const required of [
      'setDisableAdvertisingIdentifiers({ disable: true })',
      'setCollectAndroidID({ isCollect: false })',
      'setDisableNetworkData({ isDisable: true })',
      'disableAppSetId()',
      "setSharingFilterForPartners({ partners: ['all'] })",
    ]) {
      assert.ok(source.includes(required), required);
    }
    // Listener before init; start only inside session-ready, after the privacy setters.
    assert.ok(source.indexOf('registerDeepLinkListener') < source.indexOf('AppsFlyer.init('));
    assert.ok(source.indexOf('registerSessionReadyListener') < source.indexOf('AppsFlyer.start()'));
    assert.ok(source.indexOf('setSharingFilterForPartners') < source.indexOf('AppsFlyer.start()'));
    assert.match(source, /if \(initialUrl && !isOneLinkUrl\(initialUrl\)\) return;/);
  });
});

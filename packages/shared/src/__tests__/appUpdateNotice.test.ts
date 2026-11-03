import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  compareNumericAppVersions,
  isInstalledBehindTarget,
  isPublicVersionGreater,
} from '../appUpdateNotice/compare';
import { loadAppUpdatePolicy } from '../appUpdateNotice/callableHttp';
import { resolveIosAppUpdateChannel } from '../appUpdateNotice/channel';
import {
  APP_UPDATE_NOTICE_CONTRACT_SHA,
  APP_UPDATE_NOTICE_REQUEST,
  GET_APP_UPDATE_POLICY,
  parseAppUpdateNoticeConfig,
  type AppUpdateNoticeConfig,
} from '../appUpdateNotice/contract';
import { createAppUpdateNoticeController } from '../appUpdateNotice/controller';
import { decideAppUpdateNotice } from '../appUpdateNotice/decision';
import {
  readInstalledNativeReleaseFromConstants,
  readInstalledNativeVersionFromConstants,
} from '../appUpdateNotice/nativeVersion';
import {
  isSensitiveUpdateNoticeUrl,
  shouldConsultOnAppStateChange,
  shouldSuppressUpdateNoticeModal,
} from '../appUpdateNotice/sensitiveSession';
import {
  buildSnoozeRecord,
  isSnoozeActive,
  parseSnoozeRecord,
  type AppUpdateNoticeSnoozeRecord,
  type AppUpdateNoticeSnoozeStore,
} from '../appUpdateNotice/snooze';
import {
  IOS_APP_STORE_LISTING_URL,
  IOS_TESTFLIGHT_LISTING_URL,
} from '../appUpdateNotice/storeListing';
import { FirebaseCallableHttpError } from '../firebase/callableHttp';
import en from '../i18n/locales/en';
import es from '../i18n/locales/es';

const here = dirname(fileURLToPath(import.meta.url));

function readShared(relativeFromSharedSrc: string): string {
  return readFileSync(join(here, '..', relativeFromSharedSrc), 'utf8');
}

function policy(
  over: Partial<AppUpdateNoticeConfig> = {},
): AppUpdateNoticeConfig {
  const base: AppUpdateNoticeConfig = {
    platform: 'ios',
    channel: 'production',
    softEnabled: true,
    recommended: { marketingVersion: '2.0.10', build: '70' },
    forceEnabled: false,
    minimum: { marketingVersion: '', build: '' },
    updateUrl: IOS_APP_STORE_LISTING_URL,
    cacheTtlSeconds: 3600,
    enabled: true,
    latestVersion: '2.0.10',
    storeUrl: IOS_APP_STORE_LISTING_URL,
  };
  const merged = { ...base, ...over };
  if (over.recommended) merged.recommended = over.recommended;
  if (over.minimum) merged.minimum = over.minimum;
  if (over.softEnabled !== undefined) merged.enabled = over.softEnabled;
  if (over.enabled !== undefined) {
    merged.softEnabled = over.enabled;
    merged.enabled = over.enabled;
  }
  if (over.latestVersion !== undefined) {
    merged.latestVersion = over.latestVersion;
    merged.recommended = {
      marketingVersion: over.latestVersion,
      build: over.recommended?.build ?? merged.recommended.build,
    };
  }
  if (over.storeUrl !== undefined) {
    merged.storeUrl = over.storeUrl;
    merged.updateUrl = over.storeUrl;
  }
  if (over.updateUrl !== undefined) {
    merged.updateUrl = over.updateUrl;
    merged.storeUrl = over.updateUrl;
  }
  return merged;
}

function mockFetch(handler: (url: string, init?: RequestInit) => Promise<Response>) {
  return async (url: RequestInfo | URL, init?: RequestInit) =>
    handler(String(url), init);
}

function callableResult(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({ result: data }),
  } as Response;
}

function memorySnooze(
  initial: AppUpdateNoticeSnoozeRecord | null = null,
): AppUpdateNoticeSnoozeStore & { records: AppUpdateNoticeSnoozeRecord[] } {
  let current = initial;
  const records: AppUpdateNoticeSnoozeRecord[] = [];
  return {
    records,
    async read() {
      return current;
    },
    async write(record) {
      current = record;
      records.push(record);
    },
  };
}

describe('app update notice contract', () => {
  it('pins Functions contract SHA 5e524d1 and keeps legacy PR #34 request', () => {
    assert.equal(GET_APP_UPDATE_POLICY, 'getAppUpdatePolicy');
    assert.deepEqual(APP_UPDATE_NOTICE_REQUEST, { platform: 'ios' });
    assert.equal(
      APP_UPDATE_NOTICE_CONTRACT_SHA,
      '5e524d1cd2cfa7b3d58137bd5d07cda71e927a45',
    );
    const pinned = readShared('appUpdateNotice/FUNCTIONS_CONTRACT_SHA.txt').trim();
    assert.equal(pinned, APP_UPDATE_NOTICE_CONTRACT_SHA);
  });

  it('parses legacy PR #34 shape and ignores force flags', () => {
    const parsed = parseAppUpdateNoticeConfig({
      platform: 'ios',
      enabled: true,
      latestVersion: '2.0.10',
      storeUrl: IOS_APP_STORE_LISTING_URL,
      force: true,
      minVersion: '9.9.9',
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.config.softEnabled, true);
    assert.equal(parsed.config.forceEnabled, false);
    assert.equal(parsed.config.latestVersion, '2.0.10');
    assert.equal(parsed.config.recommended.build, '0');
  });

  it('parses v2 soft + force document', () => {
    const parsed = parseAppUpdateNoticeConfig({
      platform: 'ios',
      channel: 'testflight',
      softEnabled: true,
      recommended: { marketingVersion: '2.0.10', build: '71' },
      forceEnabled: true,
      minimum: { marketingVersion: '2.0.9', build: '60' },
      updateUrl: IOS_TESTFLIGHT_LISTING_URL,
      cacheTtlSeconds: 120,
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.config.channel, 'testflight');
    assert.equal(parsed.config.forceEnabled, true);
    assert.equal(parsed.config.cacheTtlSeconds, 120);
  });

  it('rejects TestFlight channel paired with a public App Store URL', () => {
    assert.equal(
      parseAppUpdateNoticeConfig({
        platform: 'ios',
        channel: 'testflight',
        softEnabled: true,
        recommended: { marketingVersion: '2.0.10', build: '71' },
        forceEnabled: false,
        minimum: { marketingVersion: '', build: '' },
        updateUrl: IOS_APP_STORE_LISTING_URL,
      }).ok,
      false,
    );
  });

  it('rejects invalid config instead of showing a notice', () => {
    assert.equal(parseAppUpdateNoticeConfig(null).ok, false);
    assert.equal(
      parseAppUpdateNoticeConfig({
        platform: 'ios',
        enabled: 'true',
        latestVersion: '2.0.10',
        storeUrl: IOS_APP_STORE_LISTING_URL,
      }).ok,
      false,
    );
    assert.equal(
      parseAppUpdateNoticeConfig({
        platform: 'ios',
        enabled: true,
        latestVersion: '2.0.9 (63)',
        storeUrl: IOS_APP_STORE_LISTING_URL,
      }).ok,
      false,
    );
  });
});

describe('app update channel resolution', () => {
  it('requires an explicit signal; never invents production for Beta', () => {
    assert.deepEqual(
      resolveIosAppUpdateChannel({ explicitChannel: 'testflight' }),
      { kind: 'testflight' },
    );
    assert.deepEqual(
      resolveIosAppUpdateChannel({ explicitChannel: 'production' }),
      { kind: 'production' },
    );
    const undetermined = resolveIosAppUpdateChannel({});
    assert.equal(undetermined.kind, 'undetermined');
  });
});

describe('app update notice version compare', () => {
  it('compares marketing version then build', () => {
    assert.equal(compareNumericAppVersions('2.0.10', '2.0.9'), 1);
    assert.equal(isPublicVersionGreater('2.0.10', '2.0.9'), true);
    assert.equal(
      isInstalledBehindTarget(
        { marketingVersion: '2.0.9', build: '69' },
        { marketingVersion: '2.0.9', build: '70' },
      ),
      true,
    );
    assert.equal(
      isInstalledBehindTarget(
        { marketingVersion: '2.0.9', build: '70' },
        { marketingVersion: '2.0.9', build: '70' },
      ),
      false,
    );
  });

  it('reads CFBundleShortVersionString + build, never the JS bundle version', () => {
    assert.deepEqual(
      readInstalledNativeReleaseFromConstants({
        nativeAppVersion: '2.0.9',
        nativeBuildVersion: '69',
      }),
      { marketingVersion: '2.0.9', build: '69' },
    );
    assert.equal(
      readInstalledNativeVersionFromConstants({
        expoConfig: { version: '2.0.10' },
      }),
      null,
    );
  });
});

describe('app update notice decision', () => {
  it('returns soft / force / skip from version+build targets', () => {
    assert.equal(
      decideAppUpdateNotice({
        config: policy(),
        installed: { marketingVersion: '2.0.9', build: '69' },
        platform: 'ios',
        nowMs: 1_000,
        snooze: null,
      }),
      'soft',
    );
    assert.equal(
      decideAppUpdateNotice({
        config: policy({ softEnabled: false, enabled: false }),
        installed: { marketingVersion: '2.0.9', build: '69' },
        platform: 'ios',
        nowMs: 1_000,
        snooze: null,
      }),
      'skip',
    );
    assert.equal(
      decideAppUpdateNotice({
        config: policy({
          softEnabled: false,
          forceEnabled: true,
          minimum: { marketingVersion: '2.0.9', build: '70' },
        }),
        installed: { marketingVersion: '2.0.9', build: '69' },
        platform: 'ios',
        nowMs: 1_000,
        snooze: null,
      }),
      'force',
    );
  });

  it('honors snooze per platform+channel+version+build', () => {
    const snooze = buildSnoozeRecord({
      platform: 'ios',
      channel: 'production',
      marketingVersion: '2.0.10',
      build: '70',
      nowMs: 1_000,
    });
    assert.equal(
      isSnoozeActive(snooze, {
        platform: 'ios',
        channel: 'production',
        marketingVersion: '2.0.10',
        build: '70',
        nowMs: 1_000 + 60 * 60 * 1000,
      }),
      true,
    );
    assert.equal(
      decideAppUpdateNotice({
        config: policy(),
        installed: { marketingVersion: '2.0.9', build: '69' },
        platform: 'ios',
        nowMs: 1_000,
        snooze,
      }),
      'skip',
    );
    assert.equal(
      decideAppUpdateNotice({
        config: policy({
          recommended: { marketingVersion: '2.0.11', build: '1' },
          latestVersion: '2.0.11',
        }),
        installed: { marketingVersion: '2.0.9', build: '69' },
        platform: 'ios',
        nowMs: 1_000,
        snooze,
      }),
      'soft',
    );
    assert.equal(parseSnoozeRecord({ platform: 'ios' }), null);
  });
});

describe('app update notice session gating', () => {
  it('consults on open-equivalent background→active only', () => {
    assert.equal(shouldConsultOnAppStateChange('background', 'active'), true);
    assert.equal(shouldConsultOnAppStateChange('inactive', 'active'), false);
  });

  it('suppresses OAuth and ownership return URLs', () => {
    assert.equal(
      isSensitiveUpdateNoticeUrl('nearsy://youtube-ownership?result=ok'),
      true,
    );
    assert.equal(
      shouldSuppressUpdateNoticeModal({ linkedInBusy: true }),
      true,
    );
    assert.equal(shouldSuppressUpdateNoticeModal({}), false);
  });
});

describe('app update notice controller', () => {
  it('skips consult when channel is undetermined (no production fallback)', async () => {
    let loads = 0;
    let presents = 0;
    const controller = createAppUpdateNoticeController({
      nowMs: () => 1,
      platform: 'ios',
      resolveChannel: () => ({
        kind: 'undetermined',
        reason: 'no signal',
      }),
      readInstalledRelease: () => ({
        marketingVersion: '2.0.9',
        build: '69',
      }),
      loadNotice: async () => {
        loads += 1;
        return policy();
      },
      snoozeStore: memorySnooze(),
      isSensitiveSession: () => false,
      present: async () => {
        presents += 1;
        return 'later';
      },
      openStoreListing: () => {
        throw new Error('should not open');
      },
    });
    await controller.consult('open');
    assert.equal(loads, 0);
    assert.equal(presents, 0);
  });

  it('coalesces in-flight consults, snoozes soft Later, fail-softs load errors', async () => {
    let loads = 0;
    let presents = 0;
    const deferred: { resolve?: (value: unknown) => void } = {};
    const firstLoad = new Promise((resolve) => {
      deferred.resolve = resolve;
    });
    const snooze = memorySnooze();
    const controller = createAppUpdateNoticeController({
      nowMs: () => 5_000,
      platform: 'ios',
      resolveChannel: () => ({ kind: 'production' }),
      readInstalledRelease: () => ({
        marketingVersion: '2.0.9',
        build: '69',
      }),
      loadNotice: async () => {
        loads += 1;
        if (loads === 1) return firstLoad;
        throw new Error('offline');
      },
      snoozeStore: snooze,
      isSensitiveSession: () => false,
      present: async () => {
        presents += 1;
        return 'later';
      },
      openStoreListing: () => {
        throw new Error('should not open');
      },
      fetchThrottleMs: 60_000,
    });

    const a = controller.consult('open');
    const b = controller.consult('open');
    deferred.resolve?.(policy());
    await Promise.all([a, b]);
    assert.equal(loads, 1);
    assert.equal(presents, 1);
    assert.equal(snooze.records.length, 1);
    assert.equal(snooze.records[0]?.marketingVersion, '2.0.10');

    const later = createAppUpdateNoticeController({
      nowMs: () => 5_000,
      platform: 'ios',
      resolveChannel: () => ({ kind: 'production' }),
      readInstalledRelease: () => ({
        marketingVersion: '2.0.9',
        build: '69',
      }),
      loadNotice: async () => {
        throw new Error('offline');
      },
      snoozeStore: memorySnooze(),
      isSensitiveSession: () => false,
      present: async () => {
        presents += 1;
        return 'update';
      },
      openStoreListing: () => {},
    });
    await later.consult('foreground');
    assert.equal(presents, 1);
  });

  it('releases force when policy later skips (expired / invalidated)', async () => {
    let dismissCalls = 0;
    let presentKind: string | null = null;
    let loadN = 0;
    let forceResolve: ((c: 'dismissed' | 'update' | 'later') => void) | null =
      null;
    const controller = createAppUpdateNoticeController({
      nowMs: () => 1,
      platform: 'ios',
      resolveChannel: () => ({ kind: 'production' }),
      readInstalledRelease: () => ({
        marketingVersion: '2.0.9',
        build: '69',
      }),
      loadNotice: async () => {
        loadN += 1;
        if (loadN === 1) {
          return policy({
            softEnabled: false,
            forceEnabled: true,
            minimum: { marketingVersion: '2.0.9', build: '70' },
          });
        }
        return policy({ softEnabled: false, forceEnabled: false });
      },
      snoozeStore: memorySnooze(),
      isSensitiveSession: () => false,
      present: (presentation) =>
        new Promise((resolve) => {
          presentKind = presentation.kind;
          forceResolve = resolve;
        }),
      dismissForce: () => {
        dismissCalls += 1;
        forceResolve?.('dismissed');
        forceResolve = null;
      },
      openStoreListing: () => {},
      fetchThrottleMs: 0,
    });

    const first = controller.consult('open');
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(presentKind, 'force');
    assert.equal(controller.isForceActive(), true);

    await controller.consult('foreground');
    await first;
    assert.equal(dismissCalls, 1);
    assert.equal(controller.isForceActive(), false);
  });

  it('opens allowlisted listing on Update', async () => {
    let opened = '';
    const controller = createAppUpdateNoticeController({
      nowMs: () => 1,
      platform: 'ios',
      resolveChannel: () => ({ kind: 'production' }),
      readInstalledRelease: () => ({
        marketingVersion: '2.0.9',
        build: '69',
      }),
      loadNotice: async () => policy(),
      snoozeStore: memorySnooze(),
      isSensitiveSession: () => false,
      present: async () => 'update',
      openStoreListing: (storeUrl) => {
        opened = storeUrl;
      },
    });
    await controller.consult('open');
    assert.equal(opened, IOS_APP_STORE_LISTING_URL);
  });
});

describe('app update notice adapter', () => {
  const APP_CHECK = 'test-app-check-token';

  it('loads a valid Functions policy without Auth and sends channel', async () => {
    const seen: { url?: string; headers?: Record<string, string>; body?: string } =
      {};
    const config = await loadAppUpdatePolicy(
      {
        projectId: 'nearsy-pj',
        appCheckToken: APP_CHECK,
        channel: 'production',
      },
      {
        fetchImpl: mockFetch(async (url, init) => {
          seen.url = url;
          seen.headers = init?.headers as Record<string, string>;
          seen.body = String(init?.body ?? '');
          return callableResult({
            platform: 'ios',
            enabled: true,
            latestVersion: '2.0.10',
            storeUrl: IOS_APP_STORE_LISTING_URL,
          });
        }),
      },
    );
    assert.equal(
      seen.url,
      'https://us-central1-nearsy-pj.cloudfunctions.net/getAppUpdatePolicy',
    );
    assert.equal(seen.headers?.['X-Firebase-AppCheck'], APP_CHECK);
    assert.equal(seen.headers?.Authorization, undefined);
    assert.deepEqual(JSON.parse(seen.body ?? '{}'), {
      data: { platform: 'ios', channel: 'production' },
    });
    assert.equal(config.softEnabled, true);
  });

  it('omits the notice when App Check is not ready', async () => {
    await assert.rejects(
      () =>
        loadAppUpdatePolicy({
          projectId: 'nearsy-pj',
          appCheckToken: '',
        }),
      (err: unknown) =>
        err instanceof FirebaseCallableHttpError &&
        err.code === 'functions/failed-precondition',
    );
  });
});

describe('app update notice wiring', () => {
  it('hosts the notice in App.tsx with channel + force dismiss paths', () => {
    const app = readShared('App.tsx');
    assert.match(app, /AppUpdateNoticeHost/);
    const host = readShared('appUpdateNotice/AppUpdateNoticeHost.tsx');
    assert.match(host, /Platform\.OS !== 'ios'/);
    assert.match(host, /resolveIosAppUpdateChannel/);
    assert.match(host, /readInstalledNativeReleaseFromConstants/);
    assert.match(host, /dismissForce/);
    assert.equal(host.includes('expoConfig.version'), false);
    const foundation = readShared(
      'appUpdateNotice/iosAppUpdateNoticeFoundation.ios.ts',
    );
    assert.match(foundation, /getAppUpdatePolicy|loadAppUpdatePolicy/);
    assert.match(foundation, /channel/);
    assert.equal(foundation.includes('getIdToken'), false);
    assert.equal(en.appUpdateNotice.update, 'Update');
    assert.equal(es.appUpdateNotice.update, 'Actualizar');
  });

  it('does not bump the 2.0.9 IPA numbering', () => {
    const appJson = JSON.parse(
      readFileSync(
        join(here, '../../../../apps/nearsy-ios/app.json'),
        'utf8',
      ),
    );
    assert.equal(appJson.expo.version, '2.0.9');
    assert.equal(appJson.expo.ios.buildNumber, '68');
  });
});

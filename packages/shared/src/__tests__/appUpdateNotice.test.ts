import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compareNumericAppVersions, isPublicVersionGreater } from '../appUpdateNotice/compare';
import { loadAppUpdatePolicy } from '../appUpdateNotice/callableHttp';
import {
  APP_UPDATE_NOTICE_REQUEST,
  GET_APP_UPDATE_POLICY,
  parseAppUpdateNoticeConfig,
  type AppUpdateNoticeConfig,
} from '../appUpdateNotice/contract';
import { createAppUpdateNoticeController } from '../appUpdateNotice/controller';
import { decideAppUpdateNotice } from '../appUpdateNotice/decision';
import { readInstalledNativeVersionFromConstants } from '../appUpdateNotice/nativeVersion';
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
import { IOS_APP_STORE_LISTING_URL } from '../appUpdateNotice/storeListing';
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
  return {
    platform: 'ios',
    enabled: true,
    latestVersion: '2.0.10',
    storeUrl: IOS_APP_STORE_LISTING_URL,
    ...over,
  };
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
  it('consumes getAppUpdatePolicy from Functions PR #34', () => {
    assert.equal(GET_APP_UPDATE_POLICY, 'getAppUpdatePolicy');
    assert.deepEqual(APP_UPDATE_NOTICE_REQUEST, { platform: 'ios' });
    const src = readShared('appUpdateNotice/contract.ts');
    assert.equal(src.includes('APP_UPDATE_NOTICE_CALLABLE_NAME'), false);
  });

  it('parses platform + enabled + latestVersion + storeUrl and ignores force flags', () => {
    assert.deepEqual(
      parseAppUpdateNoticeConfig({
        platform: 'ios',
        enabled: true,
        latestVersion: '2.0.10',
        storeUrl: IOS_APP_STORE_LISTING_URL,
        force: true,
        minVersion: '9.9.9',
      }),
      { ok: true, config: policy() },
    );
  });

  it('treats empty latestVersion as not configured', () => {
    assert.deepEqual(
      parseAppUpdateNoticeConfig({
        platform: 'ios',
        enabled: false,
        latestVersion: '',
        storeUrl: IOS_APP_STORE_LISTING_URL,
      }),
      { ok: true, config: policy({ enabled: false, latestVersion: '' }) },
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
    assert.equal(
      parseAppUpdateNoticeConfig({
        platform: 'android',
        enabled: true,
        latestVersion: '2.0.10',
        storeUrl: IOS_APP_STORE_LISTING_URL,
      }).ok,
      false,
    );
    assert.equal(
      parseAppUpdateNoticeConfig({
        enabled: true,
        latestVersion: '2.0.10',
      }).ok,
      false,
    );
  });
});

describe('app update notice version compare', () => {
  it('compares numeric components, not text or build numbers', () => {
    assert.equal(compareNumericAppVersions('2.0.10', '2.0.9'), 1);
    assert.equal(compareNumericAppVersions('2.0.9', '2.0.9'), 0);
    assert.equal(compareNumericAppVersions('2.0.8', '2.0.9'), -1);
    assert.equal(compareNumericAppVersions('2.10.0', '2.9.9'), 1);
    assert.equal(compareNumericAppVersions('2.0', '2.0.0'), 0);
    assert.equal(isPublicVersionGreater('2.0.10', '2.0.9'), true);
    assert.equal(isPublicVersionGreater('2.0.9', '2.0.9'), false);
    assert.equal(compareNumericAppVersions('2.0.9-rc', '2.0.8'), null);
  });

  it('reads CFBundleShortVersionString and never the JS bundle version', () => {
    assert.equal(
      readInstalledNativeVersionFromConstants({
        nativeAppVersion: '2.0.9',
        expoConfig: { version: '9.9.9' },
      }),
      '2.0.9',
    );
    assert.equal(
      readInstalledNativeVersionFromConstants({
        expoConfig: { version: '2.0.10' },
      }),
      null,
    );
    const native = readShared('appUpdateNotice/nativeVersion.ts');
    assert.equal(native.includes('expoConfig.version'), false);
    assert.match(native, /nativeAppVersion/);
  });
});

describe('app update notice decision', () => {
  it('shows only when enabled and public latestVersion is greater', () => {
    assert.equal(
      decideAppUpdateNotice({
        config: policy(),
        installedNativeVersion: '2.0.9',
        platform: 'ios',
        nowMs: 1_000,
        snooze: null,
      }),
      'show',
    );
    assert.equal(
      decideAppUpdateNotice({
        config: policy({ enabled: false }),
        installedNativeVersion: '2.0.9',
        platform: 'ios',
        nowMs: 1_000,
        snooze: null,
      }),
      'skip',
    );
    assert.equal(
      decideAppUpdateNotice({
        config: policy({ latestVersion: '2.0.9' }),
        installedNativeVersion: '2.0.9',
        platform: 'ios',
        nowMs: 1_000,
        snooze: null,
      }),
      'skip',
    );
    assert.equal(
      decideAppUpdateNotice({
        config: policy({ latestVersion: '' }),
        installedNativeVersion: '2.0.9',
        platform: 'ios',
        nowMs: 1_000,
        snooze: null,
      }),
      'skip',
    );
  });

  it('honors 24h snooze per platform and announced version', () => {
    const snooze = buildSnoozeRecord({
      platform: 'ios',
      latestVersion: '2.0.10',
      nowMs: 1_000,
      snoozeMs: 24 * 60 * 60 * 1000,
    });
    assert.equal(
      isSnoozeActive(snooze, {
        platform: 'ios',
        latestVersion: '2.0.10',
        nowMs: 1_000 + 60 * 60 * 1000,
      }),
      true,
    );
    assert.equal(
      decideAppUpdateNotice({
        config: policy(),
        installedNativeVersion: '2.0.9',
        platform: 'ios',
        nowMs: 1_000,
        snooze,
      }),
      'skip',
    );
    assert.equal(
      decideAppUpdateNotice({
        config: policy({ latestVersion: '2.0.11' }),
        installedNativeVersion: '2.0.9',
        platform: 'ios',
        nowMs: 1_000,
        snooze,
      }),
      'show',
    );
    assert.equal(parseSnoozeRecord({ platform: 'ios' }), null);
  });
});

describe('app update notice session gating', () => {
  it('consults on open-equivalent background→active only', () => {
    assert.equal(shouldConsultOnAppStateChange('background', 'active'), true);
    assert.equal(shouldConsultOnAppStateChange('inactive', 'active'), false);
    assert.equal(shouldConsultOnAppStateChange('active', 'background'), false);
  });

  it('suppresses OAuth and ownership return URLs', () => {
    assert.equal(
      isSensitiveUpdateNoticeUrl('nearsy://youtube-ownership?result=ok'),
      true,
    );
    assert.equal(isSensitiveUpdateNoticeUrl('nearsy://linkedin-auth'), true);
    assert.equal(
      shouldSuppressUpdateNoticeModal({ linkedInBusy: true }),
      true,
    );
    assert.equal(
      shouldSuppressUpdateNoticeModal({ locationJourneyActive: true }),
      true,
    );
    assert.equal(shouldSuppressUpdateNoticeModal({}), false);
  });
});

describe('app update notice controller', () => {
  it('coalesces in-flight consults and fail-softs on load errors', async () => {
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
      readInstalledNativeVersion: () => '2.0.9',
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
    assert.equal(snooze.records[0]?.latestVersion, '2.0.10');

    const later = createAppUpdateNoticeController({
      nowMs: () => 5_000,
      platform: 'ios',
      readInstalledNativeVersion: () => '2.0.9',
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

  it('does not present during a sensitive session and skips inactive→active', async () => {
    let presents = 0;
    const controller = createAppUpdateNoticeController({
      nowMs: () => 1,
      platform: 'ios',
      readInstalledNativeVersion: () => '2.0.9',
      loadNotice: async () => policy(),
      snoozeStore: memorySnooze(),
      isSensitiveSession: () => true,
      present: async () => {
        presents += 1;
        return 'update';
      },
      openStoreListing: () => {},
    });
    controller.onAppStateChange('inactive', 'active');
    await controller.consult('foreground');
    assert.equal(presents, 0);
  });

  it('opens the official App Store listing on Update', async () => {
    let opened = '';
    const controller = createAppUpdateNoticeController({
      nowMs: () => 1,
      platform: 'ios',
      readInstalledNativeVersion: () => '2.0.9',
      loadNotice: async () => policy(),
      snoozeStore: memorySnooze(),
      isSensitiveSession: () => false,
      present: async () => 'update',
      openStoreListing: (storeUrl) => {
        opened = storeUrl;
      },
    });
    await controller.consult('open');
    assert.equal(opened, 'https://apps.apple.com/app/id6759302206');
  });
});

describe('app update notice adapter', () => {
  const APP_CHECK = 'test-app-check-token';

  it('loads a valid Functions policy without Auth', async () => {
    const seen: { url?: string; headers?: Record<string, string>; body?: string } =
      {};
    const config = await loadAppUpdatePolicy(
      { projectId: 'nearsy-pj', appCheckToken: APP_CHECK },
      {
        fetchImpl: mockFetch(async (url, init) => {
          seen.url = url;
          seen.headers = init?.headers as Record<string, string>;
          seen.body = String(init?.body ?? '');
          return callableResult(policy());
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
      data: { platform: 'ios' },
    });
    assert.deepEqual(config, policy());
  });

  it('returns disabled policy without presenting as an error', async () => {
    const config = await loadAppUpdatePolicy(
      { projectId: 'nearsy-dev', appCheckToken: APP_CHECK },
      {
        fetchImpl: mockFetch(async () =>
          callableResult(policy({ enabled: false, latestVersion: '2.0.10' })),
        ),
      },
    );
    assert.equal(config.enabled, false);
    assert.equal(
      decideAppUpdateNotice({
        config,
        installedNativeVersion: '2.0.9',
        platform: 'ios',
        nowMs: 1,
        snooze: null,
      }),
      'skip',
    );
  });

  it('treats empty latestVersion as not configured', async () => {
    const config = await loadAppUpdatePolicy(
      { projectId: 'nearsy-dev', appCheckToken: APP_CHECK },
      {
        fetchImpl: mockFetch(async () =>
          callableResult(policy({ latestVersion: '' })),
        ),
      },
    );
    assert.equal(config.latestVersion, '');
    assert.equal(
      decideAppUpdateNotice({
        config,
        installedNativeVersion: '2.0.9',
        platform: 'ios',
        nowMs: 1,
        snooze: null,
      }),
      'skip',
    );
  });

  it('omits the notice when App Check is not ready or the callable errors', async () => {
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

    await assert.rejects(
      () =>
        loadAppUpdatePolicy(
          { projectId: 'nearsy-pj', appCheckToken: APP_CHECK },
          {
            fetchImpl: mockFetch(async () => {
              throw new Error('offline');
            }),
          },
        ),
      FirebaseCallableHttpError,
    );

    let presents = 0;
    const controller = createAppUpdateNoticeController({
      nowMs: () => 1,
      platform: 'ios',
      readInstalledNativeVersion: () => '2.0.9',
      loadNotice: () =>
        loadAppUpdatePolicy({
          projectId: 'nearsy-pj',
          appCheckToken: '',
        }),
      snoozeStore: memorySnooze(),
      isSensitiveSession: () => false,
      present: async () => {
        presents += 1;
        return 'update';
      },
      openStoreListing: () => {
        throw new Error('should not open');
      },
    });
    await controller.consult('open');
    assert.equal(presents, 0);
  });

  it('omits the notice when storeUrl is not the official Nearsy listing', async () => {
    await assert.rejects(
      () =>
        loadAppUpdatePolicy(
          { projectId: 'nearsy-pj', appCheckToken: APP_CHECK },
          {
            fetchImpl: mockFetch(async () =>
              callableResult(
                policy({
                  storeUrl: 'https://apps.apple.com/app/id0000000000',
                }),
              ),
            ),
          },
        ),
      (err: unknown) =>
        err instanceof FirebaseCallableHttpError &&
        err.code === 'functions/internal',
    );

    let presents = 0;
    const controller = createAppUpdateNoticeController({
      nowMs: () => 1,
      platform: 'ios',
      readInstalledNativeVersion: () => '2.0.9',
      loadNotice: () =>
        loadAppUpdatePolicy(
          { projectId: 'nearsy-pj', appCheckToken: APP_CHECK },
          {
            fetchImpl: mockFetch(async () =>
              callableResult({
                platform: 'ios',
                enabled: true,
                latestVersion: '2.0.10',
                storeUrl: 'itms-beta://testflight.apple.com',
              }),
            ),
          },
        ),
      snoozeStore: memorySnooze(),
      isSensitiveSession: () => false,
      present: async () => {
        presents += 1;
        return 'update';
      },
      openStoreListing: () => {
        throw new Error('should not open');
      },
    });
    await controller.consult('open');
    assert.equal(presents, 0);
  });
});

describe('app update notice wiring', () => {
  it('hosts the notice in App.tsx and keeps EN/ES copy', () => {
    const app = readShared('App.tsx');
    assert.match(app, /AppUpdateNoticeHost/);
    const host = readShared('appUpdateNotice/AppUpdateNoticeHost.tsx');
    assert.match(host, /Platform\.OS !== 'ios'/);
    assert.match(host, /readInstalledNativeVersionFromConstants\(Constants\)/);
    assert.match(host, /isOfficialIosStoreUrl\(storeUrl\)/);
    assert.equal(host.includes('expoConfig.version'), false);
    const foundation = readShared(
      'appUpdateNotice/iosAppUpdateNoticeFoundation.ios.ts',
    );
    assert.match(foundation, /getAppUpdatePolicy|loadAppUpdatePolicy/);
    assert.equal(foundation.includes('getIdToken'), false);
    assert.equal(foundation.includes('firebaseAuth.currentUser'), false);
    assert.equal(en.appUpdateNotice.update, 'Update');
    assert.equal(en.appUpdateNotice.later, 'Later');
    assert.equal(es.appUpdateNotice.update, 'Actualizar');
    assert.equal(es.appUpdateNotice.later, 'Más tarde');
    assert.match(es.appUpdateNotice.title, /Nueva versión disponible/);
  });

  it('does not bump the 2.0.9 (67) IPA numbering', () => {
    const appJson = JSON.parse(
      readFileSync(
        join(here, '../../../../apps/nearsy-ios/app.json'),
        'utf8',
      ),
    );
    assert.equal(appJson.expo.version, '2.0.9');
    assert.equal(appJson.expo.ios.buildNumber, '67');
  });
});

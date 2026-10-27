/**
 * Optional Android Play update notice — simulated Functions policy.
 * Does not enable the production server flag.
 *
 * Run: node --experimental-strip-types --test packages/shared/src/appUpdate/__tests__/appUpdateNotice.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { ANDROID_PLAY_STORE_URL } from '../contract.ts';
import { compareStoreVersions } from '../compareVersions.ts';
import { decideAppUpdateNotice } from '../decideNotice.ts';
import {
  createAppUpdateNoticeSession,
  POSTPONE_DURATION_MS,
  type AppUpdateNoticeCopy,
  type AppUpdateNoticeDeps,
} from '../noticeSession.ts';
import { parseAppUpdatePolicyResponse } from '../parsePolicy.ts';
import {
  parseAppUpdatePostpone,
  APP_UPDATE_POSTPONE_STORAGE_KEY,
} from '../postponeStore.ts';
import { appUpdateTranslations } from '../../i18n/resources/appUpdate.ts';

const here = dirname(fileURLToPath(import.meta.url));
const PLAY = ANDROID_PLAY_STORE_URL;
const COPY: AppUpdateNoticeCopy = {
  title: appUpdateTranslations.en.title,
  message: appUpdateTranslations.en.message,
  update: appUpdateTranslations.en.update,
  later: appUpdateTranslations.en.later,
};

function policy(overrides: Record<string, unknown> = {}) {
  return {
    platform: 'android',
    enabled: true,
    latestVersion: '2.1.0',
    storeUrl: PLAY,
    ...overrides,
  };
}

describe('compareStoreVersions', () => {
  it('compares public store versions by numeric components', () => {
    assert.equal(compareStoreVersions('2.0.9', '2.0.10')! < 0, true);
    assert.equal(compareStoreVersions('2.0.10', '2.0.9')! > 0, true);
    assert.equal(compareStoreVersions('2.0.9', '2.0.9'), 0);
    assert.equal(compareStoreVersions('2.1.0', '2.0.9')! > 0, true);
  });

  it('rejects Internal/TestFlight labels and padded numbers', () => {
    assert.equal(compareStoreVersions('2.0.9-rc.1', '2.0.9'), null);
    assert.equal(compareStoreVersions('2.0.9 (40)', '2.0.9'), null);
    assert.equal(compareStoreVersions('02.0.9', '2.0.9'), null);
  });
});

describe('parseAppUpdatePolicyResponse', () => {
  it('accepts the canonical Android payload and ignores extra keys', () => {
    const parsed = parseAppUpdatePolicyResponse(
      { ...policy(), extra: 1, required: true },
      'android',
    );
    assert.deepEqual(parsed, {
      platform: 'android',
      enabled: true,
      latestVersion: '2.1.0',
      storeUrl: PLAY,
    });
    assert.equal(parsed && 'required' in parsed, false);
  });

  it('fails closed on invalid / non-public store URLs', () => {
    assert.equal(parseAppUpdatePolicyResponse(null, 'android'), null);
    assert.equal(
      parseAppUpdatePolicyResponse(policy({ platform: 'ios' }), 'android'),
      null,
    );
    assert.equal(
      parseAppUpdatePolicyResponse(
        policy({ latestVersion: '2.0.9-internal' }),
        'android',
      ),
      null,
    );
    assert.equal(
      parseAppUpdatePolicyResponse(
        policy({ storeUrl: 'https://play.google.com/apps/internaltest/foo' }),
        'android',
      ),
      null,
    );
  });
});

describe('decideAppUpdateNotice', () => {
  it('hides when disabled, equal, or installed is newer', () => {
    const base = {
      nowMs: 1_000,
      postpone: null,
      modalVisible: false,
      installedVersion: '2.0.9',
    };
    assert.equal(
      decideAppUpdateNotice({
        ...base,
        policy: policy({ enabled: false }),
      }).show,
      false,
    );
    assert.equal(
      decideAppUpdateNotice({
        ...base,
        policy: policy({ latestVersion: '2.0.9' }),
      }).show,
      false,
    );
    assert.equal(
      decideAppUpdateNotice({
        ...base,
        installedVersion: '2.1.0',
        policy: policy({ latestVersion: '2.0.9' }),
      }).show,
      false,
    );
  });

  it('shows only when enabled and installed is older', () => {
    const result = decideAppUpdateNotice({
      policy: policy(),
      installedVersion: '2.0.9',
      nowMs: 1_000,
      postpone: null,
      modalVisible: false,
    });
    assert.deepEqual(result, {
      show: true,
      latestVersion: '2.1.0',
      storeUrl: PLAY,
    });
  });

  it('honors a 24h postpone for that version only', () => {
    const hidden = decideAppUpdateNotice({
      policy: policy(),
      installedVersion: '2.0.9',
      nowMs: 1_000,
      postpone: { version: '2.1.0', untilMs: 2_000 },
      modalVisible: false,
    });
    assert.equal(hidden.show, false);
    const newer = decideAppUpdateNotice({
      policy: policy({ latestVersion: '2.1.1' }),
      installedVersion: '2.0.9',
      nowMs: 1_000,
      postpone: { version: '2.1.0', untilMs: 2_000 },
      modalVisible: false,
    });
    assert.equal(newer.show, true);
    const expired = decideAppUpdateNotice({
      policy: policy(),
      installedVersion: '2.0.9',
      nowMs: 2_001,
      postpone: { version: '2.1.0', untilMs: 2_000 },
      modalVisible: false,
    });
    assert.equal(expired.show, true);
  });

  it('does not stack a second modal', () => {
    assert.equal(
      decideAppUpdateNotice({
        policy: policy(),
        installedVersion: '2.0.9',
        nowMs: 1,
        postpone: null,
        modalVisible: true,
      }).show,
      false,
    );
  });
});

function memoryKv(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: async (key: string) => data[key] ?? null,
    setItem: async (key: string, value: string) => {
      data[key] = value;
    },
  };
}

describe('postponeStore', () => {
  it('round-trips version + untilMs and ignores junk', () => {
    assert.equal(parseAppUpdatePostpone('nope'), null);
    assert.deepEqual(
      parseAppUpdatePostpone(JSON.stringify({ version: '2.1.0', untilMs: 9 })),
      { version: '2.1.0', untilMs: 9 },
    );
    assert.equal(APP_UPDATE_POSTPONE_STORAGE_KEY.includes('android'), true);
  });
});

type Harness = {
  presented: Array<{ latestVersion: string; storeUrl: string; copy: AppUpdateNoticeCopy }>;
  opened: string[];
  fetchCalls: Array<{ platform: string }>;
  session: ReturnType<typeof createAppUpdateNoticeSession>;
  setActive: (v: boolean) => void;
  setNow: (v: number) => void;
  lastOnUpdate?: () => void;
  lastOnLater?: () => void;
};

function harness(opts?: {
  installed?: string | null;
  fetch?: (request: { platform: string }) => Promise<unknown>;
  active?: boolean;
}): Harness {
  let now = 1_000;
  let active = opts?.active ?? true;
  const presented: Harness['presented'] = [];
  const opened: string[] = [];
  const fetchCalls: Harness['fetchCalls'] = [];
  const kv = memoryKv();
  const h: Harness = {
    presented,
    opened,
    fetchCalls,
    session: null as never,
    setActive: (v) => {
      active = v;
    },
    setNow: (v) => {
      now = v;
    },
  };

  const deps: AppUpdateNoticeDeps = {
    platform: 'android',
    now: () => now,
    fetchPolicy: async (request) => {
      fetchCalls.push(request);
      if (opts?.fetch) return opts.fetch(request);
      return policy();
    },
    getInstalledVersion: () =>
      opts?.installed === undefined ? '2.0.9' : opts.installed,
    readPostpone: async () => parseAppUpdatePostpone(await kv.getItem(APP_UPDATE_POSTPONE_STORAGE_KEY)),
    writePostpone: async (entry) => {
      await kv.setItem(APP_UPDATE_POSTPONE_STORAGE_KEY, JSON.stringify(entry));
    },
    getCopy: () => COPY,
    isAppActive: () => active,
    delay: async () => {},
    settleMs: 0,
    fetchMinIntervalMs: 15_000,
    fetchRetryMs: 1_000,
    postponeMs: POSTPONE_DURATION_MS,
    openStoreUrl: (url) => {
      opened.push(url);
    },
    presentNotice: (args) => {
      presented.push({
        latestVersion: args.latestVersion,
        storeUrl: args.storeUrl,
        copy: args.copy,
      });
      h.lastOnUpdate = args.onUpdate;
      h.lastOnLater = args.onLater;
    },
  };

  h.session = createAppUpdateNoticeSession(deps);
  return h;
}

describe('createAppUpdateNoticeSession (simulated policy)', () => {
  it('presents EN copy and opens the canonical Play URL on Update', async () => {
    const h = harness();
    await h.session.consult('start');
    assert.equal(h.presented.length, 1);
    assert.equal(h.presented[0].copy.title, 'A new version is available');
    assert.equal(h.presented[0].copy.update, 'Update');
    assert.equal(h.presented[0].copy.later, 'Later');
    assert.equal(h.presented[0].storeUrl, PLAY);
    h.lastOnUpdate?.();
    assert.deepEqual(h.opened, [PLAY]);
  });

  it('Later postpones 24h for that version and skips duplicates', async () => {
    const h = harness();
    await h.session.consult('start');
    await h.session.consult('start');
    assert.equal(h.presented.length, 1);
    h.lastOnLater?.();
    await h.session.consult('start');
    assert.equal(h.presented.length, 1);
    h.setNow(1_000 + POSTPONE_DURATION_MS + 1);
    await h.session.consult('start');
    assert.equal(h.presented.length, 2);
  });

  it('does not show when enabled=false even if latest is newer', async () => {
    const h = harness({
      fetch: async () => policy({ enabled: false, latestVersion: '9.9.9' }),
    });
    await h.session.consult('start');
    assert.equal(h.presented.length, 0);
  });

  it('continues normally on error, offline, or invalid config', async () => {
    const offline = harness({
      fetch: async () => {
        throw new Error('network');
      },
    });
    await offline.session.consult('start');
    assert.equal(offline.presented.length, 0);

    const invalid = harness({
      fetch: async () => ({ enabled: true }),
    });
    await invalid.session.consult('start');
    assert.equal(invalid.presented.length, 0);
  });

  it('sends only { platform: "android" } and throttles fetches', async () => {
    const h = harness();
    await h.session.consult('start');
    await h.session.consult('foreground');
    assert.deepEqual(h.fetchCalls, [{ platform: 'android' }]);
    h.setNow(1_000 + 15_000);
    h.lastOnLater?.();
    await h.session.consult('foreground');
    assert.equal(h.fetchCalls.length, 2);
    for (const call of h.fetchCalls) {
      assert.deepEqual(Object.keys(call), ['platform']);
    }
  });

  it('does not present while inactive (OAuth / permissions)', async () => {
    const h = harness({ active: false });
    await h.session.consult('foreground');
    assert.equal(h.presented.length, 0);
    assert.equal(h.fetchCalls.length, 0);
  });

  it('Spanish copy is wired for Actualizar / Más tarde', () => {
    assert.equal(
      appUpdateTranslations.es.title,
      'Hay una nueva versión disponible',
    );
    assert.equal(appUpdateTranslations.es.update, 'Actualizar');
    assert.equal(appUpdateTranslations.es.later, 'Más tarde');
  });
});

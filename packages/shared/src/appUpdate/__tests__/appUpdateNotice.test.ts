/**
 * Android app-update policy contract v2 — behavior tests with simulated
 * Functions responses (Functions PR #43 @ 5e524d1cd2cfa7b3d58137bd5d07cda71e927a45).
 * Does not enable any production server flag.
 *
 * Run: node --experimental-strip-types --test packages/shared/src/appUpdate/__tests__/appUpdateNotice.test.ts
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  parseAndroidAppUpdateChannel,
  resolveAndroidAppUpdateChannel,
} from '../channel.ts';
import { compareReleases } from '../compareVersions.ts';
import {
  ANDROID_PLAY_INTERNAL_URL,
  ANDROID_PLAY_STORE_URL,
  type AndroidAppUpdateChannel,
  type AppUpdateReleaseTarget,
} from '../contract.ts';
import {
  decideAppUpdate,
  type AppUpdatePostpone,
  type CachedAppUpdatePolicy,
} from '../decideNotice.ts';
import {
  createAppUpdateNoticeSession,
  POSTPONE_DURATION_MS,
  type AppUpdateCopy,
  type AppUpdateFetchRequest,
  type AppUpdateNoticeDeps,
} from '../noticeSession.ts';
import {
  allowlistedAndroidUpdateUrl,
  buildAppUpdatePolicyRequest,
  isInvalidArgumentError,
  parseAppUpdatePolicyLegacy,
  parseAppUpdatePolicyV2,
} from '../parsePolicy.ts';
import {
  APP_UPDATE_POSTPONE_STORAGE_KEY,
  parseAppUpdatePostpone,
} from '../postponeStore.ts';
import { appUpdateTranslations } from '../../i18n/resources/appUpdate.ts';

const PROD = ANDROID_PLAY_STORE_URL;
const INTERNAL = ANDROID_PLAY_INTERNAL_URL;
const t = (marketingVersion: string, build: string): AppUpdateReleaseTarget => ({
  marketingVersion,
  build,
});
const EMPTY = t('', '');

function wire(
  channel: AndroidAppUpdateChannel = 'production',
  overrides: Record<string, unknown> = {},
) {
  const url = channel === 'production' ? PROD : INTERNAL;
  return {
    platform: 'android',
    channel,
    appId: 'com.nearsy.app',
    softEnabled: true,
    recommended: t('2.1.0', '50'),
    forceEnabled: false,
    minimum: EMPTY,
    updateUrl: url,
    cacheTtlSeconds: 3600,
    enabled: true,
    latestVersion: '2.1.0',
    storeUrl: url,
    ...overrides,
  };
}

function invalidArgument(): Error {
  return Object.assign(new Error('invalid'), {
    code: 'functions/invalid-argument',
  });
}

const flush = async () => {
  for (let i = 0; i < 6; i += 1) await new Promise((r) => setImmediate(r));
};

describe('channel detection (explicit build-time extra)', () => {
  it('accepts only the exact Android contract channels', () => {
    assert.equal(parseAndroidAppUpdateChannel('production'), 'production');
    assert.equal(parseAndroidAppUpdateChannel('playInternal'), 'playInternal');
    for (const bad of ['testflight', 'Production', 'internal', '', null, 3]) {
      assert.equal(parseAndroidAppUpdateChannel(bad), null);
    }
  });

  it('is NOT inferred from Firebase env / project / dev-client extras', () => {
    assert.equal(
      resolveAndroidAppUpdateChannel({
        nearsyFirebaseEnv: 'production',
        nearsyFirebaseProjectId: 'nearsy-pj',
        nearsyDevClient: false,
      } as never),
      null,
    );
    assert.equal(resolveAndroidAppUpdateChannel(null), null);
    assert.equal(resolveAndroidAppUpdateChannel(undefined), null);
    assert.equal(
      resolveAndroidAppUpdateChannel({ nearsyAppUpdateChannel: 'playInternal' }),
      'playInternal',
    );
  });
});

describe('request builder', () => {
  it('sends exactly { platform, channel }', () => {
    for (const channel of ['production', 'playInternal'] as const) {
      const request = buildAppUpdatePolicyRequest(channel);
      assert.deepEqual(request, { platform: 'android', channel });
      assert.deepEqual(Object.keys(request), ['platform', 'channel']);
    }
  });

  it('recognizes pre-v2 invalid-argument shapes', () => {
    assert.equal(isInvalidArgumentError(invalidArgument()), true);
    assert.equal(isInvalidArgumentError({ code: 'invalid-argument' }), true);
    assert.equal(isInvalidArgumentError({ nativeErrorCode: 'INVALID_ARGUMENT' }), true);
    assert.equal(isInvalidArgumentError({ code: 'functions/unavailable' }), false);
    assert.equal(isInvalidArgumentError(new Error('x')), false);
    assert.equal(isInvalidArgumentError(null), false);
  });
});

describe('compareReleases (marketing then build, numeric)', () => {
  it('orders by version tuple first, then build', () => {
    assert.ok(compareReleases(t('2.0.9', '44'), t('2.0.9', '45'))! < 0);
    assert.ok(compareReleases(t('2.0.9', '45'), t('2.0.9', '44'))! > 0);
    assert.equal(compareReleases(t('2.0.9', '44'), t('2.0.9', '44')), 0);
    // marketing wins over build
    assert.ok(compareReleases(t('2.0.9', '999'), t('2.0.10', '1'))! < 0);
    assert.ok(compareReleases(t('2.1.0', '1'), t('2.0.9', '999'))! > 0);
  });

  it('compares builds numerically, not lexically, without precision loss', () => {
    assert.ok(compareReleases(t('2.0.9', '9'), t('2.0.9', '10'))! < 0);
    assert.ok(
      compareReleases(t('2.0.9', '9007199254740993'), t('2.0.9', '9007199254740992'))! > 0,
    );
  });

  it('rejects invalid identities', () => {
    assert.equal(compareReleases(t('2.0.9-rc1', '1'), t('2.0.9', '1')), null);
    assert.equal(compareReleases(t('2.0.9', '01'), t('2.0.9', '1')), null);
    assert.equal(compareReleases(t('2.0.9', ''), t('2.0.9', '1')), null);
  });
});

describe('parseAppUpdatePolicyV2', () => {
  it('parses the full v2 response and ignores unknown keys', () => {
    const parsed = parseAppUpdatePolicyV2(
      wire('playInternal', {
        forceEnabled: true,
        minimum: t('2.0.9', '45'),
        required: true,
        minVersion: '9.9.9',
        somethingNew: 1,
      }),
      'playInternal',
    );
    assert.deepEqual(parsed, {
      source: 'v2',
      platform: 'android',
      channel: 'playInternal',
      softEnabled: true,
      recommended: t('2.1.0', '50'),
      forceEnabled: true,
      minimum: t('2.0.9', '45'),
      updateUrl: INTERNAL,
      cacheTtlSeconds: 3600,
    });
    assert.equal(parsed && 'required' in parsed, false);
  });

  it('treats the neutral response as not configured', () => {
    const parsed = parseAppUpdatePolicyV2(
      wire('production', {
        softEnabled: false,
        enabled: false,
        recommended: EMPTY,
        latestVersion: '',
      }),
      'production',
    );
    assert.equal(parsed?.softEnabled, false);
    assert.equal(parsed?.recommended, null);
    assert.equal(parsed?.minimum, null);
    assert.equal(parsed?.forceEnabled, false);
  });

  it('falls back to legacy aliases only when v2 fields are absent', () => {
    const aliasOnly = {
      platform: 'android',
      channel: 'production',
      enabled: true,
      latestVersion: '2.1.0',
      storeUrl: PROD,
    };
    const parsed = parseAppUpdatePolicyV2(aliasOnly, 'production');
    assert.equal(parsed?.softEnabled, true);
    assert.deepEqual(parsed?.recommended, t('2.1.0', '0'));
    assert.equal(parsed?.updateUrl, PROD);
    assert.equal(parsed?.cacheTtlSeconds, 3600);

    // v2 fields win over conflicting aliases.
    const conflicting = parseAppUpdatePolicyV2(
      wire('production', { enabled: true, softEnabled: false, latestVersion: '9.9.9' }),
      'production',
    );
    assert.equal(conflicting?.softEnabled, false);
    assert.deepEqual(conflicting?.recommended, t('2.1.0', '50'));
  });

  it('treats a half-set minimum as not configured (never force)', () => {
    const parsed = parseAppUpdatePolicyV2(
      wire('production', { forceEnabled: true, minimum: t('2.0.9', '') }),
      'production',
    );
    assert.equal(parsed?.forceEnabled, true);
    assert.equal(parsed?.minimum, null);
  });

  it('fails open on invalid / foreign policies', () => {
    assert.equal(parseAppUpdatePolicyV2(null, 'production'), null);
    assert.equal(parseAppUpdatePolicyV2([], 'production'), null);
    assert.equal(parseAppUpdatePolicyV2(wire('playInternal'), 'production'), null);
    assert.equal(
      parseAppUpdatePolicyV2(wire('production', { platform: 'ios' }), 'production'),
      null,
    );
    assert.equal(
      parseAppUpdatePolicyV2(
        wire('production', { recommended: t('2.1.0-internal', '5') }),
        'production',
      ),
      null,
    );
    assert.equal(
      parseAppUpdatePolicyV2(wire('production', { cacheTtlSeconds: 5 }), 'production'),
      null,
    );
    assert.equal(
      parseAppUpdatePolicyV2(wire('production', { cacheTtlSeconds: '3600' }), 'production'),
      null,
    );
    assert.equal(
      parseAppUpdatePolicyV2(wire('production', { forceEnabled: 'yes' }), 'production'),
      null,
    );
    // Legacy response without `channel` is not a v2 answer.
    assert.equal(
      parseAppUpdatePolicyV2(
        { platform: 'android', enabled: true, latestVersion: '2.1.0', storeUrl: PROD },
        'production',
      ),
      null,
    );
  });

  it('enforces channel-scoped destinations', () => {
    // Internal never routes to the public listing, production never to testing.
    assert.equal(
      parseAppUpdatePolicyV2(wire('playInternal', { updateUrl: PROD }), 'playInternal'),
      null,
    );
    assert.equal(
      parseAppUpdatePolicyV2(wire('production', { updateUrl: INTERNAL }), 'production'),
      null,
    );
    for (const bad of [
      'http://play.google.com/store/apps/details?id=com.nearsy.app',
      'https://evil.example/store/apps/details?id=com.nearsy.app',
      'https://play.google.com/store/apps/details?id=com.other.app',
      'https://play.google.com.evil.example/store/apps/details?id=com.nearsy.app',
      'https://apps.apple.com/app/id6759302206',
      'https://play.google.com/store/apps/details?id=com.nearsy.app#x',
      'javascript:alert(1)',
      '',
    ]) {
      assert.equal(allowlistedAndroidUpdateUrl(bad, 'production'), null, bad);
    }
    assert.equal(
      allowlistedAndroidUpdateUrl(`${PROD}&hl=en`, 'production'),
      `${PROD}&hl=en`,
    );
    assert.equal(
      allowlistedAndroidUpdateUrl(
        'https://play.google.com/apps/internaltest/4700000000000000000',
        'playInternal',
      ),
      'https://play.google.com/apps/internaltest/4700000000000000000',
    );
    assert.equal(
      allowlistedAndroidUpdateUrl('https://play.google.com/apps/testing/com.other.app', 'playInternal'),
      null,
    );
  });
});

describe('parseAppUpdatePolicyLegacy', () => {
  it('maps pre-v2 to production soft with build 0, never force', () => {
    const parsed = parseAppUpdatePolicyLegacy({
      platform: 'android',
      enabled: true,
      latestVersion: '2.1.0',
      storeUrl: PROD,
      required: true,
    });
    assert.equal(parsed?.channel, 'production');
    assert.equal(parsed?.source, 'legacy');
    assert.equal(parsed?.softEnabled, true);
    assert.deepEqual(parsed?.recommended, t('2.1.0', '0'));
    assert.equal(parsed?.forceEnabled, false);
    assert.equal(parsed?.minimum, null);
  });

  it('empty latestVersion is not configured; bad URLs are invalid', () => {
    const empty = parseAppUpdatePolicyLegacy({
      platform: 'android',
      enabled: true,
      latestVersion: '',
      storeUrl: PROD,
    });
    assert.equal(empty?.softEnabled, false);
    assert.equal(
      parseAppUpdatePolicyLegacy({
        platform: 'android',
        enabled: true,
        latestVersion: '2.1.0',
        storeUrl: INTERNAL,
      }),
      null,
    );
  });
});

function cachedFrom(
  channel: AndroidAppUpdateChannel,
  overrides: Record<string, unknown> = {},
  at = { fetchedAtMs: 1_000, expiresAtMs: 1_000 + 3_600_000 },
): CachedAppUpdatePolicy {
  const policy = parseAppUpdatePolicyV2(wire(channel, overrides), channel);
  assert.ok(policy, 'fixture policy must parse');
  return { policy, ...at };
}

describe('decideAppUpdate', () => {
  const installed = t('2.0.9', '44');
  const base = { nowMs: 2_000, postpone: null, modalVisible: false, installed };

  it('shows soft only when softEnabled and strictly behind (build within same version)', () => {
    const cached = cachedFrom('playInternal', { recommended: t('2.0.9', '45') });
    const decision = decideAppUpdate({ ...base, channel: 'playInternal', cached });
    assert.deepEqual(decision, {
      kind: 'soft',
      channel: 'playInternal',
      target: t('2.0.9', '45'),
      updateUrl: INTERNAL,
    });
    assert.equal(
      decideAppUpdate({
        ...base,
        channel: 'playInternal',
        cached: cachedFrom('playInternal', { recommended: t('2.0.9', '44') }),
      }).kind,
      'none',
    );
    assert.equal(
      decideAppUpdate({
        ...base,
        channel: 'playInternal',
        cached: cachedFrom('playInternal', { softEnabled: false }),
      }).kind,
      'none',
    );
  });

  it('never announces a partially configured recommended target', () => {
    for (const recommended of [EMPTY, t('2.1.0', ''), t('', '50')]) {
      assert.equal(
        decideAppUpdate({
          ...base,
          channel: 'production',
          cached: cachedFrom('production', { recommended }),
        }).kind,
        'none',
      );
    }
  });

  it('mandatory only when forceEnabled AND minimum fully set AND behind', () => {
    const forced = (over: Record<string, unknown>) =>
      decideAppUpdate({
        ...base,
        channel: 'production',
        cached: cachedFrom('production', {
          softEnabled: false,
          forceEnabled: true,
          minimum: t('2.0.9', '45'),
          ...over,
        }),
      });
    assert.equal(forced({}).kind, 'mandatory');
    assert.equal(forced({ forceEnabled: false }).kind, 'none');
    assert.equal(forced({ minimum: t('2.0.9', '') }).kind, 'none');
    assert.equal(forced({ minimum: EMPTY }).kind, 'none');
    assert.equal(forced({ minimum: t('2.0.9', '44') }).kind, 'none');
    assert.equal(forced({ minimum: t('2.0.8', '999') }).kind, 'none');
  });

  it('mandatory outranks soft and ignores deferral', () => {
    const decision = decideAppUpdate({
      ...base,
      channel: 'production',
      modalVisible: true,
      postpone: {
        marketingVersion: '2.1.0',
        build: '50',
        channel: 'production',
        untilMs: 9_999_999,
      },
      cached: cachedFrom('production', {
        forceEnabled: true,
        minimum: t('2.0.9', '45'),
      }),
    });
    assert.equal(decision.kind, 'mandatory');
  });

  it('fails open when expired, foreign-channel, or installed is unreadable', () => {
    const forced = cachedFrom('production', {
      forceEnabled: true,
      minimum: t('2.0.9', '45'),
    });
    assert.equal(
      decideAppUpdate({ ...base, channel: 'production', cached: forced, nowMs: forced.expiresAtMs }).kind,
      'none',
    );
    assert.equal(
      decideAppUpdate({ ...base, channel: 'production', cached: forced, nowMs: forced.expiresAtMs - 1 }).kind,
      'mandatory',
    );
    assert.equal(decideAppUpdate({ ...base, channel: 'playInternal', cached: forced }).kind, 'none');
    assert.equal(decideAppUpdate({ ...base, channel: 'production', cached: forced, installed: null }).kind, 'none');
    assert.equal(decideAppUpdate({ ...base, channel: 'production', cached: null }).kind, 'none');
  });

  it('defers per (marketingVersion, build, channel)', () => {
    const cached = cachedFrom('playInternal', { recommended: t('2.0.9', '45') });
    const postpone = (over: Partial<AppUpdatePostpone>): AppUpdatePostpone => ({
      marketingVersion: '2.0.9',
      build: '45',
      channel: 'playInternal',
      untilMs: 5_000,
      ...over,
    });
    const run = (p: AppUpdatePostpone | null, nowMs = 2_000) =>
      decideAppUpdate({ ...base, nowMs, channel: 'playInternal', cached, postpone: p }).kind;
    assert.equal(run(postpone({})), 'none');
    assert.equal(run(postpone({}), 5_000), 'soft');
    assert.equal(run(postpone({ build: '44' })), 'soft');
    assert.equal(run(postpone({ marketingVersion: '2.0.8' })), 'soft');
    assert.equal(run(postpone({ channel: 'production' })), 'soft');
  });
});

describe('postpone storage', () => {
  it('round-trips the v2 shape and rejects the v1 shape', () => {
    assert.deepEqual(
      parseAppUpdatePostpone(
        JSON.stringify({ marketingVersion: '2.0.9', build: '45', channel: 'playInternal', untilMs: 9 }),
      ),
      { marketingVersion: '2.0.9', build: '45', channel: 'playInternal', untilMs: 9 },
    );
    assert.equal(parseAppUpdatePostpone(JSON.stringify({ version: '2.1.0', untilMs: 9 })), null);
    assert.equal(parseAppUpdatePostpone('nope'), null);
    assert.equal(APP_UPDATE_POSTPONE_STORAGE_KEY.endsWith('.v2'), true);
  });
});

// ---------------------------------------------------------------- session

const COPY = (channel: AndroidAppUpdateChannel): AppUpdateCopy => ({
  soft: {
    title: appUpdateTranslations.en.title,
    message:
      channel === 'playInternal'
        ? appUpdateTranslations.en.messageInternal
        : appUpdateTranslations.en.message,
    update: appUpdateTranslations.en.update,
    later: appUpdateTranslations.en.later,
  },
  mandatory: {
    title: appUpdateTranslations.en.mandatoryTitle,
    message: appUpdateTranslations.en.mandatoryMessage,
    update: appUpdateTranslations.en.update,
  },
});

type Timer = { at: number; run: () => void; cancelled: boolean };

function harness(opts: {
  channel?: AndroidAppUpdateChannel | null;
  installed?: AppUpdateReleaseTarget | null;
  fetch?: (request: AppUpdateFetchRequest, call: number) => Promise<unknown>;
  active?: boolean;
}) {
  let now = 1_000;
  let active = opts.active ?? true;
  let postpone: AppUpdatePostpone | null = null;
  const timers: Timer[] = [];
  const fetchCalls: AppUpdateFetchRequest[] = [];
  const soft: Array<{ target: AppUpdateReleaseTarget; updateUrl: string; message: string }> = [];
  const mandatory: Array<{ target: AppUpdateReleaseTarget; updateUrl: string }> = [];
  const opened: string[] = [];
  let dismissCount = 0;
  let mandatoryVisible = false;
  let lastSoft: { onUpdate: () => void; onLater: () => void } | null = null;
  let lastMandatory: { onUpdate: () => void } | null = null;
  const channel = opts.channel === undefined ? 'playInternal' : opts.channel;

  const deps: AppUpdateNoticeDeps = {
    channel,
    now: () => now,
    fetchPolicy: async (request) => {
      fetchCalls.push(request);
      if (!opts.fetch) throw new Error('no fetch');
      return opts.fetch(request, fetchCalls.length);
    },
    getInstalledRelease: () =>
      opts.installed === undefined ? t('2.0.9', '44') : opts.installed,
    readPostpone: async () => postpone,
    writePostpone: async (entry) => {
      postpone = entry;
    },
    getCopy: COPY,
    isAppActive: () => active,
    delay: async () => {},
    settleMs: 0,
    fetchRetryMs: 1_000,
    scheduleTimeout: (run, ms) => {
      const timer: Timer = { at: now + ms, run, cancelled: false };
      timers.push(timer);
      return () => {
        timer.cancelled = true;
      };
    },
    openUpdateUrl: (url) => opened.push(url),
    presentNotice: (args) => {
      soft.push({ target: args.target, updateUrl: args.updateUrl, message: args.copy.message });
      lastSoft = args;
    },
    presentMandatory: (args) => {
      mandatory.push({ target: args.target, updateUrl: args.updateUrl });
      mandatoryVisible = true;
      lastMandatory = args;
    },
    dismissMandatory: () => {
      dismissCount += 1;
      mandatoryVisible = false;
    },
  };
  const session = createAppUpdateNoticeSession(deps);

  return {
    session,
    fetchCalls,
    soft,
    mandatory,
    opened,
    get dismissCount() {
      return dismissCount;
    },
    get mandatoryVisible() {
      return mandatoryVisible;
    },
    get postpone() {
      return postpone;
    },
    get lastSoft() {
      return lastSoft;
    },
    get lastMandatory() {
      return lastMandatory;
    },
    setActive: (v: boolean) => {
      active = v;
    },
    /** Move the clock and fire due, non-cancelled timers. */
    advance: async (ms: number) => {
      now += ms;
      for (const timer of timers) {
        if (!timer.cancelled && timer.at <= now) {
          timer.cancelled = true;
          timer.run();
        }
      }
      await flush();
    },
    pendingTimers: () => timers.filter((x) => !x.cancelled).length,
  };
}

describe('session: channels, requests, destinations', () => {
  it('Internal install sends channel=playInternal and opens only the Internal updateUrl', async () => {
    const h = harness({
      channel: 'playInternal',
      installed: t('2.0.9', '44'),
      fetch: async () => wire('playInternal', { recommended: t('2.0.9', '45') }),
    });
    await h.session.consult('start');
    assert.deepEqual(h.fetchCalls, [{ platform: 'android', channel: 'playInternal' }]);
    assert.equal(h.soft.length, 1);
    assert.equal(h.soft[0].updateUrl, INTERNAL);
    assert.equal(h.soft[0].message, appUpdateTranslations.en.messageInternal);
    h.lastSoft!.onUpdate();
    assert.deepEqual(h.opened, [INTERNAL]);
  });

  it('production install sends channel=production and opens the public listing', async () => {
    const h = harness({
      channel: 'production',
      fetch: async () => wire('production', { recommended: t('2.1.0', '50') }),
    });
    await h.session.consult('start');
    assert.deepEqual(h.fetchCalls, [{ platform: 'android', channel: 'production' }]);
    assert.equal(h.soft[0].updateUrl, PROD);
    h.lastSoft!.onUpdate();
    assert.deepEqual(h.opened, [PROD]);
  });

  it('never opens the public store for Internal even if the server answers production', async () => {
    const h = harness({
      channel: 'playInternal',
      fetch: async () => wire('production'),
    });
    await h.session.consult('start');
    assert.equal(h.soft.length, 0);
    assert.equal(h.mandatory.length, 0);
  });

  it('does nothing and never fetches when the channel is unknown', async () => {
    const h = harness({ channel: null, fetch: async () => wire('production') });
    await h.session.consult('start');
    await h.session.consult('foreground');
    assert.equal(h.fetchCalls.length, 0);
    assert.equal(h.soft.length + h.mandatory.length, 0);
  });

  it('does not announce when soft is off, or installed is current / newer', async () => {
    for (const [policyOver, installed] of [
      [{ softEnabled: false, enabled: false }, t('2.0.9', '44')],
      [{ recommended: t('2.0.9', '44') }, t('2.0.9', '44')],
      [{ recommended: t('2.0.9', '44') }, t('2.0.9', '60')],
      [{ recommended: t('2.0.9', '44') }, t('2.1.0', '1')],
    ] as const) {
      const h = harness({
        channel: 'playInternal',
        installed,
        fetch: async () => wire('playInternal', policyOver),
      });
      await h.session.consult('start');
      assert.equal(h.soft.length, 0);
    }
  });

  it('does not present while the app is inactive', async () => {
    const h = harness({ active: false, fetch: async () => wire('playInternal') });
    await h.session.consult('foreground');
    assert.equal(h.fetchCalls.length, 0);
    assert.equal(h.soft.length, 0);
  });
});

describe('session: legacy (pre-v2) server compatibility', () => {
  const legacyAnswer = {
    platform: 'android',
    enabled: true,
    latestVersion: '2.1.0',
    storeUrl: PROD,
  };
  const legacyServer = async (request: AppUpdateFetchRequest) => {
    if ('channel' in request) throw invalidArgument();
    return legacyAnswer;
  };

  it('production: retries WITHOUT channel and shows the production soft notice', async () => {
    const h = harness({ channel: 'production', installed: t('2.0.9', '44'), fetch: legacyServer });
    await h.session.consult('start');
    assert.deepEqual(h.fetchCalls, [
      { platform: 'android', channel: 'production' },
      { platform: 'android' },
    ]);
    assert.equal(h.soft.length, 1);
    assert.deepEqual(h.soft[0].target, t('2.1.0', '0'));
    assert.equal(h.soft[0].updateUrl, PROD);
  });

  it('production: same marketing version never notices on the legacy surface', async () => {
    const h = harness({
      channel: 'production',
      installed: t('2.1.0', '44'),
      fetch: legacyServer,
    });
    await h.session.consult('start');
    assert.equal(h.soft.length, 0);
  });

  it('Internal: fails open without retrying and never applies the production policy', async () => {
    const h = harness({ channel: 'playInternal', installed: t('2.0.9', '44'), fetch: legacyServer });
    await h.session.consult('start');
    assert.deepEqual(h.fetchCalls, [{ platform: 'android', channel: 'playInternal' }]);
    assert.equal(h.soft.length, 0);
    assert.equal(h.mandatory.length, 0);
    // calm cadence: no re-hammering on the next foreground
    await h.session.consult('foreground');
    assert.equal(h.fetchCalls.length, 1);
  });

  it('only falls back on invalid-argument, not on network errors', async () => {
    const h = harness({
      channel: 'production',
      fetch: async () => {
        throw Object.assign(new Error('offline'), { code: 'functions/unavailable' });
      },
    });
    await h.session.consult('start');
    assert.equal(h.fetchCalls.length, 1);
    assert.equal(h.soft.length, 0);
  });

  it('rejects a legacy answer that is not the public production listing', async () => {
    const h = harness({
      channel: 'production',
      fetch: async (request) => {
        if ('channel' in request) throw invalidArgument();
        return { ...legacyAnswer, storeUrl: INTERNAL };
      },
    });
    await h.session.consult('start');
    assert.equal(h.soft.length, 0);
  });
});

describe('session: optional soft notice + deferral', () => {
  it('Later defers that exact target; a new build target re-presents', async () => {
    let policy = wire('playInternal', { recommended: t('2.0.9', '45') });
    const h = harness({
      channel: 'playInternal',
      fetch: async () => policy,
    });
    await h.session.consult('start');
    assert.equal(h.soft.length, 1);
    h.lastSoft!.onLater();
    await flush();
    assert.deepEqual(h.postpone && { ...h.postpone, untilMs: 0 }, {
      marketingVersion: '2.0.9',
      build: '45',
      channel: 'playInternal',
      untilMs: 0,
    });

    // Same target, within ttl: stays deferred (no refetch either).
    await h.session.consult('foreground');
    assert.equal(h.soft.length, 1);

    // New recommended build after the cache TTL => re-presents despite deferral.
    policy = wire('playInternal', { recommended: t('2.0.9', '46') });
    await h.advance(3_600_000);
    await h.session.consult('foreground');
    assert.equal(h.soft.length, 2);
    assert.deepEqual(h.soft[1].target, t('2.0.9', '46'));
  });

  it('deferral lapses after 24h for the same target', async () => {
    const h = harness({
      channel: 'playInternal',
      fetch: async () => wire('playInternal', { recommended: t('2.0.9', '45') }),
    });
    await h.session.consult('start');
    h.lastSoft!.onLater();
    await flush();
    await h.advance(POSTPONE_DURATION_MS + 1);
    await h.session.consult('foreground');
    assert.equal(h.soft.length, 2);
  });

  it('does not stack a second soft notice while one is visible', async () => {
    const h = harness({
      channel: 'playInternal',
      fetch: async () => wire('playInternal', { recommended: t('2.0.9', '45'), cacheTtlSeconds: 60 }),
    });
    await h.session.consult('start');
    await h.advance(120_000);
    await h.session.consult('foreground');
    assert.equal(h.soft.length, 1);
  });

  it('re-checks no sooner than cacheTtlSeconds', async () => {
    const h = harness({
      channel: 'playInternal',
      fetch: async () => wire('playInternal', { softEnabled: false, enabled: false, cacheTtlSeconds: 300 }),
    });
    await h.session.consult('start');
    await h.advance(299_000);
    await h.session.consult('foreground');
    assert.equal(h.fetchCalls.length, 1);
    await h.advance(1_000);
    await h.session.consult('foreground');
    assert.equal(h.fetchCalls.length, 2);
  });

  it('keeps the last good soft policy through a transient failure until TTL', async () => {
    let calls = 0;
    const h = harness({
      channel: 'playInternal',
      fetch: async () => {
        calls += 1;
        if (calls === 1) return wire('playInternal', { recommended: t('2.0.9', '45'), cacheTtlSeconds: 3600 });
        throw new Error('offline');
      },
    });
    await h.session.consult('start');
    h.lastSoft!.onLater();
    await flush();
    // failures never produce anything new; deferral still holds
    await h.advance(1_000);
    await h.session.consult('foreground');
    assert.equal(h.soft.length, 1);
  });
});

describe('session: mandatory capability + fail open', () => {
  const forced = (over: Record<string, unknown> = {}) =>
    wire('playInternal', {
      softEnabled: false,
      enabled: false,
      forceEnabled: true,
      minimum: t('2.0.9', '45'),
      recommended: EMPTY,
      latestVersion: '',
      cacheTtlSeconds: 60,
      ...over,
    });

  it('presents mandatory only for forceEnabled + full minimum, Update opens Internal URL and does not dismiss', async () => {
    const h = harness({ channel: 'playInternal', fetch: async () => forced() });
    await h.session.consult('start');
    assert.equal(h.mandatory.length, 1);
    assert.equal(h.mandatory[0].updateUrl, INTERNAL);
    assert.deepEqual(h.mandatory[0].target, t('2.0.9', '45'));
    h.lastMandatory!.onUpdate();
    assert.deepEqual(h.opened, [INTERNAL]);
    assert.equal(h.mandatoryVisible, true);
    assert.equal(h.soft.length, 0);
  });

  it('does not block when force is off, minimum is partial/absent, or already satisfied', async () => {
    for (const over of [
      { forceEnabled: false },
      { minimum: t('2.0.9', '') },
      { minimum: EMPTY },
      { minimum: t('2.0.9', '44') },
    ]) {
      const h = harness({ channel: 'playInternal', fetch: async () => forced(over) });
      await h.session.consult('start');
      assert.equal(h.mandatory.length, 0, JSON.stringify(over));
    }
  });

  it('never blocks on network / invalid policy from a cold start', async () => {
    const offline = harness({
      channel: 'playInternal',
      fetch: async () => {
        throw new Error('offline');
      },
    });
    await offline.session.consult('start');
    const invalid = harness({ channel: 'playInternal', fetch: async () => ({ forceEnabled: true }) });
    await invalid.session.consult('start');
    assert.equal(offline.mandatory.length + invalid.mandatory.length, 0);
  });

  it('dismisses the mandatory surface when the policy TTL elapses and the refresh fails (fail open)', async () => {
    let calls = 0;
    const h = harness({
      channel: 'playInternal',
      fetch: async () => {
        calls += 1;
        if (calls === 1) return forced();
        throw new Error('offline');
      },
    });
    await h.session.consult('start');
    assert.equal(h.mandatoryVisible, true);
    assert.equal(h.pendingTimers(), 1);

    // Still within TTL: stays up even though a transient failure is possible.
    await h.advance(59_000);
    assert.equal(h.mandatoryVisible, true);

    // TTL elapses: timer fires, surface comes down, refresh fails => stays down.
    await h.advance(1_000);
    assert.equal(h.mandatoryVisible, false);
    assert.equal(h.dismissCount, 1);
    assert.equal(h.mandatory.length, 1);
    assert.equal(calls, 2);
  });

  it('dismisses on expiry even when the app is backgrounded (no refresh possible)', async () => {
    const h = harness({ channel: 'playInternal', fetch: async () => forced() });
    await h.session.consult('start');
    assert.equal(h.mandatoryVisible, true);
    h.setActive(false);
    await h.advance(60_000);
    assert.equal(h.mandatoryVisible, false);
    assert.equal(h.fetchCalls.length, 1);
  });

  it('re-presents after expiry only if a fresh valid policy still demands it', async () => {
    const h = harness({ channel: 'playInternal', fetch: async () => forced() });
    await h.session.consult('start');
    await h.advance(60_000);
    // refresh succeeded with force still on => blocking again, with a new TTL
    assert.equal(h.mandatory.length, 2);
    assert.equal(h.mandatoryVisible, true);
    assert.equal(h.fetchCalls.length, 2);
  });

  it('lifts the block when the refreshed policy turns force off', async () => {
    let calls = 0;
    const h = harness({
      channel: 'playInternal',
      fetch: async () => {
        calls += 1;
        return calls === 1 ? forced() : forced({ forceEnabled: false });
      },
    });
    await h.session.consult('start');
    await h.advance(60_000);
    assert.equal(h.mandatoryVisible, false);
  });

  it('lifts the block when the refresh is invalid or for the wrong channel', async () => {
    let calls = 0;
    const h = harness({
      channel: 'playInternal',
      fetch: async () => {
        calls += 1;
        return calls === 1 ? forced() : wire('production', { forceEnabled: true, minimum: t('9.9.9', '9') });
      },
    });
    await h.session.consult('start');
    await h.advance(60_000);
    assert.equal(h.mandatoryVisible, false);
    assert.equal(h.mandatory.length, 1);
  });

  it('dispose removes a visible mandatory surface and its timer', async () => {
    const h = harness({ channel: 'playInternal', fetch: async () => forced() });
    await h.session.consult('start');
    h.session.dispose();
    assert.equal(h.mandatoryVisible, false);
    assert.equal(h.pendingTimers(), 0);
  });

  it('unreadable installed version never blocks', async () => {
    const h = harness({ channel: 'playInternal', installed: null, fetch: async () => forced() });
    await h.session.consult('start');
    assert.equal(h.mandatory.length, 0);
  });
});

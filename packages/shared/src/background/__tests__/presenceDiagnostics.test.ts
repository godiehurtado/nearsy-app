/**
 * Background presence diagnostics — rate limits, buckets, no PII in lines.
 *
 * Run:
 *   node --experimental-strip-types --test packages/shared/src/background/__tests__/presenceDiagnostics.test.ts
 */
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  accuracyBucket,
  classifyAndroidCallbackStop,
  classifyAndroidStartBlock,
  classifyCallableStop,
  classifyIosRuntimeStop,
  configurePresenceDiagnostics,
  decideLocBgEmit,
  formatLocBgLine,
  gapBucket,
  buildPresenceDiagnosticsExport,
  formatPresenceDiagnosticsExport,
  getPresenceDiagnosticsCountsForTests,
  getPresenceDiagnosticsRingForTests,
  LOC_BG_EVIDENCE_WINDOW_MS,
  LOC_BG_LOG_PREFIX,
  LOC_BG_SKIP_DEBOUNCE_MS,
  recordPresenceEvent,
  resetPresenceDiagnosticsForTests,
  sanitizeLocBgRecord,
  type DiagStorage,
  type LocBgRecord,
} from '../presenceDiagnostics.ts';

function memoryStorage(initial = ''): DiagStorage & { raw: string } {
  const box = { raw: initial };
  return {
    get raw() {
      return box.raw;
    },
    set raw(v: string) {
      box.raw = v;
    },
    async getItem() {
      return box.raw || null;
    },
    async setItem(_key: string, value: string) {
      box.raw = value;
    },
  };
}

afterEach(() => {
  resetPresenceDiagnosticsForTests();
});

describe('buckets', () => {
  it('maps accuracy without exposing meters in the bucket name', () => {
    assert.equal(accuracyBucket(undefined), 'missing');
    assert.equal(accuracyBucket(Number.NaN), 'missing');
    assert.equal(accuracyBucket(10), 'le25');
    assert.equal(accuracyBucket(40), 'le50');
    assert.equal(accuracyBucket(100), 'le100');
    assert.equal(accuracyBucket(101), 'gt100');
    assert.equal(accuracyBucket(999), 'gt100');
  });

  it('maps callback gaps', () => {
    assert.equal(gapBucket(null), 'none');
    assert.equal(gapBucket(0), 'le15s');
    assert.equal(gapBucket(15_000), 'le15s');
    assert.equal(gapBucket(15_001), 'le60s');
    assert.equal(gapBucket(5 * 60_000), 'le5m');
    assert.equal(gapBucket(5 * 60_000 + 1), 'le15m');
    assert.equal(gapBucket(20 * 60_000), 'gt15m');
  });
});

describe('decideLocBgEmit', () => {
  const base = {
    lastCallbackAtMs: null as number | null,
    lastPublishOkAtMs: null as number | null,
    lastCallbackGap: null,
    lastPublishOkGap: null,
    lastSkipAt: {} as Record<string, number>,
    lastBlockAt: {} as Record<string, number>,
    firstAtMs: null as number | null,
    lastAtMs: null as number | null,
    counts: {
      start_ok: 0,
      start_blocked: 0,
      stop: 0,
      callback: 0,
      skip: 0,
      publish_ok: 0,
      publish_fail: 0,
      resume: 0,
      skipBy: {},
      stopBy: {},
      blockBy: {},
    },
    ring: [] as LocBgRecord[],
  };

  it('always emits start/stop/resume/publish_fail', () => {
    for (const event of ['start_ok', 'stop', 'resume', 'publish_fail'] as const) {
      const d = decideLocBgEmit(
        base,
        { event, platform: 'android' },
        1_000,
      );
      assert.equal(d.emit, true, event);
    }
  });

  it('emits callback only when gap bucket changes', () => {
    const first = decideLocBgEmit(
      base,
      { event: 'callback', platform: 'ios' },
      1_000,
    );
    assert.equal(first.emit, true);
    assert.equal(first.gap, 'none');

    const steady = decideLocBgEmit(
      {
        ...base,
        lastCallbackAtMs: 1_000,
        lastCallbackGap: 'le15s',
      },
      { event: 'callback', platform: 'ios' },
      1_000 + 14_000,
    );
    assert.equal(steady.emit, false);

    const jumped = decideLocBgEmit(
      {
        ...base,
        lastCallbackAtMs: 1_000,
        lastCallbackGap: 'le15s',
      },
      { event: 'callback', platform: 'ios' },
      1_000 + 120_000,
    );
    assert.equal(jumped.emit, true);
    assert.equal(jumped.gap, 'le5m');
  });

  it('debounces identical skip class for 60s', () => {
    const first = decideLocBgEmit(
      base,
      { event: 'skip', platform: 'android', skip: 'invalid_accuracy' },
      5_000,
    );
    assert.equal(first.emit, true);
    const again = decideLocBgEmit(
      { ...base, lastSkipAt: { invalid_accuracy: 5_000 } },
      { event: 'skip', platform: 'android', skip: 'invalid_accuracy' },
      5_000 + LOC_BG_SKIP_DEBOUNCE_MS - 1,
    );
    assert.equal(again.emit, false);
    const later = decideLocBgEmit(
      { ...base, lastSkipAt: { invalid_accuracy: 5_000 } },
      { event: 'skip', platform: 'android', skip: 'invalid_accuracy' },
      5_000 + LOC_BG_SKIP_DEBOUNCE_MS,
    );
    assert.equal(later.emit, true);
  });

  it('debounces identical start_blocked class for 60s', () => {
    const first = decideLocBgEmit(
      base,
      { event: 'start_blocked', platform: 'android', block: 'permission' },
      5_000,
    );
    assert.equal(first.emit, true);
    const again = decideLocBgEmit(
      { ...base, lastBlockAt: { permission: 5_000 } },
      { event: 'start_blocked', platform: 'android', block: 'permission' },
      5_000 + LOC_BG_SKIP_DEBOUNCE_MS - 1,
    );
    assert.equal(again.emit, false);
  });
});

describe('classifiers', () => {
  it('maps Android start gates', () => {
    assert.equal(
      classifyAndroidStartBlock('gate', 'session-unconfirmed'),
      'session_unconfirmed',
    );
    assert.equal(classifyAndroidStartBlock('gate', 'approximate'), 'approximate');
    assert.equal(
      classifyAndroidStartBlock('foreground-denied', undefined),
      'permission',
    );
    assert.equal(
      classifyAndroidStartBlock('gate', 'visibility-off'),
      'visibility_off',
    );
  });

  it('maps Android callback stop without reading uid values', () => {
    assert.equal(
      classifyAndroidCallbackStop({
        authUid: null,
        storedTaskUid: 'x',
        hasRuntimeAuth: true,
        foregroundGranted: true,
        backgroundGranted: true,
        fineLocationGranted: true,
      }),
      'logout',
    );
    assert.equal(
      classifyAndroidCallbackStop({
        authUid: 'a',
        storedTaskUid: 'a',
        hasRuntimeAuth: true,
        foregroundGranted: true,
        backgroundGranted: false,
        fineLocationGranted: true,
      }),
      'permission_revoked',
    );
    assert.equal(
      classifyAndroidCallbackStop({
        authUid: 'a',
        storedTaskUid: 'a',
        hasRuntimeAuth: true,
        foregroundGranted: true,
        backgroundGranted: true,
        fineLocationGranted: false,
      }),
      'approximate',
    );
  });

  it('maps iOS runtime stop', () => {
    assert.equal(
      classifyIosRuntimeStop({
        hasUid: true,
        visibilityOn: false,
        bgVisible: true,
        permissionOk: true,
        startThrew: false,
      }),
      'visibility_off',
    );
    assert.equal(
      classifyIosRuntimeStop({
        hasUid: true,
        visibilityOn: true,
        bgVisible: true,
        permissionOk: false,
        startThrew: false,
      }),
      'permission_revoked',
    );
  });

  it('maps callable stop from enums, not message bodies', () => {
    assert.equal(
      classifyCallableStop({ code: 'unauthenticated' }),
      'callable_auth',
    );
    assert.equal(
      classifyCallableStop({ reason: 'visibility-inactive' }),
      'visibility_off',
    );
    assert.equal(
      classifyCallableStop({
        code: 'failed-precondition',
        reason: 'app check not ready',
      }),
      'callable_app_check',
    );
  });
});

describe('recordPresenceEvent', () => {
  it('writes sanitized lines without coord/token/uid keys', async () => {
    const lines: string[] = [];
    const store = memoryStorage();
    configurePresenceDiagnostics({
      storage: store,
      log: (line) => lines.push(line),
      now: () => 1_700_000_000_000,
    });
    await recordPresenceEvent({
      event: 'stop',
      platform: 'android',
      stop: 'headless_not_ready',
      started: false,
    });
    assert.equal(lines.length, 1);
    assert.equal(lines[0].startsWith(`${LOC_BG_LOG_PREFIX} `), true);
    assert.doesNotMatch(lines[0], /latitude|longitude|token|uid-|@|Bearer/i);
    const rec = JSON.parse(lines[0].slice(LOC_BG_LOG_PREFIX.length + 1));
    assert.equal(rec.e, 'stop');
    assert.equal(rec.stop, 'headless_not_ready');
    assert.equal(getPresenceDiagnosticsRingForTests().length, 1);
    assert.equal(getPresenceDiagnosticsCountsForTests().stop, 1);
    assert.equal(
      getPresenceDiagnosticsCountsForTests().stopBy.headless_not_ready,
      1,
    );
  });

  it('dumps the ring on resume', async () => {
    const lines: string[] = [];
    configurePresenceDiagnostics({
      storage: memoryStorage(),
      log: (line) => lines.push(line),
      now: () => 50,
    });
    await recordPresenceEvent({ event: 'start_ok', platform: 'ios' });
    await recordPresenceEvent({
      event: 'resume',
      platform: 'ios',
      appState: 'active',
    });
    assert.equal(lines.length, 3);
    assert.match(lines[2], /\[loc\.bg\.ring\] n=2/);
  });
});

describe('15-minute evidence', () => {
  it('counts suppressed callback and publish_ok across 15 minutes', async () => {
    let now = 1_000;
    configurePresenceDiagnostics({
      storage: memoryStorage(),
      log: () => {},
      now: () => now,
    });
    await recordPresenceEvent({ event: 'start_ok', platform: 'android' });
    const ticks = 1 + Math.floor(LOC_BG_EVIDENCE_WINDOW_MS / 15_000);
    for (let i = 0; i < ticks; i += 1) {
      now = 1_000 + i * 15_000;
      await recordPresenceEvent({
        event: 'callback',
        platform: 'android',
        accuracyMeters: 20,
      });
      await recordPresenceEvent({
        event: 'publish_ok',
        platform: 'android',
        accuracyMeters: 20,
      });
    }
    const payload = buildPresenceDiagnosticsExport('android');
    assert.equal(payload.n.callback, ticks);
    assert.equal(payload.n.publish_ok, ticks);
    assert.equal(payload.n.start_ok, 1);
    assert.ok(payload.spanMin >= 15);
    assert.ok(
      payload.ring.filter((row) => row.e === 'callback').length <= 2,
    );
    assert.ok(
      payload.ring.filter((row) => row.e === 'publish_ok').length <= 2,
    );
    const json = formatPresenceDiagnosticsExport(payload);
    assert.doesNotMatch(json, /latitude|longitude|token|uid|@|Bearer/i);
    assert.match(json, /"callback":61/);
    assert.match(json, /"publish_ok":61/);
  });
});

describe('sanitize', () => {
  it('drops unknown fields', () => {
    const dirty = {
      t: 1,
      e: 'skip',
      plat: 'ios',
      skip: 'invalid_accuracy',
      latitude: 1.23,
      uid: 'secret',
    } as LocBgRecord & { latitude: number; uid: string };
    const clean = sanitizeLocBgRecord(dirty);
    assert.equal('latitude' in clean, false);
    assert.equal('uid' in clean, false);
    assert.equal(clean.skip, 'invalid_accuracy');
  });
});

describe('source contract', () => {
  it('does not log error message bodies or coordinates', () => {
    const src = readFileSync(
      fileURLToPath(new URL('../presenceDiagnostics.ts', import.meta.url)),
      'utf8',
    );
    const attach = readFileSync(
      fileURLToPath(new URL('../attachPresenceDiagnostics.ts', import.meta.url)),
      'utf8',
    );
    assert.match(src, /LOC_BG_LOG_PREFIX/);
    assert.match(attach, /hasStartedLocationUpdatesAsync/);
    const share = readFileSync(
      fileURLToPath(new URL('../sharePresenceDiagnostics.ts', import.meta.url)),
      'utf8',
    );
    assert.doesNotMatch(src, /latitude|longitude|idToken|accessToken/);
    assert.doesNotMatch(attach, /latitude|longitude|idToken|accessToken/);
    assert.doesNotMatch(share, /latitude|longitude|idToken|accessToken|email|phone/);
    assert.match(share, /Share\.share/);
  });
});

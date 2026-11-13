/**
 * Android 2.1.0, PostHog milestone 1 (Functions ANALYTICS_DISTINCT_ID_CONTRACT.md):
 * - proposal G: distinct_id per LinkedIn account generation, build-time cutover;
 * - user_id: the Firebase UID as a person property only;
 * - account deletion: hold, purge after success, restart-safe, never a permanent block.
 *
 * The queue cases run the real posthog-react-native class under Node with a
 * scripted network (realSdkHarness). They prove SDK and transport behaviour, not
 * native or Hermes behaviour.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  createDeleteAccountFlow,
  type DeleteAccountFlowDeps,
  type DeleteAccountUserSnapshot,
} from '../../accountDeletion/deleteAccountCore.ts';
import { POSTHOG_US_HOST, resolveGenerationIdSinceMs } from '../analyticsConfig.ts';
import { describeForInspection } from '../analyticsContract.ts';
import {
  createAnalyticsSession,
  type AnalyticsAuthUser,
  type AnalyticsTransport,
} from '../analyticsCore.ts';
import {
  DELETION_GUARD_STORAGE_KEY,
  RECORD_TTL_MS,
  createAnalyticsDeletionGuard,
  type AnalyticsDeletionGuard,
} from '../analyticsDeletionGuard.ts';
import {
  analyticsDistinctId,
  parseGenerationIdSinceMs,
  readAuthCreationTimeMs,
  resolveAccountDistinctId,
} from '../analyticsDistinctId.ts';
import { buildBasePersonProperties, buildPersonProperties } from '../analyticsPersonProperties.ts';
import { createSdkTransport } from '../analyticsSdkTransport.ts';
import { FAST_SDK_OPTIONS, loadRealPostHog, restoreGlobals, tick } from './realSdkHarness.ts';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, '..', '..', '..', '..', '..', 'apps', 'nearsy-android');
const sha256Hex = async (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

const SINCE = 1794528000000;
const LI = 'li_AbCdEf123456';
const TOKEN = 'phc_abcdefghijklmnopqrstuvwxyz';
const CONFIG_URL = `https://us-assets.i.posthog.com/array/${TOKEN}/config`;

// ---------------------------------------------------------------------------
// G: the rule
// ---------------------------------------------------------------------------

describe('proposal G: the shared rule', () => {
  it('matches the five contract vectors', async () => {
    const vectors: Array<[string, number, string]> = [
      [LI, 1795187045000, 'nag1_80ef49ffe148c3a0a148f519b3bfc7b6'],
      [LI, 1795187045999, 'nag1_80ef49ffe148c3a0a148f519b3bfc7b6'],
      [LI, 1795187046000, 'nag1_17a0f429c768c4778fe6b5bb1af42ff5'],
      [LI, 1794527999000, LI],
      ['Xy9RandomFirebaseUid01', 1795187045000, 'Xy9RandomFirebaseUid01'],
    ];
    for (const [uid, ms, expected] of vectors) {
      assert.equal(await analyticsDistinctId(uid, ms, SINCE, sha256Hex), expected);
    }
  });

  it('no cutover keeps every account on its UID, without hashing', async () => {
    const never = async () => {
      throw new Error('must not hash');
    };
    assert.equal(await analyticsDistinctId(LI, 1795187045000, null, never), LI);
    assert.equal(
      await resolveAccountDistinctId({ uid: LI, creationTime: undefined, sinceMs: null, sha256Hex: never }),
      LI,
    );
  });

  it('parses the cutover setting the same way as Functions and iOS', () => {
    assert.equal(parseGenerationIdSinceMs('1794528000000'), SINCE);
    assert.equal(parseGenerationIdSinceMs('  1794528000000\n'), SINCE);
    assert.equal(parseGenerationIdSinceMs(SINCE), SINCE);
    for (const bad of ['', '0', '01794528000000', '1e12', '-1', '1794528000000.5', '17945280000001234', '9007199254740993', 'abc', null, undefined, 1.5, -5, Number.NaN]) {
      assert.equal(parseGenerationIdSinceMs(bad), null, String(bad));
    }
  });

  it('reads only the Auth creation time, parsed from the ISO string', () => {
    assert.equal(readAuthCreationTimeMs('2026-11-20T10:24:05.000Z'), Date.parse('2026-11-20T10:24:05.000Z'));
    assert.equal(readAuthCreationTimeMs('Fri, 20 Nov 2026 10:24:05 GMT'), Date.parse('2026-11-20T10:24:05Z'));
    for (const bad of [undefined, null, '', 'not a date', 0, -1, Number.NaN]) {
      assert.equal(readAuthCreationTimeMs(bad), null);
    }
  });

  it('an li_ account with a cutover and no readable creation time is not identified', async () => {
    for (const creationTime of [undefined, null, '', 'garbage']) {
      assert.equal(
        await resolveAccountDistinctId({ uid: LI, creationTime, sinceMs: SINCE, sha256Hex }),
        null,
      );
    }
    const broken = async () => 'not-hex';
    assert.equal(
      await resolveAccountDistinctId({ uid: LI, creationTime: '2026-11-20T10:24:05Z', sinceMs: SINCE, sha256Hex: broken }),
      null,
    );
    // A non-LinkedIn account never needs the time.
    assert.equal(
      await resolveAccountDistinctId({ uid: 'AbcRandomUid', creationTime: undefined, sinceMs: SINCE, sha256Hex }),
      'AbcRandomUid',
    );
  });

  it('the cutover is a build setting, unset in every eas.json profile', () => {
    const { resolveAnalyticsExtras } = require(join(appRoot, 'plugins', 'analyticsBuildConfig.js'));
    assert.equal('generationIdSinceMs' in resolveAnalyticsExtras({}), false);
    assert.equal(
      resolveAnalyticsExtras({ NEARSY_POSTHOG_GENERATION_ID_SINCE_MS: ' 1794528000000 ' }).generationIdSinceMs,
      SINCE,
    );
    const warn = console.warn;
    const warnings: unknown[] = [];
    console.warn = (...args: unknown[]) => void warnings.push(args);
    try {
      assert.equal(
        'generationIdSinceMs' in resolveAnalyticsExtras({ NEARSY_POSTHOG_GENERATION_ID_SINCE_MS: '0123' }),
        false,
      );
      assert.equal(resolveGenerationIdSinceMs({ nearsyAnalytics: { generationIdSinceMs: 'x' } }), null);
    } finally {
      console.warn = warn;
    }
    assert.equal(warnings.length, 2);
    assert.equal(resolveGenerationIdSinceMs({ nearsyAnalytics: { generationIdSinceMs: SINCE } }), SINCE);
    assert.equal(resolveGenerationIdSinceMs({}), null);
    const eas = readFileSync(join(appRoot, 'eas.json'), 'utf8');
    assert.doesNotMatch(eas, /GENERATION_ID_SINCE_MS/);
  });
});

// ---------------------------------------------------------------------------
// Session behaviour with a recording transport
// ---------------------------------------------------------------------------

type Call = { op: string; id?: string; props?: Record<string, unknown>; event?: string };

function recordingTransport(persistedId: string | null = null) {
  const calls: Call[] = [];
  const transport: AnalyticsTransport = {
    getIdentifiedDistinctId: () => persistedId,
    getSessionId: () => 's1',
    identify: (id, props) => void calls.push({ op: 'identify', id, props }),
    setPersonProperties: (props) => void calls.push({ op: 'set', props }),
    unsetPersonProperties: () => void calls.push({ op: 'unset' }),
    reset: () => void calls.push({ op: 'reset' }),
    register: (props) => void calls.push({ op: 'register', props }),
    capture: (event, props) => void calls.push({ op: 'capture', event, props }),
  };
  return { calls, transport };
}

function gSession(
  transport: AnalyticsTransport,
  getUser: () => AnalyticsAuthUser | null,
  sinceMs: number | null,
  onResolve?: () => void,
) {
  return createAnalyticsSession({
    loadTransport: async () => transport,
    getAuthUser: getUser,
    readCreationTime: () => undefined,
    buildBaseProperties: (user) => buildBasePersonProperties({ uid: user.uid, authEmail: null }),
    buildProfileProperties: (user, doc) =>
      buildPersonProperties({ doc, uid: user.uid, authEmail: null, normalizeLanguages: () => [] }),
    superProperties: { platform: 'Android' },
    now: () => 0,
    resolveDistinctId: (user) => {
      onResolve?.();
      return resolveAccountDistinctId({
        uid: user.uid,
        creationTime: user.creationTime,
        sinceMs,
        sha256Hex,
      });
    },
  });
}

describe('proposal G in the session', () => {
  it('without a cutover nothing changes: identify with the UID', async () => {
    const { calls, transport } = recordingTransport();
    const s = gSession(transport, () => ({ uid: LI, creationTime: '2026-11-20T10:24:05Z' }), null);
    s.trackForUser(LI, () => ({ event: 'profile_viewed' }));
    await s.settled();
    assert.deepEqual(calls.filter((c) => c.op === 'identify').map((c) => c.id), [LI]);
  });

  it('a LinkedIn account created after the cutover is identified with its own id', async () => {
    const { calls, transport } = recordingTransport();
    const created = new Date(1795187045000).toISOString();
    const s = gSession(transport, () => ({ uid: LI, creationTime: created }), SINCE);
    s.trackForUser(LI, () => ({ event: 'profile_viewed' }));
    await s.settled();
    const identify = calls.find((c) => c.op === 'identify');
    assert.equal(identify?.id, 'nag1_80ef49ffe148c3a0a148f519b3bfc7b6');
    // user_id carries the UID; it is a person property, never the identity.
    assert.equal(identify?.props?.user_id, LI);
    assert.ok(calls.some((c) => c.op === 'capture' && c.event === 'profile_viewed'));
  });

  it('a restored identity with the same derived id is not identified again', async () => {
    const { calls, transport } = recordingTransport('nag1_80ef49ffe148c3a0a148f519b3bfc7b6');
    const s = gSession(transport, () => ({ uid: LI, creationTime: new Date(1795187045000).toISOString() }), SINCE);
    s.trackForUser(LI, () => ({ event: 'profile_viewed' }));
    await s.settled();
    assert.equal(calls.filter((c) => c.op === 'identify' || c.op === 'reset').length, 0);
  });

  it('no readable creation time: nothing under the UID; device events stay anonymous', async () => {
    const { calls, transport } = recordingTransport(LI);
    let user: AnalyticsAuthUser = { uid: LI };
    let resolves = 0;
    const s = gSession(transport, () => user, SINCE, () => void (resolves += 1));
    s.trackForUser(LI, () => ({ event: 'profile_viewed' }));
    s.syncPersonProfile(LI, { mode: 'personal', realName: 'Ana' });
    s.setPersonForUser(LI, { foreground_location_granted: true });
    s.trackForCurrent(() => ({ event: 'alert_opened', properties: { source: 'inbox' } }));
    s.trackAppOpened();
    await s.settled();
    // The identity persisted under the UID is dropped; nothing is identified.
    assert.equal(calls[1].op, 'reset');
    assert.equal(calls.filter((c) => c.op === 'identify').length, 0);
    assert.equal(calls.filter((c) => c.op === 'set').length, 0);
    assert.deepEqual(
      calls.filter((c) => c.op === 'capture').map((c) => c.event),
      ['alert_opened', 'app_opened'],
    );

    // Once the time is readable, the account is identified once for this sign-in.
    user = { uid: LI, creationTime: new Date(1795187045000).toISOString() };
    s.trackForUser(LI, () => ({ event: 'discovery_opened' }));
    s.trackForUser(LI, () => ({ event: 'profile_viewed' }));
    await s.settled();
    assert.deepEqual(
      calls.filter((c) => c.op === 'identify').map((c) => c.id),
      ['nag1_80ef49ffe148c3a0a148f519b3bfc7b6'],
    );
    const before = resolves;
    user = { uid: LI, creationTime: new Date(1795187099000).toISOString() };
    s.trackForUser(LI, () => ({ event: 'profile_viewed' }));
    await s.settled();
    assert.equal(resolves, before, 'not derived again during the sign-in');
    assert.equal(calls.filter((c) => c.op === 'identify').length, 1);
  });

  it('switching account resets and identifies the next one with its own user_id', async () => {
    const { calls, transport } = recordingTransport();
    let user: AnalyticsAuthUser = { uid: 'uid-a' };
    const s = gSession(transport, () => user, null);
    s.trackForUser('uid-a', () => ({ event: 'profile_viewed' }));
    await s.settled();
    user = { uid: 'uid-b' };
    s.trackForUser('uid-b', () => ({ event: 'profile_viewed' }));
    s.trackForUser('uid-a', () => ({ event: 'discovery_opened' }));
    await s.settled();
    const identifies = calls.filter((c) => c.op === 'identify');
    assert.deepEqual(identifies.map((c) => [c.id, c.props?.user_id]), [
      ['uid-a', 'uid-a'],
      ['uid-b', 'uid-b'],
    ]);
    assert.ok(calls.findIndex((c) => c.op === 'reset') < calls.lastIndexOf(identifies[1]));
    assert.equal(calls.filter((c) => c.event === 'discovery_opened').length, 0);
  });
});

// ---------------------------------------------------------------------------
// user_id
// ---------------------------------------------------------------------------

describe('user_id', () => {
  it('is the Firebase UID, a person property only', () => {
    assert.equal(buildBasePersonProperties({ uid: 'uid-a', authEmail: null }).user_id, 'uid-a');
    assert.equal(
      buildPersonProperties({ doc: { mode: 'personal' }, uid: 'uid-a', authEmail: null, normalizeLanguages: () => [] })?.user_id,
      'uid-a',
    );
    assert.equal('user_id' in buildBasePersonProperties({ authEmail: null }), false);
  });

  it('is never logged and never registered on events', () => {
    assert.equal(describeForInspection({ user_id: 'uid-a' }).user_id, '<redacted>');
    const binding = readFileSync(join(here, '..', 'analytics.android.ts'), 'utf8');
    const superProps = binding.slice(binding.indexOf('const superProperties'), binding.indexOf('};', binding.indexOf('const superProperties')));
    assert.doesNotMatch(superProps, /user_id/);
    const contract = readFileSync(join(here, '..', 'analyticsContract.ts'), 'utf8');
    assert.doesNotMatch(contract.slice(contract.indexOf('SUPER_PROPERTY_KEYS'), contract.indexOf('] as const', contract.indexOf('SUPER_PROPERTY_KEYS'))), /user_id/);
  });

  it('no alias, merge or group call exists anywhere in the app analytics', () => {
    const dir = join(here, '..');
    for (const name of readdirSync(dir).filter((file) => file.endsWith('.ts'))) {
      const code = readFileSync(join(dir, name), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      assert.doesNotMatch(code, /\.alias\(|\$create_alias|\$merge_dangerously|\.group\(|groupIdentify|\$groupidentify/, name);
    }
  });
});

// ---------------------------------------------------------------------------
// Deletion guard and queue purge, on the real SDK
// ---------------------------------------------------------------------------

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: async (key: string) => map.get(key) ?? null,
    setItem: async (key: string, value: string) => void map.set(key, value),
    removeItem: async (key: string) => void map.delete(key),
  };
}

type Sent = { url: string; batch: Array<{ event: string; distinct_id?: string }> };

/** Scripted network; `batchAnswer` may wait before answering. */
function fakeNetwork() {
  const sent: Sent[] = [];
  let mode: 'online' | 'offline' = 'online';
  let hold: { arrived: () => void; release: Promise<'ok' | 'fail'> } | null = null;
  globalThis.fetch = (async (url: string, options?: { body?: unknown }) => {
    const text = typeof options?.body === 'string' ? options.body : '{}';
    const batch = (JSON.parse(text) as { batch?: Sent['batch'] }).batch ?? [];
    if (String(url) === CONFIG_URL) {
      return { status: 200, headers: { get: () => null }, json: async () => ({ supportedCompression: [] }), text: async () => '{}' };
    }
    if (hold) {
      const current = hold;
      hold = null;
      current.arrived();
      const result = await current.release;
      if (result === 'fail') throw new Error('connection reset');
    } else if (mode === 'offline') {
      throw new Error('offline');
    }
    sent.push({ url: String(url), batch });
    return { status: 200, headers: { get: () => null }, json: async () => ({}), text: async () => '{}' };
  }) as unknown as typeof fetch;
  return {
    sent,
    events: () => sent.flatMap((request) => request.batch),
    setMode: (next: 'online' | 'offline') => void (mode = next),
    /** The next batch request waits until `release` resolves. */
    holdNext(release: Promise<'ok' | 'fail'>) {
      let arrived!: () => void;
      const reached = new Promise<void>((resolve) => (arrived = resolve));
      hold = { arrived, release };
      return reached;
    },
  };
}

let PostHog: unknown;
before(() => {
  PostHog = loadRealPostHog();
});
after(restoreGlobals);

async function sdk(guard: AnalyticsDeletionGuard, customStorage?: ReturnType<typeof memoryStorage>) {
  await guard.load();
  const transport = await createSdkTransport({
    PostHog,
    token: TOKEN,
    host: POSTHOG_US_HOST,
    persistence: customStorage ? 'file' : 'memory',
    deliveryGuard: guard,
    sdkOptions: { ...FAST_SDK_OPTIONS, ...(customStorage ? { customStorage } : {}) },
  });
  // As createTransport does at startup.
  await transport.purgeQueued(guard.droppedIds());
  return transport;
}

function guardedSession(
  transport: AnalyticsTransport,
  guard: AnalyticsDeletionGuard,
  getUser: () => AnalyticsAuthUser | null,
) {
  return createAnalyticsSession({
    loadTransport: async () => transport,
    getAuthUser: getUser,
    readCreationTime: () => undefined,
    buildBaseProperties: (user) => buildBasePersonProperties({ uid: user.uid, authEmail: null }),
    buildProfileProperties: () => null,
    superProperties: { platform: 'Android' },
    now: () => 0,
    gateAccount: async (user) => {
      await guard.load();
      return guard.noteSession(user.uid, {
        lastSignInTime: (user.lastSignInTime as string | undefined) ?? null,
        creationTime: (user.creationTime as string | undefined) ?? null,
      });
    },
  });
}

const A = { uid: 'uid-a', lastSignInTime: 'T1', creationTime: 'C1' };
const MARKS_A = { lastSignInTime: 'T1', creationTime: 'C1' };

async function persisted(storage: ReturnType<typeof memoryStorage>, text: string) {
  for (let waited = 0; waited < 40 && !JSON.stringify([...storage.map.values()]).includes(text); waited += 1) {
    await tick(25);
  }
}

describe('deletion: the queue of the deleted account', () => {
  it('success: new events are dropped while held, queued ones purged, then reset', async () => {
    const net = fakeNetwork();
    const guard = createAnalyticsDeletionGuard({ storage: memoryStorage(), now: () => 1 });
    const transport = await sdk(guard);
    let user: AnalyticsAuthUser | null = A;
    const s = guardedSession(transport, guard, () => user);
    net.setMode('offline');
    s.trackForUser('uid-a', () => ({ event: 'profile_viewed' }));
    await s.settled();
    await transport.flush().catch(() => {});

    await guard.hold('uid-a', ['uid-a'], MARKS_A);
    s.trackForUser('uid-a', () => ({ event: 'discovery_opened' }));
    s.setPersonForUser('uid-a', { foreground_location_granted: true });
    s.trackAppOpened();
    await s.settled();

    const ids = await guard.confirm('uid-a', [], MARKS_A);
    s.forgetAccount('uid-a', ids);
    user = null;
    s.noteAuthChange();
    s.trackAppOpened();
    await s.settled();
    net.setMode('online');
    await transport.flush();
    await transport.flush();

    assert.equal(net.events().filter((e) => e.distinct_id === 'uid-a').length, 0);
    assert.deepEqual(net.events().map((e) => e.event), ['app_opened']);
  });

  it('a definite failure releases the hold: queued and new events go out', async () => {
    const net = fakeNetwork();
    const guard = createAnalyticsDeletionGuard({ storage: memoryStorage(), now: () => 1 });
    const transport = await sdk(guard);
    const s = guardedSession(transport, guard, () => A);
    net.setMode('offline');
    s.trackForUser('uid-a', () => ({ event: 'profile_viewed' }));
    await s.settled();
    await transport.flush().catch(() => {});

    await guard.hold('uid-a', ['uid-a'], MARKS_A);
    net.setMode('online');
    await transport.flush().catch(() => {});
    assert.equal(net.sent.length, 0, 'held: the queued batch waits');

    await guard.release('uid-a');
    s.trackForUser('uid-a', () => ({ event: 'discovery_opened' }));
    await s.settled();
    await transport.flush();
    assert.deepEqual(
      net.events().map((e) => [e.event, e.distinct_id]),
      [['$identify', 'uid-a'], ['profile_viewed', 'uid-a'], ['discovery_opened', 'uid-a']],
    );
  });

  it('PostHog unreachable around the deletion: nothing of the account is sent afterwards', async () => {
    const net = fakeNetwork();
    const guard = createAnalyticsDeletionGuard({ storage: memoryStorage(), now: () => 1 });
    const transport = await sdk(guard);
    const s = guardedSession(transport, guard, () => A);
    net.setMode('offline');
    s.trackForUser('uid-a', () => ({ event: 'profile_viewed' }));
    s.trackForCurrent(() => ({ event: 'alert_opened', properties: { source: 'inbox' } }));
    await s.settled();
    await guard.hold('uid-a', ['uid-a'], MARKS_A);
    await transport.flush().catch(() => {});
    // Confirmed, but the purge never ran (the guard alone must hold the line).
    await guard.confirm('uid-a', [], MARKS_A);
    net.setMode('online');
    await transport.flush();
    await transport.flush();
    assert.equal(net.sent.length, 0);
  });

  it('a flush in flight: a request already sent cannot be recalled; a failed one is never retried', async () => {
    // Case 1: the in-flight request fails, the retry comes after the deletion.
    {
      const net = fakeNetwork();
      const guard = createAnalyticsDeletionGuard({ storage: memoryStorage(), now: () => 1 });
      const transport = await sdk(guard);
      const s = guardedSession(transport, guard, () => A);
      s.trackForUser('uid-a', () => ({ event: 'profile_viewed' }));
      await s.settled();
      let answer!: (value: 'ok' | 'fail') => void;
      const reached = net.holdNext(new Promise((resolve) => (answer = resolve)));
      const flushing = transport.flush().catch(() => 'failed');
      await reached;
      await guard.hold('uid-a', ['uid-a'], MARKS_A);
      const ids = await guard.confirm('uid-a', [], MARKS_A);
      s.forgetAccount('uid-a', ids);
      await s.settled();
      answer('fail');
      assert.equal(await flushing, 'failed');
      await transport.flush();
      await transport.flush();
      assert.equal(net.sent.length, 0);
    }
    // Case 2: the in-flight request succeeds: those events were already delivered.
    {
      const net = fakeNetwork();
      const guard = createAnalyticsDeletionGuard({ storage: memoryStorage(), now: () => 1 });
      const transport = await sdk(guard);
      const s = guardedSession(transport, guard, () => A);
      s.trackForUser('uid-a', () => ({ event: 'profile_viewed' }));
      await s.settled();
      let answer!: (value: 'ok' | 'fail') => void;
      const reached = net.holdNext(new Promise((resolve) => (answer = resolve)));
      const flushing = transport.flush();
      await reached;
      await guard.hold('uid-a', ['uid-a'], MARKS_A);
      s.trackForUser('uid-a', () => ({ event: 'discovery_opened' }));
      await s.settled();
      answer('ok');
      await flushing;
      await guard.confirm('uid-a', [], MARKS_A);
      await transport.flush();
      assert.deepEqual(net.events().map((e) => e.event), ['$identify', 'profile_viewed']);
    }
  });

  it('a restart between the callable and the purge still purges before anything is sent', async () => {
    const net = fakeNetwork();
    const sdkStorage = memoryStorage();
    const guardStorage = memoryStorage();
    net.setMode('offline');
    {
      const guard = createAnalyticsDeletionGuard({ storage: guardStorage, now: () => 1 });
      const transport = await sdk(guard, sdkStorage);
      const s = guardedSession(transport, guard, () => A);
      s.trackForUser('uid-a', () => ({ event: 'profile_viewed' }));
      await s.settled();
      await transport.flush().catch(() => {});
      await persisted(sdkStorage, 'profile_viewed');
      await guard.hold('uid-a', ['uid-a'], MARKS_A);
      await guard.confirm('uid-a', [], MARKS_A);
      // The process dies here: no purge, no reset.
    }
    assert.ok(guardStorage.map.has(DELETION_GUARD_STORAGE_KEY));
    net.setMode('online');
    const guard = createAnalyticsDeletionGuard({ storage: guardStorage, now: () => 2 });
    const transport = await sdk(guard, sdkStorage);
    await transport.flush();
    assert.equal(net.sent.length, 0);
    assert.doesNotMatch(JSON.stringify([...sdkStorage.map.values()]), /profile_viewed/);
  });

  it('a restart while the outcome is unknown drops the queue and keeps the account out until a new session', async () => {
    const net = fakeNetwork();
    const sdkStorage = memoryStorage();
    const guardStorage = memoryStorage();
    net.setMode('offline');
    {
      const guard = createAnalyticsDeletionGuard({ storage: guardStorage, now: () => 1 });
      const transport = await sdk(guard, sdkStorage);
      const s = guardedSession(transport, guard, () => A);
      s.trackForUser('uid-a', () => ({ event: 'profile_viewed' }));
      await s.settled();
      await transport.flush().catch(() => {});
      await persisted(sdkStorage, 'profile_viewed');
      await guard.hold('uid-a', ['uid-a'], MARKS_A);
      // The process dies while the callable is in flight.
    }
    net.setMode('online');
    const guard = createAnalyticsDeletionGuard({ storage: guardStorage, now: () => 2 });
    const transport = await sdk(guard, sdkStorage);
    let user: AnalyticsAuthUser = A;
    const s = guardedSession(transport, guard, () => user);
    s.trackForUser('uid-a', () => ({ event: 'discovery_opened' }));
    await s.settled();
    await transport.flush();
    assert.equal(net.sent.length, 0, 'same session: still held');

    // A later Auth session of that UID proves it exists: analytics resumes.
    user = { ...A, lastSignInTime: 'T2' };
    s.trackForUser('uid-a', () => ({ event: 'discovery_opened' }));
    await s.settled();
    await transport.flush();
    assert.deepEqual(
      net.events().map((e) => [e.event, e.distinct_id]),
      [['$identify', 'uid-a'], ['discovery_opened', 'uid-a']],
    );
    assert.equal(guardStorage.map.has(DELETION_GUARD_STORAGE_KEY), false);
  });

  it('switching A to B with queued A events: each stays on its own person', async () => {
    const net = fakeNetwork();
    const guard = createAnalyticsDeletionGuard({ storage: memoryStorage(), now: () => 1 });
    const transport = await sdk(guard);
    let user: AnalyticsAuthUser = A;
    const s = guardedSession(transport, guard, () => user);
    net.setMode('offline');
    s.trackForUser('uid-a', () => ({ event: 'profile_viewed' }));
    await s.settled();
    await transport.flush().catch(() => {});
    user = { uid: 'uid-b', lastSignInTime: 'TB' };
    s.noteAuthChange();
    s.trackForUser('uid-b', () => ({ event: 'discovery_opened' }));
    s.trackForUser('uid-a', () => ({ event: 'match_made' }));
    await s.settled();
    net.setMode('online');
    await transport.flush();
    assert.deepEqual(
      net.events().map((e) => [e.event, e.distinct_id]),
      [
        ['$identify', 'uid-a'],
        ['profile_viewed', 'uid-a'],
        ['$identify', 'uid-b'],
        ['discovery_opened', 'uid-b'],
      ],
    );
  });

  it('a re-created account (same li_ UID, new creation) is counted again', async () => {
    const net = fakeNetwork();
    const guard = createAnalyticsDeletionGuard({ storage: memoryStorage(), now: () => 1 });
    const transport = await sdk(guard);
    let user: AnalyticsAuthUser | null = { uid: LI, lastSignInTime: 'T1', creationTime: 'C1' };
    const s = guardedSession(transport, guard, () => user);
    await guard.hold(LI, [LI], { lastSignInTime: 'T1', creationTime: 'C1' });
    const ids = await guard.confirm(LI, [], { lastSignInTime: 'T1', creationTime: 'C1' });
    s.forgetAccount(LI, ids);
    user = null;
    s.noteAuthChange();
    await s.settled();
    user = { uid: LI, lastSignInTime: 'T9', creationTime: 'C9' };
    s.trackForUser(LI, () => ({ event: 'profile_viewed' }));
    await s.settled();
    await transport.flush();
    assert.deepEqual(net.events().map((e) => e.event), ['$identify', 'profile_viewed']);
  });

  it('records expire, so analytics is never blocked for good', async () => {
    const storage = memoryStorage();
    const first = createAnalyticsDeletionGuard({ storage, now: () => 1000 });
    await first.load();
    await first.confirm('uid-a', [], { lastSignInTime: null, creationTime: null });
    const soon = createAnalyticsDeletionGuard({ storage, now: () => 1000 + RECORD_TTL_MS });
    await soon.load();
    assert.equal(soon.isBlocked('uid-a'), true);
    const later = createAnalyticsDeletionGuard({ storage, now: () => 1001 + RECORD_TTL_MS });
    await later.load();
    assert.equal(later.isBlocked('uid-a'), false);
    assert.equal(later.decide('uid-a'), 'send');
  });

  it('a corrupt or unreadable record store blocks nothing', async () => {
    const corrupt = memoryStorage();
    corrupt.map.set(DELETION_GUARD_STORAGE_KEY, '{not json');
    const guard = createAnalyticsDeletionGuard({ storage: corrupt, now: () => 1 });
    await guard.load();
    assert.equal(guard.decide('uid-a'), 'send');
    const failing = {
      getItem: async () => {
        throw new Error('io');
      },
      setItem: async () => {
        throw new Error('io');
      },
      removeItem: async () => {
        throw new Error('io');
      },
    };
    const g2 = createAnalyticsDeletionGuard({ storage: failing, now: () => 1 });
    await g2.load();
    await g2.hold('uid-a', [], MARKS_A);
    assert.equal(g2.decide('uid-a'), 'defer', 'in-memory state still applies');
  });
});

// ---------------------------------------------------------------------------
// Deletion flow → analytics hooks
// ---------------------------------------------------------------------------

function flow(overrides: Partial<DeleteAccountFlowDeps>, uid = 'Ab3dEf6hIj9kLm2nOp5qRs8tUv1w') {
  const steps: string[] = [];
  const user: DeleteAccountUserSnapshot = { uid, providerIds: ['password'] };
  const run = createDeleteAccountFlow({
    getCurrentUser: () => user,
    reauthenticate: { password: async () => void steps.push('reauth') },
    invokeCallable: async () => {
      steps.push('callable');
      return { ok: true, status: 'DELETED' };
    },
    cleanupAfterDeletion: async () => void steps.push('cleanup'),
    analyticsDeletion: {
      hold: async () => void steps.push('hold'),
      release: async () => void steps.push('release'),
      confirm: async () => void steps.push('confirm'),
    },
    ...overrides,
  });
  return { run, steps };
}

function rejection(code: string) {
  return async () => {
    throw Object.assign(new Error('x'), { code });
  };
}

describe('deletion flow drives the analytics hold', () => {
  it('success: hold before the callable, confirm before the cleanup', async () => {
    const { run, steps } = flow({});
    const outcome = await run({ method: 'password', password: 'p' });
    assert.equal(outcome.status, 'deleted');
    assert.deepEqual(steps, ['reauth', 'hold', 'callable', 'confirm', 'cleanup']);
  });

  it('rejected before any data: released', async () => {
    const { run, steps } = flow({ invokeCallable: rejection('functions/unauthenticated') });
    const outcome = await run({ method: 'password', password: 'p' });
    assert.equal(outcome.status, 'failed');
    assert.deepEqual(steps, ['reauth', 'hold', 'release']);
  });

  it('network failure, Auth says the account exists: released', async () => {
    const { run, steps } = flow({
      invokeCallable: rejection('functions/unavailable'),
      reconcileAuth: async () => 'exists',
    });
    assert.equal((await run({ method: 'password', password: 'p' })).status, 'failed');
    assert.deepEqual(steps, ['reauth', 'hold', 'release']);
  });

  it('network failure, Auth unreachable: the hold stays until it is reconciled', async () => {
    const { run, steps } = flow({
      invokeCallable: rejection('functions/deadline-exceeded'),
      reconcileAuth: async () => 'unknown',
    });
    assert.equal((await run({ method: 'password', password: 'p' })).status, 'unresolved');
    assert.deepEqual(steps, ['reauth', 'hold']);
  });

  it('network failure, Auth user gone: confirmed', async () => {
    const { run, steps } = flow({
      invokeCallable: rejection('functions/deadline-exceeded'),
      reconcileAuth: async () => 'gone',
    });
    assert.equal((await run({ method: 'password', password: 'p' })).status, 'deleted');
    assert.deepEqual(steps, ['reauth', 'hold', 'confirm', 'cleanup']);
  });

  it('leaving the pending state confirms; analytics failures never change the outcome', async () => {
    const { run, steps } = flow({});
    await run.leavePending();
    assert.deepEqual(steps, ['confirm', 'cleanup']);

    const broken = flow({
      analyticsDeletion: {
        hold: async () => {
          throw new Error('hold');
        },
        release: async () => {
          throw new Error('release');
        },
        confirm: async () => {
          throw new Error('confirm');
        },
      },
    });
    assert.equal((await broken.run({ method: 'password', password: 'p' })).status, 'deleted');
    assert.deepEqual(broken.steps, ['reauth', 'callable', 'cleanup']);
  });
});

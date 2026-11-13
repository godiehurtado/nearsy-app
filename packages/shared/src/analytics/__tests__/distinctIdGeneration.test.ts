/**
 * Proposal G: PostHog distinct_id per LinkedIn account generation
 * (Functions docs/analytics/ANALYTICS_DISTINCT_ID_CONTRACT.md).
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createAnalyticsClient, type AuthSnapshot } from '../client';
import { POSTHOG_HOST, resolveAnalyticsConfig, type AnalyticsConfig } from '../config';
import { createDeletionRecords, DELETION_RECORDS_KEY } from '../deletionRecords';
import {
  analyticsDistinctId,
  deviceAnalyticsDistinctId,
  parseAuthCreationTimeMs,
  parseGenerationIdSinceMs,
  sha256Hex,
} from '../distinctId';
import { createFakeTransport } from '../fakeTransport';
import type { StringStore } from '../lifecycle';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '../../../../..');

/** Example cutover of the contract vectors (2026-11-13T00:00:00Z). */
const SINCE = 1794528000000;

const CONFIG: AnalyticsConfig = {
  enabled: true,
  token: 'phc_test',
  host: POSTHOG_HOST,
  environment: 'production',
  distributionChannel: 'production',
  isTestInstall: false,
  attributionHosts: [],
};

/** A LinkedIn account created after the example cutover (second precision, as Auth). */
const LI_NEW: AuthSnapshot = {
  uid: 'li_AbCdEf123456',
  email: null,
  creationTime: new Date(1795187045000).toUTCString(),
};
const LI_NEW_ID = 'nag1_80ef49ffe148c3a0a148f519b3bfc7b6';

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

function setup(sinceMs: number | null, live?: () => AuthSnapshot | null) {
  const fake = createFakeTransport();
  const client = createAnalyticsClient({
    config: { ...CONFIG, generationIdSinceMs: sinceMs },
    createTransport: async () => fake,
    binary: () => ({ appVersion: '2.1.0', appBuild: '81' }),
    readSession: live,
  });
  return { fake, client };
}

describe('Proposal G: shared function', () => {
  it('matches the five shared vectors of the contract', () => {
    const vectors: [string, number, string][] = [
      ['li_AbCdEf123456', 1795187045000, 'nag1_80ef49ffe148c3a0a148f519b3bfc7b6'],
      ['li_AbCdEf123456', 1795187045999, 'nag1_80ef49ffe148c3a0a148f519b3bfc7b6'],
      ['li_AbCdEf123456', 1795187046000, 'nag1_17a0f429c768c4778fe6b5bb1af42ff5'],
      ['li_AbCdEf123456', 1794527999000, 'li_AbCdEf123456'],
      ['Xy9RandomFirebaseUid01', 1795187045000, 'Xy9RandomFirebaseUid01'],
    ];
    for (const [uid, ms, expected] of vectors) {
      assert.equal(analyticsDistinctId(uid, ms, SINCE), expected, `${uid} ${ms}`);
    }
  });

  it('without a cutover every account keeps its UID, as before G', () => {
    assert.equal(analyticsDistinctId('li_AbCdEf123456', 1795187045000, null), 'li_AbCdEf123456');
    assert.equal(deviceAnalyticsDistinctId('li_AbCdEf123456', null, null), 'li_AbCdEf123456');
  });

  it('the bundled SHA-256 equals Node crypto on UTF-8 input', () => {
    for (const input of ['', 'abc', 'é漢😀', 'x'.repeat(55), 'x'.repeat(56), 'y'.repeat(200)]) {
      assert.equal(sha256Hex(input), createHash('sha256').update(input, 'utf8').digest('hex'));
    }
  });

  it('device rule: an li_ account with an unreadable time is not identified while the cutover is set', () => {
    for (const raw of [null, undefined, '', 'not a date', 0, -5]) {
      assert.equal(deviceAnalyticsDistinctId('li_AbCdEf123456', raw, SINCE), null, String(raw));
    }
    assert.equal(deviceAnalyticsDistinctId('Xy9RandomFirebaseUid01', null, SINCE), 'Xy9RandomFirebaseUid01');
    assert.equal(deviceAnalyticsDistinctId(LI_NEW.uid, LI_NEW.creationTime, SINCE), LI_NEW_ID);
  });

  it('reads Firebase Auth creationTime strings, never a local clock', () => {
    assert.equal(parseAuthCreationTimeMs('Thu, 19 Nov 2026 22:24:05 GMT'), 1795127045000);
    assert.equal(parseAuthCreationTimeMs('2026-11-19T22:24:05.000Z'), 1795127045000);
    assert.equal(parseAuthCreationTimeMs(null), null);
    assert.equal(parseAuthCreationTimeMs('garbage'), null);
  });

  it('cutover setting: shared parse rule, anything else is null and flagged', () => {
    assert.deepEqual(parseGenerationIdSinceMs(undefined), { sinceMs: null, invalid: false });
    assert.deepEqual(parseGenerationIdSinceMs(''), { sinceMs: null, invalid: false });
    assert.deepEqual(parseGenerationIdSinceMs('  1794528000000 '), { sinceMs: SINCE, invalid: false });
    for (const raw of ['0', '-1', '01', '1.5', '1e12', 'abc', '99999999999999999', '12345678901234567']) {
      assert.deepEqual(parseGenerationIdSinceMs(raw), { sinceMs: null, invalid: true }, raw);
    }
  });

  it('config carries the cutover only while capture is on', () => {
    const base = {
      enabledFlag: 'true',
      distributionChannel: 'production',
      firebaseEnv: 'production',
      token: 'phc_x',
    };
    assert.equal(resolveAnalyticsConfig({ ...base, generationIdSince: String(SINCE) }).generationIdSinceMs, SINCE);
    assert.equal(resolveAnalyticsConfig(base).generationIdSinceMs, null);
    const bad = resolveAnalyticsConfig({ ...base, generationIdSince: 'tomorrow' });
    assert.equal(bad.generationIdSinceMs, null);
    assert.equal(bad.generationIdSinceInvalid, true);
    assert.equal(
      resolveAnalyticsConfig({ ...base, enabledFlag: 'false', generationIdSince: String(SINCE) }).generationIdSinceMs,
      null,
    );
  });
});

describe('Proposal G: analytics client', () => {
  it('cutover unset: identify(uid) exactly as today', async () => {
    const { fake, client } = setup(null);
    await client.start();
    client.reportAuthState(LI_NEW);
    client.captureForUser(LI_NEW.uid, 'visibility_changed', { enabled: true });
    const identify = fake.calls.find((c) => c.op === 'identify');
    assert.equal(identify?.op === 'identify' && identify.uid, LI_NEW.uid);
    assert.equal(fake.captured('visibility_changed')[0]?.distinctId, LI_NEW.uid);
  });

  it('cutover set: a new LinkedIn account is identified with its nag1_ id; user_id stays the UID', async () => {
    const { fake, client } = setup(SINCE);
    await client.start();
    client.reportAuthState(LI_NEW);
    client.captureForUser(LI_NEW.uid, 'visibility_changed', { enabled: true });
    const identify = fake.calls.find((c) => c.op === 'identify');
    assert.ok(identify && identify.op === 'identify');
    assert.equal(identify.uid, LI_NEW_ID);
    assert.equal(identify.set.user_id, LI_NEW.uid);
    assert.equal(fake.captured('visibility_changed')[0]?.distinctId, LI_NEW_ID);
  });

  it('cutover set: other providers keep their UID', async () => {
    const { fake, client } = setup(SINCE);
    await client.start();
    client.reportAuthState({ uid: 'Xy9RandomFirebaseUid01', email: null, creationTime: LI_NEW.creationTime });
    const identify = fake.calls.find((c) => c.op === 'identify');
    assert.equal(identify?.op === 'identify' && identify.uid, 'Xy9RandomFirebaseUid01');
  });

  it('unreadable li_ time: never identified under the UID; account events dropped; retried when readable', async () => {
    const persistedOld = createFakeTransport(LI_NEW.uid);
    const client = createAnalyticsClient({
      config: { ...CONFIG, generationIdSinceMs: SINCE },
      createTransport: async () => persistedOld,
      binary: () => ({ appVersion: '2.1.0', appBuild: '81' }),
    });
    await client.start();
    client.reportAuthState({ ...LI_NEW, creationTime: null });
    assert.equal(client.captureForUser(LI_NEW.uid, 'visibility_changed', { enabled: true }), false);
    assert.equal(client.setPersonProperties(LI_NEW.uid, { profile_type: 'professional' }), false);
    client.captureDeviceEvent('app_opened', { open_type: 'cold_start' });
    assert.equal(persistedOld.calls.some((c) => c.op === 'identify'), false);
    assert.deepEqual(persistedOld.calls[0], { op: 'reset' }, 'a UID identity left by an older build is reset');
    assert.equal(persistedOld.captured('app_opened')[0]?.distinctId, null, 'device event stays anonymous');
    assert.equal(persistedOld.captured('visibility_changed').length, 0);

    client.reportAuthState(LI_NEW);
    const identify = persistedOld.calls.find((c) => c.op === 'identify');
    assert.equal(identify?.op === 'identify' && identify.uid, LI_NEW_ID);
  });

  it('account switch still resets between generations of the same UID', async () => {
    const { fake, client } = setup(SINCE);
    await client.start();
    client.reportAuthState(LI_NEW);
    client.reportAuthState(null);
    const recreated = { ...LI_NEW, creationTime: new Date(1795187046000).toUTCString() };
    client.reportAuthState(recreated);
    const identifies = fake.calls.filter((c) => c.op === 'identify').map((c) => (c.op === 'identify' ? c.uid : ''));
    assert.deepEqual(identifies, [LI_NEW_ID, 'nag1_17a0f429c768c4778fe6b5bb1af42ff5']);
    assert.ok(fake.calls.some((c) => c.op === 'reset'));
  });

  it('deletion discards queued events under the UID and the derived id, then resets', async () => {
    let live: AuthSnapshot | null = LI_NEW;
    const { fake, client } = setup(SINCE, () => live);
    await client.start();
    client.reportAuthState(LI_NEW);
    assert.deepEqual(client.distinctIdsFor(LI_NEW.uid).sort(), [LI_NEW.uid, LI_NEW_ID].sort());
    live = null;
    client.discardAccount(LI_NEW.uid);
    const discarded = fake.calls.filter((c) => c.op === 'discard').map((c) => (c.op === 'discard' ? c.distinctId : ''));
    assert.deepEqual(discarded.sort(), [LI_NEW.uid, LI_NEW_ID].sort());
    assert.equal(fake.getIdentifiedId(), null);
  });
});

describe('Proposal G: durable deletion records', () => {
  it('purges every recorded id with the same time bound; old records without ids still work', async () => {
    const store = memoryStore();
    store.data.set(DELETION_RECORDS_KEY, JSON.stringify([{ uid: 'oldUid', atMs: 5, state: 'confirmed' }]));
    const records = createDeletionRecords(store);
    await records.record(LI_NEW.uid, 'intent', 10, [LI_NEW.uid, LI_NEW_ID]);
    await records.record(LI_NEW.uid, 'confirmed', 20);
    const saved = JSON.parse(store.data.get(DELETION_RECORDS_KEY) ?? '[]');
    assert.deepEqual(saved.find((r: { uid: string }) => r.uid === LI_NEW.uid), {
      uid: LI_NEW.uid,
      atMs: 20,
      state: 'confirmed',
      ids: [LI_NEW_ID],
    });
    const fake = createFakeTransport();
    await records.purgeQueued(fake);
    assert.deepEqual(
      fake.calls.filter((c) => c.op === 'discard'),
      [
        { op: 'discard', distinctId: 'oldUid', untilMs: 5 },
        { op: 'discard', distinctId: LI_NEW.uid, untilMs: 20 },
        { op: 'discard', distinctId: LI_NEW_ID, untilMs: 20 },
      ],
    );
    assert.equal(store.data.has(DELETION_RECORDS_KEY), false);
  });
});

describe('Proposal G: build configuration', () => {
  it('no eas.json profile sets the cutover; app.config checks it; runtime reads it', () => {
    const eas = readFileSync(join(repoRoot, 'apps/nearsy-ios/eas.json'), 'utf8');
    assert.equal(eas.includes('GENERATION_ID_SINCE'), false);
    const appConfig = readFileSync(join(repoRoot, 'apps/nearsy-ios/app.config.js'), 'utf8');
    assert.match(appConfig, /checkGenerationIdSince\(process\.env\)/);
    const runtime = readFileSync(join(repoRoot, 'packages/shared/src/analytics/runtime.ts'), 'utf8');
    assert.match(runtime, /generationIdSince: process\.env\.EXPO_PUBLIC_POSTHOG_GENERATION_ID_SINCE_MS/);
  });

  it('the build check warns on an invalid value and never throws', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { checkGenerationIdSince } = require(join(repoRoot, 'apps/nearsy-ios/scripts/analyticsBuildConfig.cjs'));
    const warnings: string[] = [];
    const warn = (message: string) => warnings.push(message);
    const key = 'EXPO_PUBLIC_POSTHOG_GENERATION_ID_SINCE_MS';
    assert.deepEqual(checkGenerationIdSince({}, warn), { sinceMs: null, invalid: false });
    assert.deepEqual(checkGenerationIdSince({ [key]: String(SINCE) }, warn), { sinceMs: SINCE, invalid: false });
    assert.deepEqual(checkGenerationIdSince({ [key]: '2026-11-13' }, warn), { sinceMs: null, invalid: true });
    assert.equal(warnings.length, 1);
  });
});

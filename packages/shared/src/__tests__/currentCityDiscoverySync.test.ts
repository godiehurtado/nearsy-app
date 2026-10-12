/**
 * IOS-208-CURRENT-CITY-QA-01 — Own Profile save → syncDiscoveryProfileContext.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { deleteField } from 'firebase/firestore';

import type { CurrentCity } from '../profile/currentCity';
import {
  buildOwnProfileContextSavePatch,
  createOwnProfileSnapshot,
  type OwnProfileDraft,
} from '../profile/ownProfileEditorState';
import {
  classifyDiscoveryContextSync,
  createSingleFlight,
  persistOwnProfileThenSyncDiscovery,
  syncDiscoveryContextSafely,
} from '../profile/ownProfileSaveFlow';
import { parseSyncDiscoveryProfileContextResponse } from '../visibility/callables';
import type { SyncDiscoveryProfileContextOutcome } from '../visibility/syncDiscoveryProfileContext';
import { normalizeVisibilityCallableError } from '../visibility/callables';

const ROOT = join(__dirname, '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

const CALI: CurrentCity = {
  id: '3687925',
  provider: 'geonames',
  name: 'Cali',
  countryCode: 'CO',
  region: 'Valle del Cauca',
};
const MEDELLIN: CurrentCity = {
  id: '3674962',
  provider: 'geonames',
  name: 'Medellín',
  countryCode: 'CO',
  region: 'Antioquia',
};

const draft = (currentCity: CurrentCity | null): OwnProfileDraft => ({
  realName: 'Ana',
  lastName: 'García',
  profileImage: 'https://cdn.example/ana.jpg',
  occupation: 'Engineer',
  bio: 'Hi',
  company: '',
  birthCountryCode: 'CO',
  currentCity,
  languageCodes: ['es'],
});

const DELETE_CTOR = deleteField().constructor;
const isDelete = (v: unknown) =>
  !!v && typeof v === 'object' && (v as object).constructor === DELETE_CTOR;

function syncOk(
  synced: boolean,
  currentCity?: CurrentCity | null,
): SyncDiscoveryProfileContextOutcome {
  return {
    ok: true,
    response: {
      contractVersion: 1,
      synced,
      serverTime: 1,
      ...(currentCity !== undefined ? { currentCity } : {}),
    },
  } as SyncDiscoveryProfileContextOutcome;
}

const syncFailed = (): SyncDiscoveryProfileContextOutcome => ({
  ok: false,
  error: normalizeVisibilityCallableError({ code: 'functions/unavailable' }),
});

function recorder() {
  const events: string[] = [];
  const writes: Record<string, unknown>[] = [];
  return {
    events,
    writes,
    write: async (patch: Record<string, unknown>) => {
      events.push('write');
      writes.push(patch);
    },
    onPersisted: () => events.push('persisted'),
  };
}

function save(
  next: CurrentCity | null,
  persisted: CurrentCity | null,
  sync: () => Promise<SyncDiscoveryProfileContextOutcome>,
  rec = recorder(),
) {
  const modePatch = { 'profiles.personal.realName': 'Ana' };
  const contextPatch = buildOwnProfileContextSavePatch(
    draft(next),
    createOwnProfileSnapshot(draft(persisted)),
  );
  const run = persistOwnProfileThenSyncDiscovery({
    patches: [modePatch, contextPatch],
    write: rec.write,
    onPersisted: rec.onPersisted,
    expectedCity: next,
    sync: async () => {
      rec.events.push('sync');
      return sync();
    },
  });
  return { run, rec, contextPatch };
}

describe('Own Profile save then Discovery sync', () => {
  it('adding a city persists first, then syncs, and confirms the projection', async () => {
    const { run, rec, contextPatch } = save(CALI, null, async () => syncOk(true, CALI));
    assert.equal(await run, 'synced');
    assert.deepEqual(rec.events, ['write', 'write', 'persisted', 'sync']);
    assert.deepEqual(contextPatch.currentCity, CALI);
  });

  it('changing the city writes the new reference and syncs', async () => {
    const { run, contextPatch } = save(MEDELLIN, CALI, async () => syncOk(true, MEDELLIN));
    assert.equal(await run, 'synced');
    assert.deepEqual(contextPatch.currentCity, MEDELLIN);
  });

  it('removing the city deletes the field and Discovery publishes currentCity: null', async () => {
    const { run, contextPatch } = save(null, CALI, async () => syncOk(true, null));
    assert.equal(await run, 'synced');
    assert.equal(isDelete(contextPatch.currentCity), true);
  });

  it('a Discovery projection still showing the old city is not reported as success', async () => {
    const { run } = save(null, CALI, async () => syncOk(true, CALI));
    assert.equal(await run, 'failed');
  });

  it('older backends without currentCity in the sync response stay compatible', async () => {
    const { run } = save(CALI, null, async () => syncOk(true));
    assert.equal(await run, 'synced');
  });

  it('no public projection yet is not an error (built later from the saved doc)', async () => {
    const { run } = save(CALI, null, async () => syncOk(false, CALI));
    assert.equal(await run, 'not-projected');
  });

  it('a failed write stops before marking saved or syncing', async () => {
    const events: string[] = [];
    await assert.rejects(
      persistOwnProfileThenSyncDiscovery({
        patches: [{ a: 1 }, { currentCity: CALI }],
        write: async (patch) => {
          events.push('write');
          if ('currentCity' in patch) throw new Error('permission-denied');
        },
        onPersisted: () => events.push('persisted'),
        expectedCity: CALI,
        sync: async () => {
          events.push('sync');
          return syncOk(true, CALI);
        },
      }),
    );
    assert.deepEqual(events, ['write', 'write']);
  });

  it('save ok + sync error reports failure without repeating or reverting writes', async () => {
    const { run, rec } = save(CALI, null, async () => syncFailed());
    assert.equal(await run, 'failed');
    assert.equal(rec.writes.length, 2);
    assert.deepEqual(rec.events, ['write', 'write', 'persisted', 'sync']);
  });

  it('a thrown sync (client bootstrap, network) is also a reported failure', async () => {
    const { run, rec } = save(CALI, null, async () => {
      throw new Error('offline');
    });
    assert.equal(await run, 'failed');
    assert.equal(rec.writes.length, 2);
  });

  it('a sync-only retry calls the callable once and can recover', async () => {
    let calls = 0;
    const status = await syncDiscoveryContextSafely(async () => {
      calls += 1;
      return syncOk(true, CALI);
    }, CALI);
    assert.equal(status, 'synced');
    assert.equal(calls, 1);
  });

  it('an unchanged city never rewrites currentCity', async () => {
    const { contextPatch } = save(CALI, { ...CALI }, async () => syncOk(true, CALI));
    assert.equal('currentCity' in contextPatch, false);
    assert.equal('residenceCountryCode' in contextPatch, false);
  });
});

describe('double tap and late responses', () => {
  it('a second Save while one is in flight is dropped: one set of writes, one sync', async () => {
    const flight = createSingleFlight();
    const rec = recorder();
    let releaseSync!: () => void;
    const gate = new Promise<void>((r) => (releaseSync = r));
    let syncCalls = 0;
    const once = () =>
      persistOwnProfileThenSyncDiscovery({
        patches: [{ a: 1 }, { currentCity: CALI }],
        write: rec.write,
        onPersisted: rec.onPersisted,
        expectedCity: CALI,
        sync: async () => {
          syncCalls += 1;
          await gate;
          return syncOk(true, CALI);
        },
      });
    const first = flight.run(once);
    const second = flight.run(once);
    assert.equal(await second, undefined);
    assert.equal(flight.isRunning(), true);
    releaseSync();
    assert.equal(await first, 'synced');
    assert.equal(rec.writes.length, 2);
    assert.equal(syncCalls, 1);
    assert.equal(flight.isRunning(), false);
  });

  it('the guard releases after a failure so the user can save again', async () => {
    const flight = createSingleFlight();
    await assert.rejects(flight.run(async () => {
      throw new Error('x');
    }));
    assert.equal(await flight.run(async () => 'again'), 'again');
  });

  it('a late sync result is classified against the city saved at that moment', () => {
    assert.equal(classifyDiscoveryContextSync(syncOk(true, CALI), MEDELLIN), 'failed');
    assert.equal(classifyDiscoveryContextSync(syncOk(true, MEDELLIN), MEDELLIN), 'synced');
  });
});

describe('sync response contract', () => {
  it('parses currentCity echoed by Functions, including null after removal', () => {
    const withCity = parseSyncDiscoveryProfileContextResponse({
      contractVersion: 1,
      synced: true,
      birthCountryCode: 'CO',
      currentCity: CALI,
      languageCodes: ['es'],
      zodiacSign: null,
      serverTime: 1,
    });
    assert.deepEqual(withCity.currentCity, CALI);
    const removed = parseSyncDiscoveryProfileContextResponse({
      contractVersion: 1,
      synced: true,
      currentCity: null,
      serverTime: 1,
    });
    assert.equal(removed.currentCity, null);
    const legacy = parseSyncDiscoveryProfileContextResponse({
      contractVersion: 1,
      synced: true,
      serverTime: 1,
    });
    assert.equal('currentCity' in legacy, false);
  });

  it('a sync response with coordinates is rejected', () => {
    assert.throws(() =>
      parseSyncDiscoveryProfileContextResponse({
        contractVersion: 1,
        synced: true,
        currentCity: { ...CALI, lat: 3.4 },
        serverTime: 1,
      }),
    );
  });
});

describe('screen wiring', () => {
  const editor = read('screens/CompleteProfileScreen.tsx');
  const crj = read('screens/ProfileCompletionScreen.tsx');

  it('editor saves through the ordered flow behind a single-flight guard', () => {
    assert.match(editor, /persistOwnProfileThenSyncDiscovery\(\{/);
    assert.match(editor, /patches: \[modePatch, contextPatch\]/);
    assert.match(editor, /await saveFlightRef\.current\.run\(persistOwnProfile\)/);
    assert.doesNotMatch(editor, /await updateUserProfilePartial\(uid, contextPatch\)/);
  });

  it('sync failure is reported only for the same mounted user, with a sync-only retry', () => {
    assert.match(
      editor,
      /syncStatus === 'failed' &&\s*mountedRef\.current &&\s*getUid\(\) === uid/,
    );
    const retry = editor.slice(
      editor.indexOf('const showDiscoverySyncError'),
      editor.indexOf('const persistOwnProfile'),
    );
    assert.match(retry, /t\('profile\.context\.syncError'\)/);
    assert.match(retry, /t\('common\.retry'\)/);
    assert.match(retry, /syncDiscoveryContextSafely\(/);
    assert.match(retry, /savedSnapshotRef\.current\?\.currentCity/);
    assert.doesNotMatch(retry, /updateUserProfilePartial|setDoc|updateDoc/);
  });

  it('CRJ keeps the contractual order: city on identity save, sync before activation', () => {
    assert.match(crj, /buildCurrentCityWritePatch\(/);
    const finish = crj.slice(crj.indexOf('async function finishOnboarding'));
    const completed = finish.indexOf('profileSetupCompleted: true');
    const sync = finish.indexOf('syncDiscoveryProfileContextFlow(client)');
    const activate = finish.indexOf('attemptInitialVisibilityAfterCrjCompletion');
    assert.ok(completed > 0 && completed < sync && sync < activate);
  });

  it('no city or query is logged by the sync paths', () => {
    const flow = read('profile/ownProfileSaveFlow.ts');
    assert.doesNotMatch(flow, /console\./);
    const finish = crj.slice(
      crj.indexOf('async function finishOnboarding'),
      crj.indexOf('attemptInitialVisibilityAfterCrjCompletion'),
    );
    assert.doesNotMatch(finish, /console\.[a-z]+\([^)]*currentCity/);
  });
});

/**
 * BUG-DISC-01 / BUG-DISC-02 — Discovery stabilization focused tests.
 *
 * Run:
 * node --experimental-strip-types --test packages/shared/src/visibility/__tests__/discoveryStabilization.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, beforeEach } from 'node:test';

import { createFakeVisibilityDiscoveryClient } from '../callables/fakeClient.ts';
import { VisibilityDiscoveryClientError } from '../callables/errors.ts';
import {
  buildLocationPayload,
  buildPublishLocationRequest,
} from '../callables/requests.ts';
import type { VisibilityDiscoveryClient } from '../callables/port.ts';
import {
  FOREGROUND_CONTRACTUAL_CADENCE_MS,
  resetContractualPublishGuardForTests,
  shouldAttemptContractualPublish,
  noteContractualPublishSuccess,
  getLastContractualPublishAtMs,
} from '../contractualLocationRefresh.ts';
import {
  loadNearbyWithContractualRefresh,
  type NearbyDiscoveryPublishOutcome,
} from '../nearbyDiscoveryLoad.ts';
import {
  decideVisibilityRecoveryAction,
  parseVisibilityRecoveryIntent,
  serializeVisibilityRecoveryIntent,
  writeVisibilityRecoveryIntent,
  clearVisibilityRecoveryIntent,
  readVisibilityRecoveryIntent,
  type VisibilityRecoveryStorage,
} from '../visibilityRecoveryIntent.ts';

const here = dirname(fileURLToPath(import.meta.url));
const sharedSrc = join(here, '../..');

function readSrc(relFromSharedSrc: string): string {
  return readFileSync(join(sharedSrc, relFromSharedSrc), 'utf8');
}

function readVisibility(relFromVisibility: string): string {
  return readFileSync(join(here, '..', relFromVisibility), 'utf8');
}

const SAMPLE = buildLocationPayload({
  latitude: 4.7,
  longitude: -74.0,
  accuracyMeters: 8,
  observedAt: 1_700_000_000_000,
});

function memoryStorage(
  initial: Record<string, string> = {},
): VisibilityRecoveryStorage & { store: Record<string, string> } {
  const store = { ...initial };
  return {
    store,
    async getItem(key) {
      return Object.prototype.hasOwnProperty.call(store, key)
        ? store[key]
        : null;
    },
    async setItem(key, value) {
      store[key] = value;
    },
    async removeItem(key) {
      delete store[key];
    },
  };
}

function trackingPublish(
  order: string[],
): (client: VisibilityDiscoveryClient) => Promise<NearbyDiscoveryPublishOutcome> {
  return async (client) => {
    order.push('publishLocation');
    const response = await client.publishLocation(
      buildPublishLocationRequest(SAMPLE),
    );
    return { ok: true, response };
  };
}

describe('contractual publish guard (BUG-DISC-02)', () => {
  beforeEach(() => {
    resetContractualPublishGuardForTests();
  });

  it('allows first publish and debounces within min interval', () => {
    assert.equal(shouldAttemptContractualPublish(1_000), true);
    noteContractualPublishSuccess(1_000);
    assert.equal(getLastContractualPublishAtMs(), 1_000);
    assert.equal(shouldAttemptContractualPublish(1_000 + 30_000), false);
    assert.equal(shouldAttemptContractualPublish(1_000 + 60_000), true);
  });

  it('foreground cadence is under Discovery TTL (60m) and in 10–15m band', () => {
    assert.ok(FOREGROUND_CONTRACTUAL_CADENCE_MS >= 10 * 60_000);
    assert.ok(FOREGROUND_CONTRACTUAL_CADENCE_MS <= 15 * 60_000);
    assert.ok(FOREGROUND_CONTRACTUAL_CADENCE_MS < 60 * 60_000);
  });
});

describe('loadNearbyWithContractualRefresh (BUG-DISC-02)', () => {
  beforeEach(() => {
    resetContractualPublishGuardForTests();
  });

  it('Visibility ON: publishLocation occurs before discoverNearby', async () => {
    const order: string[] = [];
    const client = createFakeVisibilityDiscoveryClient({
      discoverNearby: async () => {
        order.push('discoverNearby');
        return {
          contractVersion: 1,
          results: [
            {
              uid: 'b',
              distanceMeters: 10,
              profile: {
                mode: 'personal',
                displayName: 'B',
                profileImage: null,
                occupation: '',
                interestIds: [],
              },
            },
          ],
          nextCursor: null,
          serverTime: 4,
        };
      },
    });

    const outcome = await loadNearbyWithContractualRefresh({
      uid: 'a',
      visibility: true,
      client,
      limit: 50,
      publish: trackingPublish(order),
    });

    assert.equal(outcome.ok, true);
    if (outcome.ok) assert.equal(outcome.results.length, 1);
    assert.deepEqual(order, ['publishLocation', 'discoverNearby']);
    assert.equal(client.calls[0]?.name, 'publishLocation');
    assert.equal(client.calls[1]?.name, 'discoverNearby');
  });

  it('Retry after location-stale: publish runs before discover', async () => {
    let discoverCalls = 0;
    const order: string[] = [];
    const client = createFakeVisibilityDiscoveryClient({
      discoverNearby: async () => {
        discoverCalls += 1;
        order.push('discoverNearby');
        if (discoverCalls === 1) {
          throw new VisibilityDiscoveryClientError({
            code: 'failed-precondition',
            reason: { kind: 'known', value: 'location-stale' },
            retryable: true,
            message: 'stale',
          });
        }
        return {
          contractVersion: 1,
          results: [],
          nextCursor: null,
          serverTime: 4,
        };
      },
    });

    const first = await loadNearbyWithContractualRefresh({
      uid: 'a',
      visibility: true,
      client,
      publish: trackingPublish(order),
    });
    assert.equal(first.ok, false);
    if (first.ok === false) {
      assert.equal(first.kind, 'callable');
      assert.equal(
        first.error?.reason.kind === 'known' && first.error.reason.value,
        'location-stale',
      );
    }

    const second = await loadNearbyWithContractualRefresh({
      uid: 'a',
      visibility: true,
      client,
      publish: trackingPublish(order),
    });
    assert.equal(second.ok, true);
    assert.deepEqual(order, [
      'publishLocation',
      'discoverNearby',
      'publishLocation',
      'discoverNearby',
    ]);
  });

  it('Visibility OFF: does not publish or discover (no silent activate)', async () => {
    const order: string[] = [];
    const client = createFakeVisibilityDiscoveryClient({
      discoverNearby: async () => {
        order.push('discoverNearby');
        return {
          contractVersion: 1,
          results: [],
          nextCursor: null,
          serverTime: 4,
        };
      },
    });

    const outcome = await loadNearbyWithContractualRefresh({
      uid: 'a',
      visibility: false,
      client,
      publish: trackingPublish(order),
    });
    assert.equal(outcome.ok, false);
    if (outcome.ok === false) assert.equal(outcome.kind, 'inactive');
    assert.deepEqual(order, []);
    assert.equal(client.calls.length, 0);
  });

  it('injectable publish failure maps without calling discover', async () => {
    let discovered = false;
    const client = createFakeVisibilityDiscoveryClient({
      discoverNearby: async () => {
        discovered = true;
        return {
          contractVersion: 1,
          results: [],
          nextCursor: null,
          serverTime: 1,
        };
      },
    });
    const outcome = await loadNearbyWithContractualRefresh({
      uid: 'a',
      visibility: true,
      client,
      publish: async () => ({ ok: false, kind: 'permission-denied' }),
    });
    assert.equal(outcome.ok, false);
    if (outcome.ok === false) assert.equal(outcome.kind, 'permission-denied');
    assert.equal(discovered, false);
  });
});

describe('visibility recovery intent (BUG-DISC-01)', () => {
  it('serializes and parses recovery intent', () => {
    const raw = serializeVisibilityRecoveryIntent({
      uid: 'user-1',
      restoreVisibility: true,
    });
    const parsed = parseVisibilityRecoveryIntent(raw);
    assert.deepEqual(parsed, { uid: 'user-1', restoreVisibility: true });
    assert.equal(parseVisibilityRecoveryIntent('nope'), null);
  });

  it('originally visibility=true + permission granted → activate-from-intent', () => {
    const d = decideVisibilityRecoveryAction({
      uid: 'u1',
      remoteVisibility: false,
      foregroundGranted: true,
      recoveryIntent: { uid: 'u1', restoreVisibility: true },
    });
    assert.equal(d.action, 'activate-from-intent');
  });

  it('originally visibility=false + permission granted → remains OFF', () => {
    const d = decideVisibilityRecoveryAction({
      uid: 'u1',
      remoteVisibility: false,
      foregroundGranted: true,
      recoveryIntent: null,
    });
    assert.equal(d.action, 'noop');
    if (d.action === 'noop') assert.equal(d.effectiveVisibility, false);
  });

  it('remote true + no permission → preserve-intent-then-deactivate', () => {
    const d = decideVisibilityRecoveryAction({
      uid: 'u1',
      remoteVisibility: true,
      foregroundGranted: false,
      recoveryIntent: null,
    });
    assert.equal(d.action, 'preserve-intent-then-deactivate');
  });

  it('intent retained while permission still denied → await-permission', () => {
    const d = decideVisibilityRecoveryAction({
      uid: 'u1',
      remoteVisibility: false,
      foregroundGranted: false,
      recoveryIntent: { uid: 'u1', restoreVisibility: true },
    });
    assert.equal(d.action, 'await-permission');
  });

  it('explicit OFF clears recovery intent in storage helpers', async () => {
    const storage = memoryStorage();
    await writeVisibilityRecoveryIntent(storage, 'u1');
    assert.ok(await readVisibilityRecoveryIntent(storage));
    await clearVisibilityRecoveryIntent(storage);
    assert.equal(await readVisibilityRecoveryIntent(storage), null);

    const d = decideVisibilityRecoveryAction({
      uid: 'u1',
      remoteVisibility: false,
      foregroundGranted: true,
      recoveryIntent: null,
    });
    assert.equal(d.action, 'noop');
  });
});

describe('Personal/Professional client filter regression (BUG-DISC-03)', () => {
  it('Nearby does not filter discoverNearby results by profile mode', () => {
    const nearby = readSrc('screens/NearbySearchScreen.tsx');
    const load = readVisibility('nearbyDiscoveryLoad.ts');
    assert.match(nearby, /loadNearbyWithContractualRefresh/);
    assert.match(load, /discoverNearby/);
    assert.match(load, /publishLocationFlow|publish\(/);
    assert.doesNotMatch(load, /mode:\s*['\"]personal|profileMode|filter.*mode/);
    assert.match(nearby, /matchesNearbyLocalQuery/);
    assert.doesNotMatch(
      nearby,
      /item\.profile\.mode\s*===|filter\(.*mode/,
    );
  });

  it('discoverNearby request builder still has no mode field', () => {
    const requests = readVisibility('callables/requests.ts');
    const discoverFn = requests.slice(
      requests.indexOf('export function buildDiscoverNearbyRequest'),
      requests.indexOf('export function buildGetDiscoveryProfileRequest'),
    );
    assert.doesNotMatch(discoverFn, /\bmode\b/);
  });
});

describe('wiring static checks', () => {
  it('Nearby Retry uses contractual refresh helper', () => {
    const nearby = readSrc('screens/NearbySearchScreen.tsx');
    assert.match(nearby, /loadNearbyWithContractualRefresh/);
    assert.match(nearby, /limit:\s*50/);
  });

  it('HomeStack mounts ContractualLocationPublisher', () => {
    const stack = readSrc('navigation/HomeStack.tsx');
    assert.match(stack, /ContractualLocationPublisher/);
  });

  it('MainHome preserves recovery intent and clears on explicit OFF', () => {
    const home = readSrc('screens/MainHomeScreen.tsx');
    assert.match(home, /decideVisibilityRecoveryAction/);
    assert.match(home, /clearVisibilityRecoveryIntent/);
    assert.match(home, /recoveryStorage:\s*AsyncStorage/);
  });
});

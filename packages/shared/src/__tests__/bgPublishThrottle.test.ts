/**
 * QA 2.1.0 (candidate 82): at most one background location publish every 15 s
 * on iOS, without losing the latest fix or crossing accounts.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  BG_PUBLISH_MIN_INTERVAL_MS,
  createBgPublishThrottle,
  pickLatestValidFix,
  type BgFix,
  type LastPublish,
} from '../background/bgPublishThrottle';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(join(here, '..', rel), 'utf8');

const loc = (lat: number, ts: number, accuracy: number | null = 5) => ({
  coords: { latitude: lat, longitude: -80, accuracy },
  timestamp: ts,
});

function harness(opts: { publishOk?: boolean; holdPublish?: boolean } = {}) {
  let now = 1_000_000;
  let gate: string | null = 'uidA';
  let stored: LastPublish | null = null;
  const sent: Array<{ uid: string; fix: BgFix }> = [];
  const timers: Array<{ at: number; run: () => void }> = [];
  let release: (() => void) | null = null;
  const throttle = createBgPublishThrottle({
    now: () => now,
    readGateUid: async () => gate,
    readLastPublish: async () => stored,
    writeLastPublish: async (v) => {
      stored = v;
    },
    publish: async (uid, fix) => {
      sent.push({ uid, fix });
      if (opts.holdPublish) await new Promise<void>((r) => (release = r));
      return opts.publishOk ?? true;
    },
    schedule: (delay, run) => timers.push({ at: now + delay, run }),
  });
  return {
    throttle,
    sent,
    timers,
    advance: (ms: number) => {
      now += ms;
    },
    setGate: (uid: string | null) => {
      gate = uid;
    },
    stored: () => stored,
    setStored: (v: LastPublish | null) => {
      stored = v;
    },
    release: () => release?.(),
  };
}

describe('background publish throttle (15 s)', () => {
  it('first valid fix goes out at once', async () => {
    const h = harness();
    assert.equal(await h.throttle.handleDelivery([loc(25.1, 1)]), 'sent');
    assert.equal(h.sent.length, 1);
    assert.equal(h.stored()?.uid, 'uidA');
  });

  it('inside the interval the newest fix is kept; sent once the interval ends', async () => {
    const h = harness();
    await h.throttle.handleDelivery([loc(25.1, 1)]);
    for (let i = 2; i <= 14; i++) {
      h.advance(1000);
      assert.equal(await h.throttle.handleDelivery([loc(25.1 + i / 1000, i)]), 'throttled');
    }
    assert.equal(h.sent.length, 1);
    assert.equal(h.throttle.pendingFix()?.fix.timestamp, 14);
    h.advance(BG_PUBLISH_MIN_INTERVAL_MS - 13_000);
    assert.equal(await h.throttle.handleDelivery([loc(25.5, 15)]), 'sent');
    assert.equal(h.sent.length, 2);
    assert.equal(h.sent[1]!.fix.timestamp, 15);
  });

  it('~1 Hz for a minute → at most 5 publishes (vs 60 before)', async () => {
    const h = harness();
    for (let i = 0; i < 60; i++) {
      await h.throttle.handleDelivery([loc(25 + i / 1e4, i)]);
      h.advance(1000);
    }
    assert.ok(h.sent.length <= 5 && h.sent.length >= 4, String(h.sent.length));
  });

  it('batches: the most recent valid fix wins; invalid ones are ignored', () => {
    const fix = pickLatestValidFix(
      [loc(25.1, 3), loc(25.2, 9, null), { coords: { latitude: NaN, longitude: 0 }, timestamp: 20 }, loc(95, 30)],
      0,
    );
    assert.equal(fix?.timestamp, 9);
    assert.equal(fix?.accuracyMeters, 999);
    assert.equal(pickLatestValidFix([], 0), null);
  });

  it('a kept fix is sent by an explicit flush or the timer, without a new delivery', async () => {
    const h = harness();
    await h.throttle.handleDelivery([loc(25.1, 1)]);
    h.advance(2000);
    await h.throttle.handleDelivery([loc(25.2, 2)]);
    assert.equal(h.timers.length, 1, 'best-effort timer armed');
    assert.equal(await h.throttle.flush(), 'throttled');
    h.advance(BG_PUBLISH_MIN_INTERVAL_MS);
    assert.equal(await h.throttle.flush(), 'sent');
    assert.equal(h.sent[1]!.fix.timestamp, 2);
    assert.equal(await h.throttle.flush(), 'idle');
  });

  it('one publish at a time: deliveries during a publish are kept, not sent twice', async () => {
    const h = harness({ holdPublish: true });
    const first = h.throttle.handleDelivery([loc(25.1, 1)]);
    await new Promise((r) => setImmediate(r));
    assert.equal(await h.throttle.handleDelivery([loc(25.2, 2)]), 'in-flight');
    h.release();
    assert.equal(await first, 'sent');
    assert.equal(h.sent.length, 1);
    assert.equal(h.throttle.pendingFix()?.fix.timestamp, 2);
  });

  it('a failed publish keeps its fix and does not reset the interval', async () => {
    const h = harness({ publishOk: false });
    assert.equal(await h.throttle.handleDelivery([loc(25.1, 1)]), 'failed');
    assert.equal(h.throttle.pendingFix()?.fix.timestamp, 1);
    h.advance(1000);
    assert.equal(await h.throttle.flush(), 'throttled');
  });

  it('never sends a kept fix of another account; gate off drops it', async () => {
    const h = harness();
    await h.throttle.handleDelivery([loc(25.1, 1)]);
    h.advance(1000);
    await h.throttle.handleDelivery([loc(25.2, 2)]);
    h.setGate('uidB');
    h.advance(BG_PUBLISH_MIN_INTERVAL_MS);
    assert.equal(await h.throttle.flush(), 'idle');
    assert.equal(h.sent.every((s) => s.uid === 'uidA'), true);
    // New account: its own first fix is immediate (A's interval does not apply).
    assert.equal(await h.throttle.handleDelivery([loc(30, 3)]), 'sent');
    assert.equal(h.sent.at(-1)!.uid, 'uidB');
    h.setGate(null);
    assert.equal(await h.throttle.handleDelivery([loc(31, 4)]), 'blocked');
    assert.equal(h.throttle.pendingFix(), null);
  });

  it('the interval survives a fresh task process (persisted last publish)', async () => {
    const h = harness();
    h.setStored({ uid: 'uidA', atMs: 1_000_000 - 5000 });
    assert.equal(await h.throttle.handleDelivery([loc(25.1, 1)]), 'throttled');
    h.setStored({ uid: 'uidOther', atMs: 1_000_000 });
    const h2 = harness();
    h2.setStored({ uid: 'uidOther', atMs: 1_000_000 });
    assert.equal(await h2.throttle.handleDelivery([loc(25.1, 1)]), 'sent');
  });

  it('clear() forgets the kept fix (stop / sign-out)', async () => {
    const h = harness();
    await h.throttle.handleDelivery([loc(25.1, 1)]);
    h.advance(1000);
    await h.throttle.handleDelivery([loc(25.2, 2)]);
    h.throttle.clear();
    h.advance(BG_PUBLISH_MIN_INTERVAL_MS);
    assert.equal(await h.throttle.flush(), 'idle');
  });
});

describe('wiring', () => {
  it('iOS task publishes only through the throttle; config, permissions and validity unchanged', () => {
    const task = read('background/locationTask.ios.ts');
    assert.match(task, /await bgPublishThrottle\.handleDelivery\(locations\)/);
    assert.equal(task.split('publishLocationFlow(client').length - 1, 1);
    assert.match(task, /observedAt: Date\.now\(\)/);
    const service = read('services/backgroundLocation.ts');
    assert.match(service, /clearPendingBackgroundLocation\(\);/);
    assert.match(service, /accuracy = Location\.Accuracy\.Highest/);
    assert.match(service, /Platform\.OS === 'ios' \? 0 : distanceInterval/);
    const publisher = read('components/ContractualLocationPublisher.tsx');
    assert.equal(publisher.split('flushPendingBackgroundLocation()').length - 1, 2);
    const android = read('background/locationTask.android.ts');
    assert.match(android, /export function flushPendingBackgroundLocation\(\): void \{\}/);
  });
});

/**
 * BUG-DISC-05 — BG publish probe helpers (physical QA).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { LOCATION_TTL_MS } from '../constants.ts';
import {
  applyBgPublishProbeAttempt,
  BG_PUBLISH_PROBE_KEY,
  didConfirmedAtRenewDuringWindow,
  emptyBgPublishProbe,
  formatBgPublishProbeEvidence,
  parseBgPublishProbe,
  summarizeBgPublishWindow,
} from '../backgroundPublishProbe.ts';

const here = dirname(fileURLToPath(import.meta.url));

describe('backgroundPublishProbe', () => {
  it('parses empty / invalid as empty snapshot', () => {
    assert.deepEqual(parseBgPublishProbe(null), emptyBgPublishProbe());
    assert.deepEqual(parseBgPublishProbe('not-json'), emptyBgPublishProbe());
  });

  it('accumulates ok/fail counts, confirmedAt, and acceptedAts on success', () => {
    let snap = emptyBgPublishProbe();
    snap = applyBgPublishProbeAttempt(snap, {
      nowMs: 1000,
      ok: false,
      kind: 'invalid-accuracy',
    });
    assert.equal(snap.failCount, 1);
    assert.equal(snap.okCount, 0);
    assert.equal(snap.lastKind, 'invalid-accuracy');
    assert.deepEqual(snap.acceptedAts, []);

    snap = applyBgPublishProbeAttempt(snap, {
      nowMs: 2000,
      ok: true,
      kind: 'ok',
      confirmedAt: 5000,
    });
    assert.equal(snap.okCount, 1);
    assert.equal(snap.failCount, 1);
    assert.equal(snap.lastConfirmedAt, 5000);
    assert.equal(snap.lastOk, true);
    assert.deepEqual(snap.acceptedAts, [5000]);
  });

  it('detects confirmedAt renewal in a BG window', () => {
    assert.equal(
      didConfirmedAtRenewDuringWindow({
        confirmedAtBefore: 100,
        confirmedAtAfter: 200,
      }),
      true,
    );
    assert.equal(
      didConfirmedAtRenewDuringWindow({
        confirmedAtBefore: 200,
        confirmedAtAfter: 200,
      }),
      false,
    );
    assert.equal(
      didConfirmedAtRenewDuringWindow({
        confirmedAtBefore: null,
        confirmedAtAfter: 50,
      }),
      true,
    );
  });

  it('okCount alone does not sustain TTL — requires gap ≤ LOCATION_TTL_MS', () => {
    const windowStart = 0;
    const windowEnd = 12 * 60_000;
    const sparse = summarizeBgPublishWindow({
      acceptedAts: [1_000, 8 * 60_000],
      windowStartMs: windowStart,
      windowEndMs: windowEnd,
    });
    assert.equal(sparse.acceptedCount, 2);
    assert.equal(sparse.maxInterPublishGapMs, 8 * 60_000 - 1_000);
    assert.ok(sparse.maxGapMs != null && sparse.maxGapMs > LOCATION_TTL_MS);
    assert.equal(sparse.sustainsTtl, false);

    const dense = summarizeBgPublishWindow({
      acceptedAts: [
        1_000,
        2 * 60_000,
        4 * 60_000,
        6 * 60_000,
        8 * 60_000,
        10 * 60_000,
      ],
      windowStartMs: windowStart,
      windowEndMs: windowEnd,
    });
    assert.equal(dense.acceptedCount, 6);
    assert.ok(dense.maxGapMs != null && dense.maxGapMs <= LOCATION_TTL_MS);
    assert.equal(dense.sustainsTtl, true);
  });

  it('evidence formatter exposes timestamps without coords/UID fields', () => {
    let snap = emptyBgPublishProbe();
    snap = applyBgPublishProbeAttempt(snap, {
      nowMs: 1000,
      ok: true,
      kind: 'ok',
      confirmedAt: 1000,
    });
    snap = applyBgPublishProbeAttempt(snap, {
      nowMs: 120_000,
      ok: true,
      kind: 'ok',
      confirmedAt: 120_000,
    });
    snap = applyBgPublishProbeAttempt(snap, {
      nowMs: 130_000,
      ok: false,
      kind: 'invalid-accuracy',
    });
    assert.deepEqual(snap.acceptedAts, [1000, 120_000]);
    assert.equal(snap.failCount, 1);
    const evidence = formatBgPublishProbeEvidence({
      windowStartMs: 0,
      windowEndMs: 180_000,
      probe: snap,
    });
    const json = JSON.stringify(evidence);
    assert.doesNotMatch(json, /lat|lng|longitude|latitude|uid/i);
    assert.ok(Array.isArray(evidence.summary.acceptedAtsInWindow));
    assert.equal(typeof evidence.summary.maxGapMs, 'number');
  });

  it('iOS BG task records probe and inspects publish outcome', () => {
    const task = readFileSync(
      join(here, '../../background/locationTask.ios.ts'),
      'utf8',
    );
    assert.match(task, /BG_PUBLISH_PROBE_KEY|NEARSY_BG_PUBLISH_PROBE/);
    assert.match(task, /recordBgPublishProbe/);
    assert.match(task, /outcome\.ok/);
    assert.match(task, /publishLocationFlow/);
    // DEV success log must not dump coordinates (confirmedAt only).
    assert.match(
      task,
      /console\.log\(\s*'\[BG Task iOS\] publishLocation ok',\s*\{\s*confirmedAt/,
    );
    assert.equal(BG_PUBLISH_PROBE_KEY, 'NEARSY_BG_PUBLISH_PROBE');
  });
});

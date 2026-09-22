/**
 * BUG-DISC-05 — BG publish probe helpers (physical QA).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  applyBgPublishProbeAttempt,
  BG_PUBLISH_PROBE_KEY,
  didConfirmedAtRenewDuringWindow,
  emptyBgPublishProbe,
  parseBgPublishProbe,
} from '../backgroundPublishProbe.ts';

const here = dirname(fileURLToPath(import.meta.url));

describe('backgroundPublishProbe', () => {
  it('parses empty / invalid as empty snapshot', () => {
    assert.deepEqual(parseBgPublishProbe(null), emptyBgPublishProbe());
    assert.deepEqual(parseBgPublishProbe('not-json'), emptyBgPublishProbe());
  });

  it('accumulates ok/fail counts and confirmedAt on success', () => {
    let snap = emptyBgPublishProbe();
    snap = applyBgPublishProbeAttempt(snap, {
      nowMs: 1000,
      ok: false,
      kind: 'invalid-accuracy',
    });
    assert.equal(snap.failCount, 1);
    assert.equal(snap.okCount, 0);
    assert.equal(snap.lastKind, 'invalid-accuracy');

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

  it('iOS BG task records probe and inspects publish outcome', () => {
    const task = readFileSync(
      join(here, '../../background/locationTask.ios.ts'),
      'utf8',
    );
    assert.match(task, /BG_PUBLISH_PROBE_KEY|NEARSY_BG_PUBLISH_PROBE/);
    assert.match(task, /recordBgPublishProbe/);
    assert.match(task, /outcome\.ok/);
    assert.match(task, /publishLocationFlow/);
    assert.equal(BG_PUBLISH_PROBE_KEY, 'NEARSY_BG_PUBLISH_PROBE');
  });
});

/**
 * Nearby initial-load / empty-chrome regression (BUG-DISC-02 flicker).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import {
  shouldApplyNearbyLoadResult,
  shouldPreserveNearbyResultsDuringLoad,
  shouldShowNearbyEmptyChrome,
  shouldUseNearbyFullScreenLoader,
  shouldWaitForNearbyProfile,
} from '../nearbyLoadUi.ts';

const here = dirname(fileURLToPath(import.meta.url));

describe('nearbyLoadUi — empty chrome gating', () => {
  it('initial unresolved state cannot render empty chrome', () => {
    assert.equal(
      shouldShowNearbyEmptyChrome({
        initialDiscoveryPending: true,
        loading: false,
        itemCount: 0,
      }),
      false,
    );
    assert.equal(
      shouldShowNearbyEmptyChrome({
        initialDiscoveryPending: true,
        loading: true,
        itemCount: 0,
      }),
      false,
    );
  });

  it('successful initial zero-result may show empty chrome', () => {
    assert.equal(
      shouldShowNearbyEmptyChrome({
        initialDiscoveryPending: false,
        loading: false,
        itemCount: 0,
      }),
      true,
    );
  });

  it('non-empty result does not show empty chrome', () => {
    assert.equal(
      shouldShowNearbyEmptyChrome({
        initialDiscoveryPending: false,
        loading: false,
        itemCount: 3,
      }),
      false,
    );
  });
});

describe('nearbyLoadUi — loader / preserve', () => {
  it('effect while pending uses full-screen loader', () => {
    assert.equal(
      shouldUseNearbyFullScreenLoader({
        reason: 'effect',
        initialDiscoveryPending: true,
      }),
      true,
    );
  });

  it('pull-to-refresh never uses full-screen loader', () => {
    assert.equal(
      shouldUseNearbyFullScreenLoader({
        reason: 'ptr',
        initialDiscoveryPending: false,
      }),
      false,
    );
  });

  it('background refresh preserves existing profiles', () => {
    assert.equal(
      shouldPreserveNearbyResultsDuringLoad({
        reason: 'effect',
        initialDiscoveryPending: false,
        itemCount: 2,
      }),
      true,
    );
  });

  it('focus, app_foreground, and interval preserve profiles and skip full-screen loader', () => {
    for (const reason of ['focus', 'app_foreground', 'interval'] as const) {
      assert.equal(
        shouldUseNearbyFullScreenLoader({
          reason,
          initialDiscoveryPending: false,
        }),
        false,
      );
      assert.equal(
        shouldPreserveNearbyResultsDuringLoad({
          reason,
          initialDiscoveryPending: false,
          itemCount: 2,
        }),
        true,
      );
    }
  });

  it('applies only the latest load generation (out-of-order guard)', () => {
    assert.equal(
      shouldApplyNearbyLoadResult({ requestId: 3, latestRequestId: 3 }),
      true,
    );
    assert.equal(
      shouldApplyNearbyLoadResult({ requestId: 2, latestRequestId: 3 }),
      false,
    );
  });

  it('retry does not preserve stale results', () => {
    assert.equal(
      shouldPreserveNearbyResultsDuringLoad({
        reason: 'retry',
        initialDiscoveryPending: false,
        itemCount: 2,
      }),
      false,
    );
  });

  it('waits for profile snapshot before treating visibility as OFF', () => {
    assert.equal(shouldWaitForNearbyProfile({ profileReady: false }), true);
    assert.equal(shouldWaitForNearbyProfile({ profileReady: true }), false);
  });
});

describe('NearbySearchScreen wiring', () => {
  it('gates empty chrome and preserves results on silent refresh', () => {
    const src = readFileSync(
      join(here, '../../screens/NearbySearchScreen.tsx'),
      'utf8',
    );
    assert.match(src, /shouldShowNearbyEmptyChrome/);
    assert.match(src, /shouldPreserveNearbyResultsDuringLoad/);
    assert.match(src, /shouldUseNearbyFullScreenLoader/);
    assert.match(src, /shouldApplyNearbyLoadResult/);
    assert.match(src, /initialDiscoveryPendingRef/);
    assert.match(src, /loadNearbyWithContractualRefresh/);
    assert.match(src, /useFocusEffect/);
    assert.match(src, /app_foreground/);
    assert.match(src, /NEARBY_FOCUSED_REDISCOVER_MS/);
    assert.match(src, /shouldSkipDuplicateNearbyRediscover/);
    // Empty chrome must not be the unconditional ListEmptyComponent body
    assert.match(src, /showEmptyChrome/);
  });
});

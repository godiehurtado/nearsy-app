/**
 * BUG-DISC-04 — Nearby initial load / silent refresh UI state.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  shouldClearNearbyItemsOnOutcomeFailure,
  shouldShowNearbyEmptyState,
  shouldShowNearbyFullScreenLoading,
} from '../nearbyLoadUiState.ts';

const ROOT = join(__dirname, '..', '..');

function readSrc(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

describe('BUG-DISC-04 nearby load UI derivation', () => {
  it('1. Initial unresolved → loading, empty NOT visible', () => {
    const fullScreen = shouldShowNearbyFullScreenLoading({
      loading: true,
      initialFetchCompleted: false,
    });
    assert.equal(fullScreen, true);
    assert.equal(
      shouldShowNearbyEmptyState({
        fullScreenLoading: fullScreen,
        itemCount: 0,
        errorKind: 'none',
      }),
      false,
    );
  });

  it('1b. Unresolved even if loading flag false (race) → still loading', () => {
    assert.equal(
      shouldShowNearbyFullScreenLoading({
        loading: false,
        initialFetchCompleted: false,
      }),
      true,
    );
  });

  it('2. Initial successful zero-result → empty visible, loading gone', () => {
    const fullScreen = shouldShowNearbyFullScreenLoading({
      loading: false,
      initialFetchCompleted: true,
    });
    assert.equal(fullScreen, false);
    assert.equal(
      shouldShowNearbyEmptyState({
        fullScreenLoading: fullScreen,
        itemCount: 0,
        errorKind: 'empty',
      }),
      true,
    );
  });

  it('3. Initial successful profiles → no empty state', () => {
    assert.equal(
      shouldShowNearbyEmptyState({
        fullScreenLoading: false,
        itemCount: 3,
        errorKind: 'none',
      }),
      false,
    );
  });

  it('4. Initial error → empty/error placeholder visible', () => {
    assert.equal(
      shouldShowNearbyEmptyState({
        fullScreenLoading: false,
        itemCount: 0,
        errorKind: 'retry',
      }),
      true,
    );
    assert.equal(
      shouldShowNearbyEmptyState({
        fullScreenLoading: false,
        itemCount: 0,
        errorKind: 'generic',
      }),
      true,
    );
  });

  it('5. Subsequent auto refresh with profiles → no full-screen loading', () => {
    assert.equal(
      shouldShowNearbyFullScreenLoading({
        loading: false,
        initialFetchCompleted: true,
      }),
      false,
    );
    assert.equal(
      shouldClearNearbyItemsOnOutcomeFailure({ showFullScreenLoader: false }),
      false,
    );
  });

  it('6. Pull-to-refresh stays non-fullscreen (RefreshControl only)', () => {
    assert.equal(
      shouldShowNearbyFullScreenLoading({
        loading: false,
        initialFetchCompleted: true,
      }),
      false,
    );
    assert.equal(
      shouldClearNearbyItemsOnOutcomeFailure({ showFullScreenLoader: false }),
      false,
    );
  });

  it('7. Subsequent refresh resolving zero → empty only after errorKind empty', () => {
    assert.equal(
      shouldShowNearbyEmptyState({
        fullScreenLoading: false,
        itemCount: 0,
        errorKind: 'none',
      }),
      false,
    );
    assert.equal(
      shouldShowNearbyEmptyState({
        fullScreenLoading: false,
        itemCount: 0,
        errorKind: 'empty',
      }),
      true,
    );
  });
});

describe('BUG-DISC-04 NearbySearchScreen wiring', () => {
  const nearby = readSrc('screens/NearbySearchScreen.tsx');

  it('marks initial fetch complete only in finally (not before await)', () => {
    assert.match(nearby, /initialFetchCompletedRef/);
    assert.match(nearby, /setInitialFetchCompleted\(true\)/);
    const effect = nearby.slice(
      nearby.indexOf('useEffect(() => {'),
      nearby.indexOf('const onRefresh'),
    );
    assert.match(effect, /loadData\(!initialFetchCompletedRef\.current\)/);
    assert.doesNotMatch(effect, /hasLoadedOnce\.current\s*=\s*true/);
  });

  it('silent refresh does not clear error chrome at start', () => {
    assert.match(nearby, /if \(showFullScreenLoader\) \{/);
    assert.match(nearby, /setLoading\(true\);/);
    const guarded = nearby.slice(
      nearby.indexOf('if (showFullScreenLoader) {'),
      nearby.indexOf('if (showFullScreenLoader) {') + 180,
    );
    assert.match(guarded, /setErrorKind\('none'\)/);
    assert.match(guarded, /setErrorMessage\(null\)/);
    // Error chrome reset is inside the full-screen branch only.
    assert.doesNotMatch(
      nearby,
      /async \(showFullScreenLoader: boolean\) => \{\s*setErrorKind\('none'\)/,
    );
  });

  it('pull-to-refresh uses loadData\(false\) + RefreshControl', () => {
    assert.match(nearby, /await loadData\(false\)/);
    assert.match(nearby, /refreshing=\{refreshing\}/);
    assert.match(nearby, /shouldShowNearbyFullScreenLoading/);
    assert.match(nearby, /shouldShowNearbyEmptyState/);
  });

  it('Discovery Reliability contract helpers remain wired', () => {
    assert.match(nearby, /loadNearbyWithContractualRefresh/);
    assert.match(nearby, /limit:\s*50/);
  });
});

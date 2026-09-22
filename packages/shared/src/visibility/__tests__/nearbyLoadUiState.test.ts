/**
 * BUG-DISC-04 — Nearby initial load / silent refresh UI state.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  isNearbyViewerVisibilityConfirmedOff,
  shouldApplyNearbyLoadOutcome,
  shouldClearNearbyItemsOnOutcomeFailure,
  shouldShowNearbyEmptyState,
  shouldShowNearbyFullScreenLoading,
} from '../nearbyLoadUiState.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

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

  it('1c. Profile not hydrated → loading (no false Visibility off / empty)', () => {
    const fullScreen = shouldShowNearbyFullScreenLoading({
      loading: false,
      initialFetchCompleted: false,
      profileHydrated: false,
    });
    assert.equal(fullScreen, true);
    assert.equal(
      shouldShowNearbyEmptyState({
        fullScreenLoading: fullScreen,
        itemCount: 0,
        errorKind: 'inactive',
      }),
      false,
    );
    assert.equal(
      isNearbyViewerVisibilityConfirmedOff({
        profileHydrated: false,
        visibility: undefined,
      }),
      false,
    );
  });

  it('1d. Confirmed visibility off only after hydrate', () => {
    assert.equal(
      isNearbyViewerVisibilityConfirmedOff({
        profileHydrated: true,
        visibility: false,
      }),
      true,
    );
    assert.equal(
      isNearbyViewerVisibilityConfirmedOff({
        profileHydrated: true,
        visibility: undefined,
      }),
      true,
    );
    assert.equal(
      isNearbyViewerVisibilityConfirmedOff({
        profileHydrated: true,
        visibility: true,
      }),
      false,
    );
  });

  it('2. Initial successful zero-result → empty visible, loading gone', () => {
    const fullScreen = shouldShowNearbyFullScreenLoading({
      loading: false,
      initialFetchCompleted: true,
      profileHydrated: true,
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

  it('4b. Confirmed inactive → Visibility is off empty state', () => {
    assert.equal(
      shouldShowNearbyEmptyState({
        fullScreenLoading: false,
        itemCount: 0,
        errorKind: 'inactive',
      }),
      true,
    );
  });

  it('5. Subsequent auto refresh with profiles → no full-screen loading', () => {
    assert.equal(
      shouldShowNearbyFullScreenLoading({
        loading: false,
        initialFetchCompleted: true,
        profileHydrated: true,
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
        profileHydrated: true,
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

  it('8. Out-of-order load generation is ignored (BUG-DISC-05)', () => {
    assert.equal(shouldApplyNearbyLoadOutcome(1, 1), true);
    assert.equal(shouldApplyNearbyLoadOutcome(2, 2), true);
    assert.equal(shouldApplyNearbyLoadOutcome(1, 2), false);
    assert.equal(shouldApplyNearbyLoadOutcome(3, 2), false);
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

  it('waits for profile hydration before treating visibility as off', () => {
    assert.match(nearby, /profileHydrated/);
    assert.match(nearby, /setProfileHydrated\(true\)/);
    assert.match(nearby, /isNearbyViewerVisibilityConfirmedOff/);
    assert.doesNotMatch(
      nearby,
      /if\s*\(\s*!profile\.visibility\s*\)\s*\{/,
    );
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
    assert.match(nearby, /profileHydrated/);
  });

  it('Discovery Reliability contract helpers remain wired', () => {
    assert.match(nearby, /loadNearbyWithContractualRefresh/);
    assert.match(nearby, /limit:\s*50/);
  });
});

describe('BUG-DISC-05 Nearby focus / foreground refresh wiring', () => {
  const nearby = readSrc('screens/NearbySearchScreen.tsx');
  const publisher = readSrc('components/ContractualLocationPublisher.tsx');
  const cadence = readSrc('visibility/contractualLocationRefresh.ts');
  const bgTask = readSrc('background/locationTask.android.ts');

  it('reconsults on screen focus, AppState active, and periodic timer while focused', () => {
    assert.match(nearby, /useFocusEffect/);
    assert.match(nearby, /AppState\.addEventListener/);
    assert.match(nearby, /setInterval/);
    assert.match(nearby, /NEARBY_FOCUSED_REDISCOVER_INTERVAL_MS/);
    assert.match(nearby, /trySilentRediscover/);
    assert.match(nearby, /shouldAttemptNearbyRediscover/);
    assert.match(nearby, /forcePublish:\s*false/);
    assert.match(nearby, /isFocusedRef/);
    assert.match(nearby, /initialFetchCompletedRef\.current/);
    assert.match(nearby, /shouldApplyNearbyLoadOutcome/);
    assert.match(nearby, /loadGenerationRef/);
  });

  it('success path still replaces items; silent failure does not clear', () => {
    assert.match(nearby, /setItems\(outcome\.results\)/);
    assert.match(nearby, /shouldClearNearbyItemsOnOutcomeFailure/);
    assert.equal(
      shouldClearNearbyItemsOnOutcomeFailure({ showFullScreenLoader: false }),
      false,
    );
  });

  it('does not invent local freshness / proximity filters on discoverNearby rows', () => {
    assert.doesNotMatch(nearby, /confirmedAt/);
    assert.doesNotMatch(nearby, /isLocationFresh/);
    assert.doesNotMatch(nearby, /LOCATION_TTL/);
    assert.doesNotMatch(
      nearby,
      /filter\([\s\S]*distanceMeters\s*[<>]/,
    );
  });

  it('foreground publish + rediscover cadence stay under 5-minute Discovery TTL', () => {
    assert.match(cadence, /FOREGROUND_CONTRACTUAL_CADENCE_MS\s*=\s*2\s*\*\s*60_000/);
    assert.match(cadence, /NEARBY_FOCUSED_REDISCOVER_INTERVAL_MS/);
    assert.match(cadence, /NEARBY_REDISCOVER_DEBOUNCE_MS\s*=\s*5_000/);
    assert.match(publisher, /FOREGROUND_CONTRACTUAL_CADENCE_MS/);
    assert.match(publisher, /publishLocationFlow/);
  });

  it('Android background task still publishes via publishLocationFlow', () => {
    assert.match(bgTask, /publishLocationFlow/);
    assert.doesNotMatch(bgTask, /\.collection\(['\"]users['\"]\)/);
  });
});

describe('Compact Alignment badge — single percent', () => {
  const badge = readSrc('components/profileExploration/CompactAlignmentBadge.tsx');
  const ring = readSrc('components/alignment/AlignmentScoreRing.tsx');

  it('renders percent only inside AlignmentScoreRing, keeps Alignment caption', () => {
    assert.match(badge, /AlignmentScoreRing/);
    assert.match(badge, /alignmentTitleLabel/);
    assert.doesNotMatch(badge, /formatAlignmentPercent/);
    assert.match(ring, /formatAlignmentPercent\(clampedScore\)/);
  });
});

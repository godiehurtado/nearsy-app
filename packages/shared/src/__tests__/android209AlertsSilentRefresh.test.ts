/**
 * Play 2.0.9 Alerts — silent periodic refresh (no list remount / wipe).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));

function read(relativeFromSharedSrc: string): string {
  return readFileSync(join(here, '..', relativeFromSharedSrc), 'utf8');
}

describe('209 Alerts silent refresh wiring', () => {
  it('screen keeps FlatList mounted after the first load', () => {
    const screen = read('screens/AlertsScreen.tsx');
    assert.match(screen, /shouldShowAlertsFullScreenLoading/);
    assert.match(screen, /showInitialLoader/);
    assert.match(screen, /RefreshControl/);
    assert.doesNotMatch(screen, /if \(loading\) \{/);
  });

  it('hook does not refetch on every viewer-doc identity change', () => {
    const hook = read('hooks/useNearbyAlerts.ts');
    assert.match(hook, /fingerprintActiveModeInterests/);
    assert.match(hook, /me\?\.uid, me\?\.visibility, interestFingerprint/);
    assert.doesNotMatch(hook, /}, \[me, authUid, buildAlerts\]\)/);
    assert.doesNotMatch(hook, /setLoading\(true\);\s*buildAlerts\(\)/);
  });

  it('interval and pull-to-refresh stay silent; errors keep valid rows', () => {
    const hook = read('hooks/useNearbyAlerts.ts');
    assert.match(hook, /buildAlerts\(false\)/);
    assert.match(hook, /if \(inFlightRef\.current\) return;/);
    assert.match(hook, /shouldClearNearbyItemsOnOutcomeFailure/);
    assert.match(hook, /shouldApplyNearbyLoadOutcome/);
    assert.match(hook, /cancelledRef/);
    assert.match(hook, /Valid empty payloads replace the list/);
  });

  it('uid or unmount invalidates in-flight discoverNearby', () => {
    const hook = read('hooks/useNearbyAlerts.ts');
    assert.match(hook, /viewerUidRef/);
    assert.match(hook, /uidChanged/);
    assert.match(hook, /cancelledRef\.current = true/);
    assert.match(hook, /requestGenerationRef\.current \+= 1/);
  });
});

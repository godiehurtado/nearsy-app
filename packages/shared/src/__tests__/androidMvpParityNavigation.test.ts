/**
 * Final Android MVP parity — navigation + callable wiring (static checks).
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

describe('Android MVP parity navigation', () => {
  it('HomeStack exposes DiscoveryProfile and Nearby uses it', () => {
    const homeStack = read('navigation/HomeStack.tsx');
    const nearby = read('screens/NearbySearchScreen.tsx');
    assert.match(homeStack, /DiscoveryProfile/);
    assert.match(homeStack, /DiscoveryProfileScreen/);
    assert.match(nearby, /navigate\('DiscoveryProfile'/);
    assert.match(nearby, /discoverNearby/);
    assert.match(nearby, /getVisibilityDiscoveryClient/);
  });

  it('MainHome uses visibility orchestration callables', () => {
    const mainHome = read('screens/MainHomeScreen.tsx');
    assert.match(mainHome, /activateVisibilityFlow/);
    assert.match(mainHome, /deactivateVisibilityFlow/);
    assert.match(mainHome, /getVisibilityDiscoveryClient/);
    assert.doesNotMatch(mainHome, /dbQueryVisibleUsers/);
  });

  it('DiscoveryProfile uses getDiscoveryProfile only for candidate', () => {
    const screen = read('screens/DiscoveryProfileScreen.tsx');
    assert.match(screen, /getDiscoveryProfile/);
    assert.match(screen, /buildGetDiscoveryProfileRequest/);
    assert.doesNotMatch(screen, /collection\('users'\)\.doc\(/);
  });

  it('Alerts opens DiscoveryProfile via discoverNearby', () => {
    const alerts = read('screens/AlertsScreen.tsx');
    assert.match(alerts, /discoverNearby/);
    assert.match(alerts, /DiscoveryProfile/);
  });

  it('MoreStack includes BlockedPeople with getBlockedPeople screen', () => {
    const moreStack = read('navigation/MoreStack.tsx');
    const blocked = read('screens/BlockedPeopleScreen.tsx');
    assert.match(moreStack, /BlockedPeople/);
    assert.match(blocked, /getBlockedPeople/);
  });

  it('Affiliations search fix preserved (callable HTTP, no stub bootstrap)', () => {
    const bootstrap = read(
      'affiliations/iosAffiliationEntitySearchBootstrap.android.ts',
    );
    assert.doesNotMatch(bootstrap, /appCheckBootstrap\.ts/);
    assert.match(bootstrap, /invokeAffiliationSearchCallableHttp/);
  });
});

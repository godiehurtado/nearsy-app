/**
 * Discovery public detail — silent focus refetch.
 * Does not enable Functions Instagram / social pilots.
 * Does not read the private legacy social bag.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { GetDiscoveryProfileResponse } from '../callables';
import {
  applyDiscoveryProfileFailure,
  applyDiscoveryProfileSuccess,
  discoveryPublicHasPlatform,
  shouldApplyDiscoveryProfileLoadResult,
  shouldSilentDiscoveryProfileRefresh,
} from '../discoveryProfileLoad';

const here = dirname(fileURLToPath(import.meta.url));

function readSrc(relFromSrc: string): string {
  return readFileSync(join(here, '../..', relFromSrc), 'utf8');
}

function sampleDetail(
  socialLinks: GetDiscoveryProfileResponse['socialLinks'],
): GetDiscoveryProfileResponse {
  return {
    contractVersion: 1,
    uid: 'cand',
    distanceMeters: 12,
    profile: {
      mode: 'personal',
      displayName: 'Ana',
      profileImage: null,
      occupation: 'Designer',
      interestIds: [],
      company: '',
      bio: '',
      birthCountryCode: null,
      currentCity: null,
      languageCodes: [],
      zodiacSign: null,
    },
    gallery: [],
    socialLinks,
    affiliations: [],
    serverTime: 1,
  };
}

describe('Discovery public detail focus refresh — decisions', () => {
  it('is silent only when a successful payload already exists', () => {
    assert.equal(shouldSilentDiscoveryProfileRefresh(null), false);
    assert.equal(
      shouldSilentDiscoveryProfileRefresh(sampleDetail([])),
      true,
    );
  });

  it('discards late generations', () => {
    assert.equal(
      shouldApplyDiscoveryProfileLoadResult({
        requestId: 4,
        latestRequestId: 4,
      }),
      true,
    );
    assert.equal(
      shouldApplyDiscoveryProfileLoadResult({
        requestId: 3,
        latestRequestId: 4,
      }),
      false,
    );
  });

  it('keeps valid data on error and does not mark later chrome', () => {
    const previous = sampleDetail([
      { platform: 'instagram', url: 'https://www.instagram.com/ana' },
    ]);
    const kept = applyDiscoveryProfileFailure(previous, 'load');
    assert.equal(kept.data, previous);
    assert.equal(kept.errorKind, 'none');
    assert.equal(kept.loading, false);
    assert.equal(discoveryPublicHasPlatform(kept.data, 'instagram'), true);

    const first = applyDiscoveryProfileFailure(null, 'unavailable');
    assert.equal(first.data, null);
    assert.equal(first.errorKind, 'unavailable');
  });

  it('successful payload without Instagram replaces the icon set', () => {
    const previous = sampleDetail([
      { platform: 'instagram', url: 'https://www.instagram.com/ana' },
      { platform: 'facebook', url: 'https://www.facebook.com/ana' },
    ]);
    assert.equal(discoveryPublicHasPlatform(previous, 'instagram'), true);

    const next = applyDiscoveryProfileSuccess(
      sampleDetail([
        { platform: 'facebook', url: 'https://www.facebook.com/ana' },
      ]),
    );
    assert.notEqual(next.data, previous);
    assert.equal(discoveryPublicHasPlatform(next.data, 'instagram'), false);
    assert.equal(discoveryPublicHasPlatform(next.data, 'facebook'), true);
    assert.equal(next.errorKind, 'none');
  });
});

describe('Discovery public detail focus refresh — iOS wiring', () => {
  it('refetches on later focus and app foreground without duplicating mount load', () => {
    const screen = readSrc('screens/DiscoveryProfileScreen.tsx');
    assert.match(screen, /useFocusEffect/);
    assert.match(screen, /skipNextFocusRefetchRef/);
    assert.match(screen, /loadProfile\(\{ silent: false \}\)/);
    assert.match(screen, /loadProfileRef\.current\(\{ silent: true \}\)/);
    assert.match(screen, /AppState\.addEventListener\('change'/);
    assert.match(screen, /shouldSilentDiscoveryProfileRefresh/);
    assert.match(screen, /shouldApplyDiscoveryProfileLoadResult/);
    assert.match(screen, /applyDiscoveryProfileSuccess/);
    assert.match(screen, /applyDiscoveryProfileFailure/);
  });

  it('keeps getDiscoveryProfile as the only candidate source and leaves the private bag unread', () => {
    const screen = readSrc('screens/DiscoveryProfileScreen.tsx');
    assert.equal((screen.match(/getDiscoveryProfile\(/g) ?? []).length, 1);
    assert.doesNotMatch(screen, /socialLinksPersonal/);
    assert.doesNotMatch(screen, /socialLinksProfessional/);
    assert.doesNotMatch(screen, /getDoc\(/);
    assert.doesNotMatch(screen, /inboxAuthorizeStart/);
    assert.doesNotMatch(screen, /instagramInbox/);
    assert.match(screen, /does not enable Functions social pilots/);
  });
});

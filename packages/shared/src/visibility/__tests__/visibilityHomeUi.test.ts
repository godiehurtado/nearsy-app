import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildInterestSearchEntries,
  normalizeSearchQuery,
  searchInterestEntries,
} from '../interestSearchCatalog';
import { flattenCatalogInterestItems } from '../../interests/onboardingInterestCatalog';
import {
  presentVisibilityCallableError,
  presentVisibilityLocalError,
} from '../visibilityErrorPresentation';
import { VisibilityDiscoveryClientError } from '../callables/errors';
import {
  MAX_SEARCH_INTEREST_IDS,
  MAX_VISIBILITY_AGE,
  MIN_VISIBILITY_AGE,
} from '../constants';
import {
  canAddSearchInterest,
} from '../preferences';
import {
  presentDistanceFromCanonical,
} from '../distance';
import {
  resolveDistanceDisplayUnit,
} from '../searchPreferencesParse';
import { ratioToValue, snapValue, valueToRatio } from '../sliderMath';

const identityLabels = {
  category: (_key: string, fallback: string) => fallback,
  group: (_key: string, fallback: string) => fallback,
  item: (_key: string, fallback: string) => fallback,
};

function officialCatalogInterestIdSet(): ReadonlySet<string> {
  return new Set(
    flattenCatalogInterestItems()
      .filter((item) => !item.id.startsWith('custom_'))
      .map((item) => item.id),
  );
}

const t = (key: string) => key;

describe('interest search catalog (CRJ)', () => {
  it('builds entries from the official CRJ catalog only', () => {
    const officialIds = officialCatalogInterestIdSet();
    const entries = buildInterestSearchEntries(officialIds, identityLabels);
    assert.ok(entries.length > 100);
    assert.ok(entries.every((entry) => officialIds.has(entry.id)));
    assert.ok(entries.some((entry) => entry.id === 'business_entrepreneurship'));
  });

  it('normalizes diacritics for case-insensitive search', () => {
    assert.equal(normalizeSearchQuery('Música'), 'musica');
    assert.equal(normalizeSearchQuery('  CAFÉ '), 'cafe');
  });

  it('filters by interest, category, and subcategory labels', () => {
    const officialIds = officialCatalogInterestIdSet();
    const entries = buildInterestSearchEntries(officialIds, identityLabels);
    const selected = new Set<string>();

    const business = searchInterestEntries(entries, 'business', selected);
    assert.ok(business.some((group) => group.categoryId === 'business'));

    const pop = searchInterestEntries(entries, 'pop', selected);
    assert.ok(
      pop.some((group) =>
        group.items.some((item) => item.id === 'music_genre_pop'),
      ),
    );

    const genreGroup = searchInterestEntries(entries, 'music genres', selected);
    assert.ok(
      genreGroup.some((group) =>
        group.items.some((item) => item.groupLabel === 'Music Genres'),
      ),
    );
  });

  it('excludes already selected interests from search results', () => {
    const officialIds = officialCatalogInterestIdSet();
    const entries = buildInterestSearchEntries(officialIds, identityLabels);
    const selected = new Set(['business_entrepreneurship']);
    const results = searchInterestEntries(entries, 'entrepreneur', selected);
    const flat = results.flatMap((group) => group.items);
    assert.equal(
      flat.some((item) => item.id === 'business_entrepreneurship'),
      false,
    );
  });
});

describe('visibility preference limits', () => {
  it('supports age slider bounds 18–99', () => {
    assert.equal(MIN_VISIBILITY_AGE, 18);
    assert.equal(MAX_VISIBILITY_AGE, 99);
    const low = ratioToValue(0, 18, 99, 1);
    const high = ratioToValue(1, 18, 99, 1);
    assert.equal(low, 18);
    assert.equal(high, 99);
  });

  it('snaps US distance to 5 ft steps and metric to 5 m steps', () => {
    assert.equal(resolveDistanceDisplayUnit('en-US'), 'ft');
    assert.equal(presentDistanceFromCanonical(60.96, 'ft'), 200);
    assert.equal(snapValue(23, 20, 5), 25);
    assert.equal(snapValue(57, 5, 5), 55);
  });

  it('blocks the 13th interest selection', () => {
    const officialIds = officialCatalogInterestIdSet();
    const current = Array.from({ length: 12 }, (_, i) => `official_${i + 1}`);
    const known = new Set([...current, 'official_13']);
    assert.equal(
      canAddSearchInterest(current, 'official_13', known),
      false,
    );
    assert.equal(MAX_SEARCH_INTEREST_IDS, 12);
  });
});

describe('visibility error presentation', () => {
  it('maps contractual reasons to user-safe copy while preserving diagnostics', () => {
    const err = new VisibilityDiscoveryClientError({
      code: 'failed-precondition',
      reason: { kind: 'known', value: 'profile-incomplete' },
      field: 'profileImage',
      retryable: false,
      message: 'failed',
    });
    const presented = presentVisibilityCallableError(err, t);
    assert.equal(presented.userMessage, 'home.errors.profileIncomplete');
    assert.equal(presented.diagnostic.code, 'failed-precondition');
    assert.equal(presented.diagnostic.reason, 'profile-incomplete');
    assert.equal(presented.diagnostic.field, 'profileImage');
    assert.match(presented.devDetail, /profile-incomplete/);
  });

  it('maps invalid-location and unavailable cases', () => {
    const invalidLocation = new VisibilityDiscoveryClientError({
      code: 'failed-precondition',
      reason: { kind: 'known', value: 'invalid-location' },
      retryable: true,
      message: 'failed',
    });
    assert.equal(
      presentVisibilityCallableError(invalidLocation, t).userMessage,
      'home.errors.invalidLocation',
    );

    const unavailable = new VisibilityDiscoveryClientError({
      code: 'unavailable',
      reason: { kind: 'none' },
      retryable: true,
      message: 'failed',
    });
    assert.equal(
      presentVisibilityCallableError(unavailable, t).userMessage,
      'home.errors.networkUnavailable',
    );

    assert.equal(
      presentVisibilityLocalError('permission-denied', t).diagnostic.reason,
      'permission-denied',
    );
  });
});

describe('slider math', () => {
  it('converts ratios back to stepped values', () => {
    assert.equal(valueToRatio(50, 18, 99).toFixed(2), (32 / 81).toFixed(2));
    assert.equal(ratioToValue(0.5, 20, 200, 5), 110);
  });
});

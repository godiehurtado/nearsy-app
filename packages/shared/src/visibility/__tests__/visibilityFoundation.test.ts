import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CANONICAL_DISTANCE_EPSILON_METERS,
  CONTRACT_VERSION,
  DEFAULT_METRIC_DISTANCE_METERS,
  DEFAULT_US_DISTANCE_FEET,
  DEFAULT_US_DISTANCE_METERS,
  DISTANCE_STEP_FEET,
  DISTANCE_STEP_METERS,
  FEET_PER_METER,
  INTEREST_IDS_OVER_MAX_REASON,
  LOCATION_TTL_MS,
  MAX_DISTANCE_FEET,
  MAX_DISTANCE_METERS,
  MAX_DISTANCE_METERS_UI,
  MAX_LOCATION_ACCURACY_METERS,
  MAX_GALLERY_ITEMS,
  MAX_SEARCH_INTEREST_IDS,
  MAX_VISIBILITY_AGE,
  MIN_DISTANCE_FEET,
  MIN_DISTANCE_METERS,
  MIN_DISTANCE_METERS_UI,
  MIN_VISIBILITY_AGE,
  SCHEMA_VERSION,
  canAddSearchInterest,
  canonicalDistancesEqual,
  canonicalFromDisplayDistance,
  compareCandidatesByDistanceThenUid,
  createDefaultSearchPreferences,
  createDefaultSearchPreferencesByMode,
  dedupeInterestIds,
  evaluateLocationAvailability,
  feetToMeters,
  hasCanonicalDistanceChanged,
  interestsMatchOr,
  isAccuracyValid,
  isAgeWithinInclusiveRange,
  isCanonicalDistanceInRange,
  isLocationFresh,
  isVisibilityAgeInBounds,
  isWithinMaxDistance,
  keepOfficialSearchInterestIds,
  metersToFeet,
  presentDistanceFromCanonical,
  resetPreferencesForMode,
  resolveCanonicalAfterDisplayClose,
  selectPreferencesForMode,
  snapFeetForUi,
  snapMetersForUi,
  sortCandidatesByDistanceThenUid,
  stateFromForegroundPermission,
  updatePreferencesForMode,
  validateAgeRange,
  validateInterestIds,
  validateSearchPreferences,
  withDedupedInterestIds,
  prepareSearchPreferencesForPersist,
  sanitizeSearchInterestIds,
} from '../index';

describe('visibility constants', () => {
  it('freezes contract and schema versions', () => {
    assert.equal(CONTRACT_VERSION, 1);
    assert.equal(SCHEMA_VERSION, 2);
    assert.equal(LOCATION_TTL_MS, 3_600_000);
    assert.equal(MAX_LOCATION_ACCURACY_METERS, 100);
    assert.equal(MIN_VISIBILITY_AGE, 18);
    assert.equal(MAX_VISIBILITY_AGE, 99);
    assert.equal(FEET_PER_METER, 3.28084);
    assert.equal(MIN_DISTANCE_METERS, 5);
    assert.equal(MAX_DISTANCE_METERS, 200 / FEET_PER_METER);
    assert.equal(DEFAULT_US_DISTANCE_FEET, 200);
    assert.equal(DEFAULT_METRIC_DISTANCE_METERS, 60);
    assert.equal(CANONICAL_DISTANCE_EPSILON_METERS, 0.01);
    assert.equal(MAX_SEARCH_INTEREST_IDS, 12);
    assert.equal(MAX_GALLERY_ITEMS, 12);
  });
});

describe('age validation', () => {
  it('accepts inclusive 18 and 99', () => {
    assert.equal(isVisibilityAgeInBounds(18), true);
    assert.equal(isVisibilityAgeInBounds(99), true);
    assert.equal(validateAgeRange(18, 99).ok, true);
  });

  it('rejects ages outside 18–99', () => {
    assert.equal(isVisibilityAgeInBounds(17), false);
    assert.equal(isVisibilityAgeInBounds(100), false);
    assert.equal(validateAgeRange(17, 40).ok, false);
    assert.equal(validateAgeRange(18, 100).ok, false);
  });

  it('rejects inverted ranges', () => {
    const result = validateAgeRange(40, 25);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.reasons.includes('age-range-inverted'));
    }
  });

  it('applies inclusive age membership', () => {
    assert.equal(isAgeWithinInclusiveRange(25, 25, 40), true);
    assert.equal(isAgeWithinInclusiveRange(40, 25, 40), true);
    assert.equal(isAgeWithinInclusiveRange(24, 25, 40), false);
  });
});

describe('distance units and ranges', () => {
  it('accepts canonical bounds 5 and 60.96', () => {
    assert.equal(isCanonicalDistanceInRange(5), true);
    assert.equal(isCanonicalDistanceInRange(MAX_DISTANCE_METERS), true);
    assert.equal(isCanonicalDistanceInRange(4.999), false);
    assert.equal(isCanonicalDistanceInRange(MAX_DISTANCE_METERS + 0.01), false);
  });

  it('maps US 20–200 ft with step 5', () => {
    assert.equal(snapFeetForUi(22), 20);
    assert.equal(snapFeetForUi(23), 25);
    assert.equal(snapFeetForUi(198), 200);
    assert.equal(snapFeetForUi(10), MIN_DISTANCE_FEET);
    assert.equal(snapFeetForUi(250), MAX_DISTANCE_FEET);
    assert.equal(DISTANCE_STEP_FEET, 5);
  });

  it('maps metric 5–60 m with step 5', () => {
    assert.equal(snapMetersForUi(7), 5);
    assert.equal(snapMetersForUi(8), 10);
    assert.equal(snapMetersForUi(58), 60);
    assert.equal(snapMetersForUi(1), MIN_DISTANCE_METERS_UI);
    assert.equal(snapMetersForUi(100), MAX_DISTANCE_METERS_UI);
    assert.equal(DISTANCE_STEP_METERS, 5);
  });

  it('round-trips feet ↔ meters with FEET_PER_METER', () => {
    const feet = 200;
    const meters = feetToMeters(feet);
    assert.equal(meters, DEFAULT_US_DISTANCE_METERS);
    assert.ok(
      Math.abs(metersToFeet(meters) - feet) < 1e-9,
    );
  });

  it('converts display to canonical and presents back', () => {
    const canonicalUs = canonicalFromDisplayDistance(200, 'ft');
    assert.ok(canonicalDistancesEqual(canonicalUs, DEFAULT_US_DISTANCE_METERS));
    assert.equal(presentDistanceFromCanonical(canonicalUs, 'ft'), 200);

    const canonicalMetric = canonicalFromDisplayDistance(60, 'm');
    assert.ok(canonicalDistancesEqual(canonicalMetric, 60));
    assert.equal(presentDistanceFromCanonical(canonicalMetric, 'm'), 60);
  });

  it('uses epsilon so open/close without gesture keeps canonical', () => {
    const previous = DEFAULT_US_DISTANCE_METERS;
    const display = presentDistanceFromCanonical(previous, 'ft');
    const closed = resolveCanonicalAfterDisplayClose(previous, display, 'ft');
    assert.equal(closed, previous);
    assert.equal(hasCanonicalDistanceChanged(previous, closed), false);

    // Tiny float drift still within epsilon.
    assert.equal(
      canonicalDistancesEqual(previous, previous + 0.005),
      true,
    );
    assert.equal(
      canonicalDistancesEqual(previous, previous + 0.02),
      false,
    );
  });
});

describe('preferences independence', () => {
  it('creates independent Personal and Professional defaults', () => {
    const byMode = createDefaultSearchPreferencesByMode('ft', 1000);
    assert.deepEqual(byMode.personal, byMode.professional);
    assert.equal(byMode.personal.maxDistanceMeters, DEFAULT_US_DISTANCE_METERS);
    assert.notEqual(byMode.personal, byMode.professional);

    const metric = createDefaultSearchPreferencesByMode('m', 0);
    assert.equal(metric.personal.maxDistanceMeters, DEFAULT_METRIC_DISTANCE_METERS);
  });

  it('updating Personal does not change Professional', () => {
    const byMode = createDefaultSearchPreferencesByMode('m', 0);
    const professionalBefore = { ...byMode.professional };
    const nextPersonal = {
      ...byMode.personal,
      ageMin: 25,
      ageMax: 40,
      maxDistanceMeters: 5,
      interestIds: ['sports_outdoors_soccer'],
      updatedAt: 42,
    };
    const updated = updatePreferencesForMode(byMode, 'personal', nextPersonal);
    assert.deepEqual(updated.professional, professionalBefore);
    assert.deepEqual(updated.personal, nextPersonal);
    assert.deepEqual(
      selectPreferencesForMode(updated, 'professional'),
      professionalBefore,
    );
  });

  it('reset affects only the selected mode', () => {
    let byMode = createDefaultSearchPreferencesByMode('ft', 0);
    byMode = updatePreferencesForMode(byMode, 'professional', {
      ...byMode.professional,
      ageMin: 30,
      ageMax: 50,
      updatedAt: 9,
    });
    const reset = resetPreferencesForMode(byMode, 'personal', 'm', 11);
    assert.equal(reset.personal.maxDistanceMeters, DEFAULT_METRIC_DISTANCE_METERS);
    assert.equal(reset.professional.ageMin, 30);
  });

  it('validates preferences shape', () => {
    const prefs = createDefaultSearchPreferencesByMode('ft', 0).personal;
    assert.equal(validateSearchPreferences(prefs).ok, true);
    assert.equal(
      validateSearchPreferences({
        ...prefs,
        maxDistanceMeters: 4,
      }).ok,
      false,
    );
  });
});

describe('interests', () => {
  it('dedupes preserving order', () => {
    assert.deepEqual(dedupeInterestIds(['a', 'b', 'a', 'c', 'b']), [
      'a',
      'b',
      'c',
    ]);
    const prefs = withDedupedInterestIds({
      ageMin: 18,
      ageMax: 99,
      maxDistanceMeters: 60,
      interestIds: ['x', 'y', 'x'],
      updatedAt: 0,
    });
    assert.deepEqual(prefs.interestIds, ['x', 'y']);
  });

  it('empty selection matches anyone; non-empty requires OR', () => {
    assert.equal(interestsMatchOr([], ['a']), true);
    assert.equal(interestsMatchOr(['a'], ['b', 'a']), true);
    assert.equal(interestsMatchOr(['a'], ['b', 'c']), false);
  });

  it('accepts 0 and 12 official IDs and rejects a 13th', () => {
    const knownIds = new Set(
      Array.from({ length: 14 }, (_, i) => `official_${i + 1}`),
    );
    const twelve = Array.from({ length: 12 }, (_, i) => `official_${i + 1}`);
    const thirteen = [...twelve, 'official_13'];
    const base = createDefaultSearchPreferences('m', 1);

    assert.equal(validateInterestIds([], knownIds).ok, true);
    assert.equal(validateInterestIds(twelve, knownIds).ok, true);
    const over = validateInterestIds(thirteen, knownIds);
    assert.equal(over.ok, false);
    if (!over.ok) {
      assert.ok(over.reasons.includes(INTEREST_IDS_OVER_MAX_REASON));
    }

    const persist0 = prepareSearchPreferencesForPersist(
      { ...base, interestIds: [] },
      knownIds,
    );
    assert.equal(persist0.ok, true);
    if (persist0.ok) assert.deepEqual(persist0.prefs.interestIds, []);

    const persist12 = prepareSearchPreferencesForPersist(
      { ...base, interestIds: twelve },
      knownIds,
    );
    assert.equal(persist12.ok, true);
    if (persist12.ok) assert.deepEqual(persist12.prefs.interestIds, twelve);

    const persist13 = prepareSearchPreferencesForPersist(
      { ...base, interestIds: thirteen },
      knownIds,
    );
    assert.equal(persist13.ok, false);
    if (!persist13.ok) {
      assert.ok(persist13.reasons.includes(INTEREST_IDS_OVER_MAX_REASON));
    }

    assert.equal(canAddSearchInterest([], 'official_1', knownIds), true);
    assert.equal(canAddSearchInterest(twelve, 'official_13', knownIds), false);
    assert.equal(canAddSearchInterest(twelve, 'official_1', knownIds), true);
    assert.deepEqual(
      keepOfficialSearchInterestIds(
        [...twelve, 'custom_sports_outdoors_x_1', 'unknown'],
        knownIds,
      ),
      twelve,
    );
    assert.deepEqual(
      sanitizeSearchInterestIds(thirteen, knownIds),
      twelve,
    );
  });
});

describe('freshness and accuracy', () => {
  it('treats confirmedAt == now and exactly 60 minutes as fresh', () => {
    const confirmedAt = 1_000_000;
    assert.equal(isLocationFresh(confirmedAt, confirmedAt), true);
    assert.equal(
      isLocationFresh(confirmedAt, confirmedAt + LOCATION_TTL_MS),
      true,
    );
    assert.equal(
      isLocationFresh(confirmedAt, confirmedAt + LOCATION_TTL_MS + 1),
      false,
    );
  });

  it('rejects confirmedAt in the future as not fresh', () => {
    const nowMs = 1_000_000;
    assert.equal(isLocationFresh(nowMs + 1, nowMs), false);
    assert.equal(isLocationFresh(nowMs + LOCATION_TTL_MS, nowMs), false);
  });

  it('accepts accuracy 0 and 100; rejects >100', () => {
    assert.equal(isAccuracyValid(0), true);
    assert.equal(isAccuracyValid(100), true);
    assert.equal(isAccuracyValid(100.1), false);
    assert.equal(isAccuracyValid(-1), false);
  });

  it('evaluates availability states', () => {
    assert.equal(evaluateLocationAvailability({ confirmedAt: null, nowMs: 1 }).status, 'missing');
    assert.equal(
      evaluateLocationAvailability({
        confirmedAt: 10,
        accuracyMeters: 101,
        nowMs: 10,
      }).status,
      'invalid',
    );
    assert.equal(
      evaluateLocationAvailability({
        confirmedAt: 10,
        accuracyMeters: 50,
        nowMs: 10 + LOCATION_TTL_MS + 1,
      }).status,
      'stale',
    );
    assert.equal(
      evaluateLocationAvailability({
        confirmedAt: 10,
        accuracyMeters: 50,
        nowMs: 10,
      }).status,
      'fresh',
    );
  });
});

describe('distance filter and local sort', () => {
  it('uses inclusive max distance', () => {
    assert.equal(isWithinMaxDistance(60.96, 60.96), true);
    assert.equal(isWithinMaxDistance(61, 60.96), false);
  });

  it('sorts by distance then uid', () => {
    const sorted = sortCandidatesByDistanceThenUid([
      { uid: 'b', distanceMeters: 10 },
      { uid: 'a', distanceMeters: 10 },
      { uid: 'c', distanceMeters: 5 },
    ]);
    assert.deepEqual(
      sorted.map((c) => c.uid),
      ['c', 'a', 'b'],
    );
    assert.equal(
      compareCandidatesByDistanceThenUid(
        { uid: 'a', distanceMeters: 1 },
        { uid: 'b', distanceMeters: 1 },
      ),
      -1,
    );
  });
});

describe('visibility states', () => {
  it('maps foreground permission to discriminated states', () => {
    assert.equal(stateFromForegroundPermission('undetermined').kind, 'permissionNotDetermined');
    assert.equal(stateFromForegroundPermission('denied').kind, 'permissionDenied');
    assert.equal(stateFromForegroundPermission('restricted').kind, 'permissionRestricted');
    assert.equal(stateFromForegroundPermission('granted').kind, 'inactive');
  });
});

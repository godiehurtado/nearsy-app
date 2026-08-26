import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MAX_SEARCH_INTEREST_IDS } from '../constants';
import {
  applyModeFieldPatch,
  reducePrefsPatches,
  shouldApplyRemotePreferences,
} from '../preferenceDraft';
import {
  countSharedInterestIds,
  matchesNearbyLocalQuery,
  planNearbyInterestIconLayout,
  resolveInterestChip,
} from '../interestDisplay';
import { createDefaultSearchPreferencesByMode } from '../preferences';
import { prepareSearchPreferencesForPersist } from '../preferences';
import { flattenCatalogInterestItems } from '../../interests/onboardingInterestCatalog';

describe('preference draft stability', () => {
  it('keeps soccer after sequential age and distance patches', () => {
    const initial = createDefaultSearchPreferencesByMode('m', 0);
    const next = reducePrefsPatches(initial, 'personal', [
      { kind: 'interests', interestIds: ['sports_soccer'] },
      { kind: 'age', ageMin: 25, ageMax: 45 },
      { kind: 'distance', maxDistanceMeters: 30 },
    ]);
    assert.deepEqual(next.personal.interestIds, ['sports_soccer']);
    assert.equal(next.personal.ageMin, 25);
    assert.equal(next.personal.ageMax, 45);
    assert.equal(next.professional.interestIds.length, 0);
  });

  it('field patches never wipe sibling fields', () => {
    const base = createDefaultSearchPreferencesByMode('ft', 1);
    const withInterest = applyModeFieldPatch(base, 'professional', {
      kind: 'interests',
      interestIds: ['business_networking', 'technology_software'],
    });
    const withAge = applyModeFieldPatch(withInterest, 'professional', {
      kind: 'age',
      ageMin: 30,
      ageMax: 50,
    });
    assert.deepEqual(withAge.professional.interestIds, [
      'business_networking',
      'technology_software',
    ]);
    assert.equal(withAge.personal.interestIds.length, 0);
  });

  it('blocks remote overwrite while writes are in flight', () => {
    assert.equal(
      shouldApplyRemotePreferences({
        inFlightWrites: 1,
        localEpoch: 2,
        appliedEpoch: 1,
      }),
      false,
    );
    assert.equal(
      shouldApplyRemotePreferences({
        inFlightWrites: 0,
        localEpoch: 2,
        appliedEpoch: 1,
      }),
      false,
    );
    assert.equal(
      shouldApplyRemotePreferences({
        inFlightWrites: 0,
        localEpoch: 2,
        appliedEpoch: 2,
      }),
      true,
    );
  });

  it('persisted sequential draft retains all three modifications', () => {
    const known = new Set(
      flattenCatalogInterestItems().map((item) => item.id),
    );
    const draft = reducePrefsPatches(
      createDefaultSearchPreferencesByMode('m', 0),
      'personal',
      [
        { kind: 'interests', interestIds: ['sports_soccer'] },
        { kind: 'age', ageMin: 22, ageMax: 40 },
        { kind: 'distance', maxDistanceMeters: 45 },
      ],
    );
    const prepared = prepareSearchPreferencesForPersist(draft.personal, known);
    assert.equal(prepared.ok, true);
    if (prepared.ok) {
      assert.deepEqual(prepared.prefs.interestIds, ['sports_soccer']);
      assert.equal(prepared.prefs.ageMin, 22);
      assert.equal(prepared.prefs.ageMax, 40);
      assert.equal(prepared.prefs.maxDistanceMeters, 45);
    }
    assert.equal(MAX_SEARCH_INTEREST_IDS, 12);
  });
});

describe('nearby interest display', () => {
  it('resolves CRJ ids to human labels, never raw ids', () => {
    const chip = resolveInterestChip(
      'business_networking',
      (_key, fallback) => fallback,
    );
    assert.ok(chip);
    assert.equal(chip!.label, 'Networking');
    assert.notEqual(chip!.label, 'business_networking');
  });

  it('plans Nearby icon layout with +N overflow without hard-capping at 3', () => {
    const allFit = planNearbyInterestIconLayout(4, 200, {
      iconSize: 28,
      gap: 6,
      plusWidth: 28,
    });
    assert.equal(allFit.visibleCount, 4);
    assert.equal(allFit.overflowCount, 0);

    const tight = planNearbyInterestIconLayout(8, 120, {
      iconSize: 28,
      gap: 6,
      plusWidth: 28,
    });
    assert.ok(tight.visibleCount >= 1);
    assert.ok(tight.visibleCount < 8);
    assert.equal(tight.overflowCount, 8 - tight.visibleCount);
    assert.ok(tight.visibleCount + tight.overflowCount === 8);
  });

  it('filters locally by name/occupation/interest labels', () => {
    assert.equal(
      matchesNearbyLocalQuery('alex', {
        displayName: 'Alex Rivera',
        occupation: 'Designer',
        interestLabels: ['Soccer'],
      }),
      true,
    );
    assert.equal(
      matchesNearbyLocalQuery('soccer', {
        displayName: 'Alex Rivera',
        occupation: 'Designer',
        interestLabels: ['Soccer'],
      }),
      true,
    );
    assert.equal(
      matchesNearbyLocalQuery('finance', {
        displayName: 'Alex Rivera',
        occupation: 'Designer',
        interestLabels: ['Soccer'],
      }),
      false,
    );
  });

  it('counts shared interests honestly instead of inventing a match %', () => {
    assert.equal(
      countSharedInterestIds(
        ['sports_soccer', 'business_networking'],
        ['sports_soccer', 'technology_software'],
      ),
      1,
    );
  });
});

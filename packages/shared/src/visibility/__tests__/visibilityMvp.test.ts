import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createFakeVisibilityDiscoveryClient,
  createDefaultSearchPreferencesByMode,
  parseSearchPreferencesFromUserDoc,
  presentDistanceFromCanonical,
  resolveDistanceDisplayUnit,
  selectPreferencesForMode,
  updatePreferencesForMode,
  buildActivateVisibilityRequest,
  buildLocationPayload,
  buildDiscoverNearbyRequest,
  parseDiscoverNearbyResponse,
  VisibilityDiscoveryClientError,
} from '../index';

describe('visibility orchestration helpers (pure)', () => {
  it('resolves US locale to feet and others to meters', () => {
    assert.equal(resolveDistanceDisplayUnit('en-US'), 'ft');
    assert.equal(resolveDistanceDisplayUnit('es-CO'), 'm');
  });

  it('loads independent personal/professional prefs from user doc', () => {
    const byMode = parseSearchPreferencesFromUserDoc(
      {
        searchPreferences: {
          personal: {
            ageMin: 21,
            ageMax: 40,
            maxDistanceMeters: 30,
            interestIds: ['a'],
            updatedAt: 1,
          },
          professional: {
            ageMin: 25,
            ageMax: 55,
            maxDistanceMeters: 60,
            interestIds: [],
            updatedAt: 2,
          },
        },
      },
      'm',
    );
    assert.equal(byMode.personal.ageMin, 21);
    assert.equal(byMode.professional.ageMin, 25);
    assert.notDeepEqual(byMode.personal, byMode.professional);
  });

  it('falls back to defaults when prefs missing', () => {
    const byMode = parseSearchPreferencesFromUserDoc(null, 'ft');
    assert.equal(
      presentDistanceFromCanonical(byMode.personal.maxDistanceMeters, 'ft'),
      200,
    );
  });

  it('updating personal prefs does not mutate professional', () => {
    const base = createDefaultSearchPreferencesByMode('m', 0);
    const next = updatePreferencesForMode(base, 'personal', {
      ...base.personal,
      ageMin: 30,
    });
    assert.equal(selectPreferencesForMode(next, 'personal').ageMin, 30);
    assert.equal(selectPreferencesForMode(next, 'professional').ageMin, 18);
  });
});

describe('visibility discovery client integration (fake)', () => {
  it('activate then discoverNearby returns results without status field', async () => {
    const fake = createFakeVisibilityDiscoveryClient();
    const location = buildLocationPayload({
      latitude: 1,
      longitude: 2,
      accuracyMeters: 10,
      observedAt: 100,
    });
    const activated = await fake.activateVisibility(
      buildActivateVisibilityRequest(location),
    );
    assert.equal(activated.visibility, true);

    const discovered = await fake.discoverNearby(
      buildDiscoverNearbyRequest({ limit: 50 }),
    );
    assert.equal(discovered.nextCursor, null);
    assert.ok(discovered.results.length >= 1);
    const profile = discovered.results[0]!.profile as Record<string, unknown>;
    assert.equal(Object.prototype.hasOwnProperty.call(profile, 'status'), false);
    assert.ok('mode' in profile);
    assert.ok('occupation' in profile);
  });

  it('rejects discover responses that include status', () => {
    assert.throws(
      () =>
        parseDiscoverNearbyResponse({
          contractVersion: 1,
          results: [
            {
              uid: 'x',
              distanceMeters: 1,
              profile: {
                mode: 'personal',
                displayName: 'A',
                profileImage: null,
                occupation: '',
                interestIds: [],
                ageYears: 20,
                status: 'nope',
              },
            },
          ],
          nextCursor: null,
          serverTime: 1,
        }),
      VisibilityDiscoveryClientError,
    );
  });
});

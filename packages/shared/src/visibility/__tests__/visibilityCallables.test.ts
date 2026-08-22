import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CONTRACT_VERSION,
  MAX_DISCOVERY_LIMIT,
  MAX_GALLERY_ITEMS,
  VISIBILITY_CALLABLE_NAMES,
  buildActivateVisibilityRequest,
  buildDeactivateVisibilityRequest,
  buildDiscoverNearbyRequest,
  buildGetDiscoveryProfileRequest,
  buildLocationPayload,
  buildPublishLocationRequest,
  createFakeVisibilityDiscoveryClient,
  createVisibilityDiscoveryCallableClient,
  normalizeVisibilityCallableError,
  parseActivateVisibilityResponse,
  parseDeactivateVisibilityResponse,
  parseDiscoverNearbyResponse,
  parseGetDiscoveryProfileResponse,
  parsePublishLocationResponse,
  serializeVisibilityRequest,
  VisibilityDiscoveryClientError,
} from '../index';

const SAMPLE_LOCATION = buildLocationPayload({
  latitude: 40.7,
  longitude: -74.0,
  accuracyMeters: 12,
  observedAt: 1_700_000_000_000,
});

const SAMPLE_PROFILE = {
  mode: 'personal' as const,
  displayName: 'Alex R.',
  profileImage: null as string | null,
  occupation: 'Designer',
  interestIds: ['sports_outdoors_soccer'],
  ageYears: 28,
};

const SAMPLE_DETAIL = {
  ...SAMPLE_PROFILE,
  company: 'Nearsy',
  bio: 'Hello',
};

describe('visibility callable request serialization', () => {
  it('serializes activate and publish location requests', () => {
    const activate = serializeVisibilityRequest(
      buildActivateVisibilityRequest(SAMPLE_LOCATION),
    );
    assert.deepEqual(activate, {
      contractVersion: 1,
      location: SAMPLE_LOCATION,
    });
    assert.equal(
      Object.prototype.hasOwnProperty.call(activate, 'geohash'),
      false,
    );
    assert.equal(
      Object.prototype.hasOwnProperty.call(activate, 'confirmedAt'),
      false,
    );

    const publish = serializeVisibilityRequest(
      buildPublishLocationRequest(SAMPLE_LOCATION),
    );
    assert.deepEqual(publish.location, SAMPLE_LOCATION);
  });

  it('serializes deactivate, discover, and detail requests', () => {
    assert.deepEqual(
      serializeVisibilityRequest(buildDeactivateVisibilityRequest()),
      { contractVersion: 1 },
    );

    const discover = serializeVisibilityRequest(
      buildDiscoverNearbyRequest({ limit: 50, cursor: null }),
    );
    assert.equal(discover.contractVersion, 1);
    assert.equal(discover.limit, 50);
    assert.equal(discover.cursor, null);

    const omitted = serializeVisibilityRequest(buildDiscoverNearbyRequest());
    assert.equal(Object.prototype.hasOwnProperty.call(omitted, 'cursor'), false);

    assert.deepEqual(
      serializeVisibilityRequest(buildGetDiscoveryProfileRequest('uid-abc')),
      { contractVersion: 1, candidateUid: 'uid-abc' },
    );
  });
});

describe('visibility callable response parsing', () => {
  it('parses activate / publish / deactivate success responses', () => {
    const activate = parseActivateVisibilityResponse({
      contractVersion: 1,
      visibility: true,
      observedAt: 10,
      confirmedAt: 20,
      updatedAt: 20,
      accuracyMeters: 8,
      serverTime: 21,
    });
    assert.equal(activate.visibility, true);
    assert.equal(activate.confirmedAt, 20);

    const publish = parsePublishLocationResponse({
      contractVersion: 1,
      visibility: true,
      observedAt: 10,
      confirmedAt: 30,
      updatedAt: 30,
      accuracyMeters: 8,
      serverTime: 31,
    });
    assert.equal(publish.updatedAt, 30);

    const deactivate = parseDeactivateVisibilityResponse({
      contractVersion: 1,
      visibility: false,
      serverTime: 40,
    });
    assert.equal(deactivate.visibility, false);
  });

  it('parses discover and detail responses', () => {
    const discover = parseDiscoverNearbyResponse({
      contractVersion: 1,
      results: [
        { uid: 'a', distanceMeters: 5, profile: SAMPLE_PROFILE },
        { uid: 'b', distanceMeters: 9, profile: SAMPLE_PROFILE },
      ],
      nextCursor: null,
      serverTime: 50,
    });
    assert.equal(discover.results.length, 2);
    assert.equal(discover.nextCursor, null);

    const detail = parseGetDiscoveryProfileResponse({
      contractVersion: 1,
      uid: 'a',
      distanceMeters: 5,
      profile: SAMPLE_DETAIL,
      gallery: [{ url: 'https://cdn.example/p.jpg' }],
      serverTime: 50,
    });
    assert.equal(detail.gallery.length, 1);
    assert.equal(detail.profile.company, 'Nearsy');
    assert.equal(detail.profile.bio, 'Hello');
  });

  it('rejects profile status and gallery path', () => {
    assert.throws(
      () =>
        parseDiscoverNearbyResponse({
          contractVersion: 1,
          results: [
            {
              uid: 'a',
              distanceMeters: 1,
              profile: { ...SAMPLE_PROFILE, status: 'hi' },
            },
          ],
          nextCursor: null,
          serverTime: 1,
        }),
      VisibilityDiscoveryClientError,
    );
    assert.throws(
      () =>
        parseGetDiscoveryProfileResponse({
          contractVersion: 1,
          uid: 'a',
          distanceMeters: 1,
          profile: SAMPLE_DETAIL,
          gallery: [{ url: 'https://cdn.example/p.jpg', path: 'secret' }],
          serverTime: 1,
        }),
      VisibilityDiscoveryClientError,
    );
  });

  it('rejects incompatible contractVersion and invalid numbers', () => {
    assert.throws(
      () =>
        parseActivateVisibilityResponse({
          contractVersion: 99,
          visibility: true,
          observedAt: 1,
          confirmedAt: 1,
          updatedAt: 1,
          accuracyMeters: 1,
          serverTime: 1,
        }),
      VisibilityDiscoveryClientError,
    );
    assert.throws(
      () =>
        parseDiscoverNearbyResponse({
          contractVersion: 1,
          results: [
            {
              uid: 'a',
              distanceMeters: Number.NaN,
              profile: SAMPLE_PROFILE,
            },
          ],
          nextCursor: null,
          serverTime: 1,
        }),
      VisibilityDiscoveryClientError,
    );
  });

  it('rejects backend profile aliases (activeProfile/photoUrl/age)', () => {
    assert.throws(
      () =>
        parseDiscoverNearbyResponse({
          contractVersion: 1,
          results: [
            {
              uid: 'a',
              distanceMeters: 1,
              profile: {
                activeProfile: 'personal',
                displayName: 'Alex',
                age: 28,
                interestIds: [],
                photoUrl: null,
              },
            },
          ],
          nextCursor: null,
          serverTime: 1,
        }),
      VisibilityDiscoveryClientError,
    );
  });

  it('rejects coordinates, geohash, and PII on public DTOs', () => {
    assert.throws(
      () =>
        parseActivateVisibilityResponse({
          contractVersion: 1,
          visibility: true,
          observedAt: 1,
          confirmedAt: 1,
          updatedAt: 1,
          accuracyMeters: 1,
          serverTime: 1,
          geohash: 'dr5reg',
        }),
      (err: unknown) =>
        err instanceof VisibilityDiscoveryClientError &&
        err.reason.kind === 'known' &&
        err.reason.value === 'invalid-response',
    );

    assert.throws(
      () =>
        parseDiscoverNearbyResponse({
          contractVersion: 1,
          results: [
            {
              uid: 'a',
              distanceMeters: 1,
              profile: { ...SAMPLE_PROFILE, email: 'a@b.c' },
            },
          ],
          nextCursor: null,
          serverTime: 1,
        }),
      VisibilityDiscoveryClientError,
    );

    assert.throws(
      () =>
        parseGetDiscoveryProfileResponse({
          contractVersion: 1,
          uid: 'a',
          distanceMeters: 1,
          profile: SAMPLE_DETAIL,
          gallery: [],
          serverTime: 1,
          latitude: 1,
        }),
      VisibilityDiscoveryClientError,
    );
  });

  it('rejects more than 50 results, duplicate UIDs, and non-null nextCursor', () => {
    const tooMany = Array.from({ length: MAX_DISCOVERY_LIMIT + 1 }, (_, i) => ({
      uid: `u${i}`,
      distanceMeters: i,
      profile: SAMPLE_PROFILE,
    }));
    assert.throws(
      () =>
        parseDiscoverNearbyResponse({
          contractVersion: 1,
          results: tooMany,
          nextCursor: null,
          serverTime: 1,
        }),
      VisibilityDiscoveryClientError,
    );

    assert.throws(
      () =>
        parseDiscoverNearbyResponse({
          contractVersion: 1,
          results: [
            { uid: 'dup', distanceMeters: 1, profile: SAMPLE_PROFILE },
            { uid: 'dup', distanceMeters: 2, profile: SAMPLE_PROFILE },
          ],
          nextCursor: null,
          serverTime: 1,
        }),
      VisibilityDiscoveryClientError,
    );

    assert.throws(
      () =>
        parseDiscoverNearbyResponse({
          contractVersion: 1,
          results: [],
          nextCursor: 'opaque',
          serverTime: 1,
        }),
      VisibilityDiscoveryClientError,
    );
  });

  it('rejects gallery longer than 12', () => {
    const gallery = Array.from({ length: MAX_GALLERY_ITEMS + 1 }, (_, i) => ({
      url: `https://cdn.example/${i}.jpg`,
    }));
    assert.throws(
      () =>
        parseGetDiscoveryProfileResponse({
          contractVersion: 1,
          uid: 'a',
          distanceMeters: 1,
          profile: SAMPLE_DETAIL,
          gallery,
          serverTime: 1,
        }),
      VisibilityDiscoveryClientError,
    );
  });
});

describe('visibility callable error normalization', () => {
  it('normalizes each relevant Firebase code', () => {
    const codes = [
      'unauthenticated',
      'permission-denied',
      'invalid-argument',
      'failed-precondition',
      'not-found',
      'resource-exhausted',
      'unavailable',
      'internal',
    ] as const;
    for (const code of codes) {
      const err = normalizeVisibilityCallableError({
        code: `functions/${code}`,
        details: { reason: 'visibility-inactive', retryable: false },
      });
      assert.equal(err.code, code);
      assert.equal(err.reason.kind, 'known');
    }
  });

  it('treats invalid-location as always retryable, even if details say false', () => {
    const err = normalizeVisibilityCallableError({
      code: 'functions/failed-precondition',
      details: { reason: 'invalid-location', retryable: false },
    });
    assert.equal(err.retryable, true);
    assert.equal(err.detailsRetryableReceived, false);
    assert.equal(err.reason.kind, 'known');
    if (err.reason.kind === 'known') {
      assert.equal(err.reason.value, 'invalid-location');
    }
  });

  it('preserves unknown reasons without treating them as success', () => {
    const err = normalizeVisibilityCallableError({
      code: 'functions/internal',
      details: { reason: 'totally-new-reason', field: 'location' },
    });
    assert.equal(err.reason.kind, 'unknown');
    if (err.reason.kind === 'unknown') {
      assert.equal(err.reason.value, 'totally-new-reason');
    }
    assert.equal(err.field, 'location');
    assert.equal(err.code, 'internal');
  });
});

describe('visibility callable adapter and fake', () => {
  it('invokes the correct callable names', async () => {
    const invoked: string[] = [];
    const client = createVisibilityDiscoveryCallableClient({
      functionsRegion: 'us-central1',
      invoke: async (name, data) => {
        invoked.push(name);
        if (name === 'activateVisibility' || name === 'publishLocation') {
          return {
            contractVersion: CONTRACT_VERSION,
            visibility: true,
            observedAt: (data.location as { observedAt: number }).observedAt,
            confirmedAt: 100,
            updatedAt: 100,
            accuracyMeters: 5,
            serverTime: 101,
          };
        }
        if (name === 'deactivateVisibility') {
          return {
            contractVersion: CONTRACT_VERSION,
            visibility: false,
            serverTime: 102,
          };
        }
        if (name === 'discoverNearby') {
          return {
            contractVersion: CONTRACT_VERSION,
            results: [],
            nextCursor: null,
            serverTime: 103,
          };
        }
        return {
          contractVersion: CONTRACT_VERSION,
          uid: 'x',
          distanceMeters: 1,
          profile: SAMPLE_DETAIL,
          gallery: [],
          serverTime: 104,
        };
      },
    });

    await client.activateVisibility(buildActivateVisibilityRequest(SAMPLE_LOCATION));
    await client.publishLocation(buildPublishLocationRequest(SAMPLE_LOCATION));
    await client.deactivateVisibility(buildDeactivateVisibilityRequest());
    await client.discoverNearby(buildDiscoverNearbyRequest());
    await client.getDiscoveryProfile(buildGetDiscoveryProfileRequest('x'));

    assert.deepEqual(invoked, [
      VISIBILITY_CALLABLE_NAMES.activateVisibility,
      VISIBILITY_CALLABLE_NAMES.publishLocation,
      VISIBILITY_CALLABLE_NAMES.deactivateVisibility,
      VISIBILITY_CALLABLE_NAMES.discoverNearby,
      VISIBILITY_CALLABLE_NAMES.getDiscoveryProfile,
    ]);
  });

  it('maps callable transport errors through the adapter', async () => {
    const client = createVisibilityDiscoveryCallableClient({
      invoke: async () => {
        throw {
          code: 'functions/failed-precondition',
          details: { reason: 'profile-incomplete', retryable: false },
        };
      },
    });
    await assert.rejects(
      () =>
        client.activateVisibility(buildActivateVisibilityRequest(SAMPLE_LOCATION)),
      (err: unknown) =>
        err instanceof VisibilityDiscoveryClientError &&
        err.code === 'failed-precondition' &&
        err.reason.kind === 'known' &&
        err.reason.value === 'profile-incomplete',
    );
  });

  it('fake client works without Firebase or network', async () => {
    const fake = createFakeVisibilityDiscoveryClient({}, { serverNow: 55 });
    const activated = await fake.activateVisibility(
      buildActivateVisibilityRequest(SAMPLE_LOCATION),
    );
    assert.equal(activated.confirmedAt, 55);
    assert.equal(activated.serverTime, 55);

    const discovered = await fake.discoverNearby(buildDiscoverNearbyRequest());
    assert.equal(discovered.nextCursor, null);

    assert.equal(fake.calls.length, 2);
    assert.equal(fake.calls[0]?.name, 'activateVisibility');
  });
});

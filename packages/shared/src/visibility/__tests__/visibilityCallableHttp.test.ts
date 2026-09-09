import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  VISIBILITY_CALLABLE_NAMES,
  createVisibilityDiscoveryCallableClient,
  invokeVisibilityCallableHttp,
  normalizeVisibilityCallableError,
  resolveVisibilityCallableEndpoint,
  VisibilityDiscoveryClientError,
  buildActivateVisibilityRequest,
  buildLocationPayload,
  buildDiscoverNearbyRequest,
  buildGetDiscoveryProfileRequest,
  buildDeactivateVisibilityRequest,
  buildPublishLocationRequest,
} from '../index';

const ID_TOKEN = 'test-js-id-token-value';
const APP_CHECK = 'test-app-check-token-value';

function mockFetch(handler: (url: string, init?: RequestInit) => Promise<Response>) {
  return async (url: RequestInfo | URL, init?: RequestInit) =>
    handler(String(url), init);
}

describe('visibility callable HTTP bridge', () => {
  it('builds development cloud URLs for all five callables', () => {
    for (const name of Object.values(VISIBILITY_CALLABLE_NAMES)) {
      const endpoint = resolveVisibilityCallableEndpoint({
        projectId: 'nearsy-dev',
        region: 'us-central1',
        environment: 'development',
        functionName: name,
      });
      assert.equal(endpoint.mode, 'cloud');
      assert.equal(
        endpoint.url,
        `https://us-central1-nearsy-dev.cloudfunctions.net/${name}`,
      );
      assert.equal(endpoint.functionName, name);
    }
  });

  it('rejects nearsy-pj under development and unknown names', () => {
    assert.throws(
      () =>
        resolveVisibilityCallableEndpoint({
          projectId: 'nearsy-pj',
          environment: 'development',
          functionName: 'activateVisibility',
        }),
      VisibilityDiscoveryClientError,
    );
    assert.throws(
      () =>
        resolveVisibilityCallableEndpoint({
          projectId: 'nearsy-dev',
          environment: 'development',
          functionName: 'notAVisibilityFn',
        }),
      VisibilityDiscoveryClientError,
    );
  });

  it('builds emulator URLs only when host/port are explicit', () => {
    const endpoint = resolveVisibilityCallableEndpoint({
      projectId: 'nearsy-dev',
      environment: 'development',
      functionName: 'discoverNearby',
      emulatorHost: '127.0.0.1',
      emulatorPort: 5001,
    });
    assert.equal(endpoint.mode, 'emulator');
    assert.equal(
      endpoint.url,
      'http://127.0.0.1:5001/nearsy-dev/us-central1/discoverNearby',
    );
  });

  it('sends callable body with Authorization and App Check headers', async () => {
    const seen: {
      url?: string;
      headers?: Record<string, string>;
      body?: string;
    } = {};
    const location = buildLocationPayload({
      latitude: 40.7,
      longitude: -74,
      accuracyMeters: 10,
      observedAt: 100,
    });
    const request = buildActivateVisibilityRequest({ location });

    const payload = await invokeVisibilityCallableHttp(
      {
        projectId: 'nearsy-dev',
        environment: 'development',
        functionName: VISIBILITY_CALLABLE_NAMES.activateVisibility,
        idToken: ID_TOKEN,
        appCheckToken: APP_CHECK,
        data: request as unknown as Record<string, unknown>,
      },
      {
        fetchImpl: mockFetch(async (url, init) => {
          seen.url = url;
          seen.headers = init?.headers as Record<string, string>;
          seen.body = String(init?.body ?? '');
          return {
            ok: true,
            status: 200,
            json: async () => ({
              result: {
                contractVersion: 1,
                visibility: true,
                observedAt: 100,
                confirmedAt: 100,
                updatedAt: 100,
                accuracyMeters: 10,
                serverTime: 100,
              },
            }),
          } as Response;
        }),
      },
    );

    assert.equal(
      seen.url,
      'https://us-central1-nearsy-dev.cloudfunctions.net/activateVisibility',
    );
    assert.equal(seen.headers?.Authorization, `Bearer ${ID_TOKEN}`);
    assert.equal(seen.headers?.['X-Firebase-AppCheck'], APP_CHECK);
    assert.equal(seen.headers?.['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(seen.body ?? '{}'), { data: request });
    assert.equal((payload as { visibility: boolean }).visibility, true);
  });

  it('rejects missing authenticated user token', async () => {
    await assert.rejects(
      () =>
        invokeVisibilityCallableHttp({
          projectId: 'nearsy-dev',
          environment: 'development',
          functionName: 'activateVisibility',
          idToken: '',
          appCheckToken: APP_CHECK,
          data: {},
        }),
      (err: unknown) =>
        typeof err === 'object' &&
        err !== null &&
        (err as { code?: string }).code === 'functions/unauthenticated',
    );
  });

  it('maps HTTP 401 to unauthenticated', async () => {
    await assert.rejects(
      () =>
        invokeVisibilityCallableHttp(
          {
            projectId: 'nearsy-dev',
            environment: 'development',
            functionName: 'discoverNearby',
            idToken: ID_TOKEN,
            appCheckToken: APP_CHECK,
            data: {},
          },
          {
            fetchImpl: mockFetch(async () =>
              ({
                ok: false,
                status: 401,
                json: async () => ({}),
              }) as Response,
            ),
          },
        ),
      (err: unknown) => {
        const normalized = normalizeVisibilityCallableError(err);
        return normalized.code === 'unauthenticated';
      },
    );
  });

  it('maps permission-denied status from callable error body', async () => {
    await assert.rejects(
      () =>
        invokeVisibilityCallableHttp(
          {
            projectId: 'nearsy-dev',
            environment: 'development',
            functionName: 'getDiscoveryProfile',
            idToken: ID_TOKEN,
            appCheckToken: APP_CHECK,
            data: { candidateUid: 'x' },
          },
          {
            fetchImpl: mockFetch(async () =>
              ({
                ok: false,
                status: 403,
                json: async () => ({
                  error: {
                    status: 'PERMISSION_DENIED',
                    message: 'denied',
                    details: { reason: 'candidate-blocked' },
                  },
                }),
              }) as Response,
            ),
          },
        ),
      (err: unknown) => {
        const normalized = normalizeVisibilityCallableError(err);
        return (
          normalized.code === 'permission-denied' &&
          normalized.reason.kind === 'known' &&
          normalized.reason.value === 'candidate-blocked'
        );
      },
    );
  });

  it('preserves error details including invalid-location retryable contract', async () => {
    await assert.rejects(
      () =>
        invokeVisibilityCallableHttp(
          {
            projectId: 'nearsy-dev',
            environment: 'development',
            functionName: 'activateVisibility',
            idToken: ID_TOKEN,
            appCheckToken: APP_CHECK,
            data: {},
          },
          {
            fetchImpl: mockFetch(async () =>
              ({
                ok: false,
                status: 400,
                json: async () => ({
                  error: {
                    status: 'FAILED_PRECONDITION',
                    message: 'bad location',
                    details: {
                      reason: 'invalid-location',
                      field: 'location',
                      retryable: false,
                    },
                  },
                }),
              }) as Response,
            ),
          },
        ),
      (err: unknown) => {
        const normalized = normalizeVisibilityCallableError(err);
        return (
          normalized.retryable === true &&
          normalized.detailsRetryableReceived === false &&
          normalized.field === 'location' &&
          normalized.reason.kind === 'known' &&
          normalized.reason.value === 'invalid-location'
        );
      },
    );
  });

  it('rejects invalid callable response shapes', async () => {
    await assert.rejects(
      () =>
        invokeVisibilityCallableHttp(
          {
            projectId: 'nearsy-dev',
            environment: 'development',
            functionName: 'deactivateVisibility',
            idToken: ID_TOKEN,
            appCheckToken: APP_CHECK,
            data: {},
          },
          {
            fetchImpl: mockFetch(async () =>
              ({
                ok: true,
                status: 200,
                json: async () => ({ data: { visibility: false } }),
              }) as Response,
            ),
          },
        ),
      (err: unknown) => {
        const normalized = normalizeVisibilityCallableError(err);
        return normalized.code === 'internal';
      },
    );
  });

  it('maps network failures to unavailable', async () => {
    await assert.rejects(
      () =>
        invokeVisibilityCallableHttp(
          {
            projectId: 'nearsy-dev',
            environment: 'development',
            functionName: 'publishLocation',
            idToken: ID_TOKEN,
            appCheckToken: APP_CHECK,
            data: {},
          },
          {
            fetchImpl: async () => {
              throw new Error('offline');
            },
          },
        ),
      (err: unknown) => {
        const normalized = normalizeVisibilityCallableError(err);
        return normalized.code === 'unavailable';
      },
    );
  });

  it('never embeds tokens in thrown error messages', async () => {
    await assert.rejects(
      () =>
        invokeVisibilityCallableHttp(
          {
            projectId: 'nearsy-dev',
            environment: 'development',
            functionName: 'activateVisibility',
            idToken: ID_TOKEN,
            appCheckToken: APP_CHECK,
            data: {},
          },
          {
            fetchImpl: mockFetch(async () =>
              ({
                ok: false,
                status: 500,
                json: async () => ({
                  error: {
                    status: 'INTERNAL',
                    message: `leak ${ID_TOKEN} ${APP_CHECK}`,
                  },
                }),
              }) as Response,
            ),
          },
        ),
      (err: unknown) => {
        const text = JSON.stringify(err);
        const normalized = normalizeVisibilityCallableError(err);
        return (
          !text.includes(ID_TOKEN) &&
          !text.includes(APP_CHECK) &&
          !normalized.message.includes(ID_TOKEN) &&
          !normalized.message.includes(APP_CHECK)
        );
      },
    );
  });

  it('adapter routes all five names through HTTP invoke with correct names', async () => {
    const calls: string[] = [];
    const client = createVisibilityDiscoveryCallableClient({
      functionsRegion: 'us-central1',
      invoke: async (name, data) => {
        calls.push(name);
        return invokeVisibilityCallableHttp(
          {
            projectId: 'nearsy-dev',
            environment: 'development',
            functionName: name,
            idToken: ID_TOKEN,
            appCheckToken: APP_CHECK,
            data,
          },
          {
            fetchImpl: mockFetch(async (url) => {
              assert.ok(url.includes(name));
              if (name === 'activateVisibility' || name === 'publishLocation') {
                return {
                  ok: true,
                  status: 200,
                  json: async () => ({
                    result: {
                      contractVersion: 1,
                      visibility: true,
                      observedAt: 1,
                      confirmedAt: 1,
                      updatedAt: 1,
                      accuracyMeters: 1,
                      serverTime: 1,
                    },
                  }),
                } as Response;
              }
              if (name === 'deactivateVisibility') {
                return {
                  ok: true,
                  status: 200,
                  json: async () => ({
                    result: {
                      contractVersion: 1,
                      visibility: false,
                      serverTime: 1,
                    },
                  }),
                } as Response;
              }
              if (name === 'discoverNearby') {
                return {
                  ok: true,
                  status: 200,
                  json: async () => ({
                    result: {
                      contractVersion: 1,
                      results: [],
                      nextCursor: null,
                      serverTime: 1,
                    },
                  }),
                } as Response;
              }
              return {
                ok: true,
                status: 200,
                json: async () => ({
                  result: {
                    contractVersion: 1,
                    uid: 'u1',
                    distanceMeters: 1,
                    profile: {
                      mode: 'personal',
                      displayName: 'A',
                      profileImage: null,
                      occupation: '',
                      interestIds: [],
                      ageYears: 30,
                      company: '',
                      bio: '',
                    },
                    gallery: [],
                    serverTime: 1,
                  },
                }),
              } as Response;
            }),
          },
        );
      },
    });

    const location = buildLocationPayload({
      latitude: 1,
      longitude: 2,
      accuracyMeters: 5,
      observedAt: 1,
    });
    await client.activateVisibility(
      buildActivateVisibilityRequest({ location }),
    );
    await client.publishLocation(buildPublishLocationRequest({ location }));
    await client.deactivateVisibility(buildDeactivateVisibilityRequest());
    await client.discoverNearby(buildDiscoverNearbyRequest());
    await client.getDiscoveryProfile(
      buildGetDiscoveryProfileRequest('u1'),
    );

    assert.deepEqual(calls, [
      'activateVisibility',
      'publishLocation',
      'deactivateVisibility',
      'discoverNearby',
      'getDiscoveryProfile',
    ]);
  });
});

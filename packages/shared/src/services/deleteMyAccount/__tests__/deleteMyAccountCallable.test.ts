import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DELETE_MY_ACCOUNT_MAX_AUTH_AGE_SECONDS,
  DeleteMyAccountError,
  mapDeleteMyAccountFailure,
  parseDeleteMyAccountResponse,
} from '../contract';
import {
  invokeDeleteMyAccountHttp,
  resolveDeleteMyAccountEndpoint,
} from '../deleteMyAccountCallableHttp';
import { createDeleteMyAccountAdapter } from '../deleteMyAccountAdapter';

type FetchCall = { url: string; init: RequestInit };

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function recordingFetch(respond: () => Response | Promise<Response>) {
  const calls: FetchCall[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return respond();
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

function callableError(status: string, reason?: string, extra: Record<string, unknown> = {}) {
  return {
    error: {
      status,
      message: 'internal backend message that must never be shown',
      ...(reason ? { details: { reason, retryable: false, ...extra } } : {}),
    },
  };
}

const BASE = { projectId: 'nearsy-dev', idToken: 'id-token', appCheckToken: 'app-check-token' };

describe('deleteMyAccount HTTP transport', () => {
  it('posts exactly { data: {} } to us-central1 / nearsy-dev with ID token and App Check', async () => {
    const { calls, fetchImpl } = recordingFetch(() =>
      jsonResponse(200, { result: { ok: true, status: 'DELETED' } }),
    );
    const result = await invokeDeleteMyAccountHttp(BASE, { fetchImpl });
    assert.deepEqual(result, { ok: true, status: 'DELETED' });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://us-central1-nearsy-dev.cloudfunctions.net/deleteMyAccount');
    assert.equal(calls[0].init.method, 'POST');
    assert.equal(calls[0].init.body, '{"data":{}}');
    const headers = calls[0].init.headers as Record<string, string>;
    assert.equal(headers.Authorization, 'Bearer id-token');
    assert.equal(headers['X-Firebase-AppCheck'], 'app-check-token');
  });

  it('rejects any region other than the deployed us-central1', () => {
    assert.throws(
      () => resolveDeleteMyAccountEndpoint({ projectId: 'nearsy-dev', region: 'europe-west1' }),
      (err: unknown) => err instanceof DeleteMyAccountError && err.serverMayHaveDeleted === false,
    );
  });

  it('missing ID token or App Check token never sends a request', async () => {
    const { calls, fetchImpl } = recordingFetch(() => jsonResponse(200, {}));
    await assert.rejects(
      () => invokeDeleteMyAccountHttp({ ...BASE, idToken: ' ' }, { fetchImpl }),
      (err: unknown) => err instanceof DeleteMyAccountError && err.kind === 'UNAUTHENTICATED',
    );
    await assert.rejects(
      () => invokeDeleteMyAccountHttp({ ...BASE, appCheckToken: '' }, { fetchImpl }),
      (err: unknown) => err instanceof DeleteMyAccountError && err.kind === 'APP_CHECK',
    );
    assert.equal(calls.length, 0);
  });

  const cases: Array<[string, Response, string, boolean]> = [
    ['RECENT_LOGIN_REQUIRED', jsonResponse(400, callableError('FAILED_PRECONDITION', 'RECENT_LOGIN_REQUIRED', { maxAuthAgeSeconds: 300 })), 'RECENT_LOGIN_REQUIRED', false],
    ['APP_CHECK_REQUIRED', jsonResponse(400, callableError('FAILED_PRECONDITION', 'APP_CHECK_REQUIRED')), 'APP_CHECK', false],
    ['UNAUTHENTICATED reason', jsonResponse(401, callableError('UNAUTHENTICATED', 'UNAUTHENTICATED')), 'UNAUTHENTICATED', false],
    ['bare 401 (invalid ID token)', jsonResponse(401, null), 'UNAUTHENTICATED', false],
    ['INVALID_ARGUMENT', jsonResponse(400, callableError('INVALID_ARGUMENT', 'INVALID_ARGUMENT')), 'UNKNOWN', false],
    ['DELETION_RETRYABLE', jsonResponse(503, callableError('UNAVAILABLE', 'DELETION_RETRYABLE', { retryable: true, stage: 'storage' })), 'DELETION_RETRYABLE', true],
    ['DELETION_FAILED', jsonResponse(500, callableError('INTERNAL', 'DELETION_FAILED', { stage: 'auth-delete' })), 'DELETION_FAILED', true],
    ['5xx without body', jsonResponse(502, null), 'NETWORK_UNCERTAIN', true],
  ];

  for (const [label, response, kind, mayHaveDeleted] of cases) {
    it(`maps ${label} by details.reason without exposing the backend message`, async () => {
      const { calls, fetchImpl } = recordingFetch(() => response);
      await assert.rejects(
        () => invokeDeleteMyAccountHttp(BASE, { fetchImpl }),
        (err: unknown) => {
          assert.ok(err instanceof DeleteMyAccountError);
          assert.equal(err.kind, kind);
          assert.equal(err.serverMayHaveDeleted, mayHaveDeleted);
          assert.doesNotMatch(err.message, /internal backend message|id-token|app-check-token/);
          return true;
        },
      );
      assert.equal(calls.length, 1, 'never retried automatically');
    });
  }

  it('network failure is uncertain (the backend may have run) and is not retried', async () => {
    const { calls, fetchImpl } = recordingFetch(() => {
      throw new TypeError('Network request failed');
    });
    await assert.rejects(
      () => invokeDeleteMyAccountHttp(BASE, { fetchImpl }),
      (err: unknown) =>
        err instanceof DeleteMyAccountError &&
        err.kind === 'NETWORK_UNCERTAIN' &&
        err.serverMayHaveDeleted === true,
    );
    assert.equal(calls.length, 1);
  });

  it('an unreadable 200 is not treated as a deletion', async () => {
    const { fetchImpl } = recordingFetch(() => jsonResponse(200, { result: { ok: true } }));
    await assert.rejects(
      () => invokeDeleteMyAccountHttp(BASE, { fetchImpl }),
      (err: unknown) => err instanceof DeleteMyAccountError && err.kind === 'UNKNOWN',
    );
  });
});

describe('deleteMyAccount contract helpers', () => {
  it('mirrors the backend auth_time limit', () => {
    assert.equal(DELETE_MY_ACCOUNT_MAX_AUTH_AGE_SECONDS, 300);
  });

  it('parses only DELETED / ALREADY_DELETED successes', () => {
    assert.deepEqual(parseDeleteMyAccountResponse({ ok: true, status: 'ALREADY_DELETED' }), {
      ok: true,
      status: 'ALREADY_DELETED',
    });
    assert.throws(() => parseDeleteMyAccountResponse({ ok: false, status: 'DELETED' }));
    assert.throws(() => parseDeleteMyAccountResponse(null));
  });

  it('maps by code when details are missing', () => {
    assert.equal(mapDeleteMyAccountFailure({ code: 'functions/unauthenticated' }).kind, 'UNAUTHENTICATED');
    assert.equal(mapDeleteMyAccountFailure({ code: 'functions/deadline-exceeded' }).kind, 'NETWORK_UNCERTAIN');
    assert.equal(mapDeleteMyAccountFailure({ code: 'functions/permission-denied' }).serverMayHaveDeleted, false);
    assert.equal(mapDeleteMyAccountFailure(new Error('x')).kind, 'UNKNOWN');
  });
});

describe('deleteMyAccount adapter', () => {
  function adapterWith(overrides: {
    uids?: Array<string | null>;
    appCheckFails?: boolean;
    invoke?: () => Promise<any>;
  } = {}) {
    const uids = [...(overrides.uids ?? ['uid-1', 'uid-1'])];
    let invokeCalls = 0;
    let lastUid: string | null = uids[0] ?? null;
    const adapter = createDeleteMyAccountAdapter({
      getCurrentUser: () => {
        lastUid = uids.length ? (uids.shift() as string | null) : lastUid;
        return lastUid ? { uid: lastUid, getIdToken: async () => 'id-token' } : null;
      },
      withAppCheckToken: async (fn) => {
        if (overrides.appCheckFails) throw new Error('app check unavailable');
        return fn('app-check-token');
      },
      projectId: 'nearsy-dev',
      invoke: async (input) => {
        invokeCalls += 1;
        assert.equal(input.idToken, 'id-token');
        assert.equal(input.appCheckToken, 'app-check-token');
        return overrides.invoke ? overrides.invoke() : { ok: true, status: 'DELETED' };
      },
    });
    return { adapter, calls: () => invokeCalls };
  }

  it('invokes once for the expected UID', async () => {
    const { adapter, calls } = adapterWith();
    assert.deepEqual(await adapter.deleteMyAccount({ expectedUid: 'uid-1' }), {
      ok: true,
      status: 'DELETED',
    });
    assert.equal(calls(), 1);
  });

  it('aborts when the signed-in UID differs before or while fetching the ID token', async () => {
    for (const uids of [['uid-2'], ['uid-1', 'uid-2']]) {
      const { adapter, calls } = adapterWith({ uids });
      await assert.rejects(
        () => adapter.deleteMyAccount({ expectedUid: 'uid-1' }),
        (err: unknown) => err instanceof DeleteMyAccountError && err.kind === 'IDENTITY_CHANGED',
      );
      assert.equal(calls(), 0);
    }
  });

  it('App Check token failure is reported before any request', async () => {
    const { adapter, calls } = adapterWith({ appCheckFails: true });
    await assert.rejects(
      () => adapter.deleteMyAccount({ expectedUid: 'uid-1' }),
      (err: unknown) =>
        err instanceof DeleteMyAccountError && err.kind === 'APP_CHECK' && !err.serverMayHaveDeleted,
    );
    assert.equal(calls(), 0);
  });

  it('signed-out user never reaches the transport', async () => {
    const { adapter, calls } = adapterWith({ uids: [null] });
    await assert.rejects(
      () => adapter.deleteMyAccount({ expectedUid: 'uid-1' }),
      (err: unknown) => err instanceof DeleteMyAccountError && err.kind === 'UNAUTHENTICATED',
    );
    assert.equal(calls(), 0);
  });
});

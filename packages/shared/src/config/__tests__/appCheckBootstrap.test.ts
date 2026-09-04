/**
 * App Check bootstrap + token foundation (J01) — injectable core.
 *
 * Run:
 *   node --experimental-strip-types --test packages/shared/src/config/__tests__/appCheckBootstrap.test.ts
 */
import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';

import {
  __resetAppCheckBootstrapForTests,
  ensureAppCheckInitializedWithDeps,
  ensureAppCheckTokenFoundationWithDeps,
  getAppCheckInitStatus,
} from '../appCheckPolicy.ts';

const devExtras = {
  nearsyFirebaseEnv: 'development' as const,
  nearsyFirebaseProjectId: 'nearsy-dev' as const,
  nearsyDevClient: true,
};

const prodExtras = {
  nearsyFirebaseEnv: 'production' as const,
  nearsyFirebaseProjectId: 'nearsy-pj' as const,
  nearsyDevClient: false,
};

describe('ensureAppCheckInitializedWithDeps', () => {
  beforeEach(() => {
    __resetAppCheckBootstrapForTests();
  });

  it('is idempotent — native initializeAppCheck runs once (Debug)', async () => {
    let initCalls = 0;
    let configured: unknown;
    const deps = {
      readExtras: () => ({ ...devExtras }),
      isJsDev: true,
      getAppCheck: () => ({
        newReactNativeFirebaseAppCheckProvider: () => ({
          configure: (opts: unknown) => {
            configured = opts;
          },
        }),
        initializeAppCheck: async () => {
          initCalls += 1;
        },
        getToken: async () => ({ token: 'synthetic' }),
      }),
    };

    const a = await ensureAppCheckInitializedWithDeps(deps);
    const b = await ensureAppCheckInitializedWithDeps(deps);
    assert.equal(a.status, 'ready');
    assert.equal(b.status, 'ready');
    assert.equal(initCalls, 1);
    assert.equal(getAppCheckInitStatus().status, 'ready');
    assert.deepEqual(configured, { android: { provider: 'debug' } });
  });

  it('initializes Play Integrity for production + nearsy-pj', async () => {
    let configured: unknown;
    const status = await ensureAppCheckInitializedWithDeps({
      readExtras: () => ({ ...prodExtras }),
      isJsDev: false,
      getAppCheck: () => ({
        newReactNativeFirebaseAppCheckProvider: () => ({
          configure: (opts: unknown) => {
            configured = opts;
          },
        }),
        initializeAppCheck: async () => {},
      }),
    });
    assert.equal(status.status, 'ready');
    if (status.status === 'ready') {
      assert.equal(status.decision.action, 'use_play_integrity');
    }
    assert.deepEqual(configured, { android: { provider: 'playIntegrity' } });
  });

  it('rejects mismatched env without calling native', async () => {
    let initCalls = 0;
    let providerCalls = 0;
    const status = await ensureAppCheckInitializedWithDeps({
      readExtras: () => ({
        nearsyFirebaseEnv: 'development',
        nearsyFirebaseProjectId: 'nearsy-pj',
        nearsyDevClient: true,
      }),
      isJsDev: true,
      getAppCheck: () => ({
        newReactNativeFirebaseAppCheckProvider: () => {
          providerCalls += 1;
          return { configure: () => {} };
        },
        initializeAppCheck: async () => {
          initCalls += 1;
        },
      }),
    });
    assert.equal(status.status, 'error');
    assert.equal(initCalls, 0);
    assert.equal(providerCalls, 0);
    if (status.status === 'error') {
      assert.equal(status.decision?.action, 'reject');
    }
  });

  it('records error without throwing when native init fails', async () => {
    const status = await ensureAppCheckInitializedWithDeps({
      readExtras: () => ({ ...devExtras }),
      isJsDev: true,
      getAppCheck: () => ({
        newReactNativeFirebaseAppCheckProvider: () => ({
          configure: () => {},
        }),
        initializeAppCheck: async () => {
          throw new Error('native boom 12345678-1234-1234-1234-123456789abc');
        },
      }),
    });
    assert.equal(status.status, 'error');
    if (status.status === 'error') {
      assert.match(status.message, /native boom/);
      assert.doesNotMatch(
        status.message,
        /12345678-1234-1234-1234-123456789abc/,
      );
      assert.match(status.message, /\[redacted\]/);
    }
  });

  it('token foundation ready when App Check ready', async () => {
    const foundation = await ensureAppCheckTokenFoundationWithDeps({
      readExtras: () => ({ ...prodExtras }),
      isJsDev: false,
      getAppCheck: () => ({
        newReactNativeFirebaseAppCheckProvider: () => ({
          configure: () => {},
        }),
        initializeAppCheck: async () => {},
        getToken: async () => ({ token: 'synthetic' }),
      }),
    });
    assert.equal(foundation.status, 'ready');
    if (foundation.status === 'ready') {
      assert.equal(foundation.canGetToken, true);
    }
  });

  it('token foundation not_ready when policy rejects', async () => {
    __resetAppCheckBootstrapForTests();
    const foundation = await ensureAppCheckTokenFoundationWithDeps({
      readExtras: () => ({
        nearsyFirebaseEnv: 'production',
        nearsyFirebaseProjectId: 'nearsy-dev',
      }),
      isJsDev: false,
      getAppCheck: () => ({
        newReactNativeFirebaseAppCheckProvider: () => ({
          configure: () => {},
        }),
        initializeAppCheck: async () => {},
      }),
    });
    assert.equal(foundation.status, 'not_ready');
  });
});

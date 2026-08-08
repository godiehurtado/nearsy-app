/**
 * App Check bootstrap idempotency (A3.4.1) — pure injectable core.
 *
 * Run:
 *   node --experimental-strip-types --test packages/shared/src/config/__tests__/appCheckBootstrap.test.ts
 */
import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';

import {
  __resetAppCheckBootstrapForTests,
  ensureAppCheckInitializedWithDeps,
  getAppCheckInitStatus,
} from '../appCheckPolicy.ts';

describe('ensureAppCheckInitializedWithDeps', () => {
  beforeEach(() => {
    __resetAppCheckBootstrapForTests();
  });

  it('is idempotent — native initializeAppCheck runs once', async () => {
    let initCalls = 0;
    const deps = {
      readExtras: () => ({
        nearsyFirebaseEnv: 'development' as const,
        nearsyDevClient: true,
      }),
      isJsDev: true,
      getAppCheck: () => ({
        newReactNativeFirebaseAppCheckProvider: () => ({
          configure: () => {},
        }),
        initializeAppCheck: async () => {
          initCalls += 1;
        },
      }),
    };

    const a = await ensureAppCheckInitializedWithDeps(deps);
    const b = await ensureAppCheckInitializedWithDeps(deps);
    assert.equal(a.status, 'ready');
    assert.equal(b.status, 'ready');
    assert.equal(initCalls, 1);
    assert.equal(getAppCheckInitStatus().status, 'ready');
  });

  it('skips without calling native when Production Firebase env', async () => {
    let initCalls = 0;
    let providerCalls = 0;
    const status = await ensureAppCheckInitializedWithDeps({
      readExtras: () => ({ nearsyFirebaseEnv: 'default' }),
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
    assert.equal(status.status, 'skipped');
    assert.equal(initCalls, 0);
    assert.equal(providerCalls, 0);
  });

  it('records error without throwing when native init fails', async () => {
    const status = await ensureAppCheckInitializedWithDeps({
      readExtras: () => ({
        nearsyFirebaseEnv: 'development',
        nearsyDevClient: true,
      }),
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
});

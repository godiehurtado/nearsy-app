/**
 * Behavior tests for App Check provider policy (A3.4.1).
 *
 * Run:
 *   node --experimental-strip-types --test packages/shared/src/config/__tests__/appCheckPolicy.test.ts
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { decideAppCheckProvider } from '../appCheckPolicy.ts';

describe('decideAppCheckProvider', () => {
  it('allows Debug when Development Firebase env + JS dev', () => {
    const d = decideAppCheckProvider({
      extras: { nearsyFirebaseEnv: 'development', nearsyDevClient: false },
      isJsDev: true,
    });
    assert.equal(d.action, 'use_debug');
  });

  it('allows Debug when Development Firebase env + EAS dev client flag', () => {
    const d = decideAppCheckProvider({
      extras: { nearsyFirebaseEnv: 'development', nearsyDevClient: true },
      isJsDev: false,
    });
    assert.equal(d.action, 'use_debug');
  });

  it('never selects Debug for Production/default Firebase env even in __DEV__', () => {
    const d = decideAppCheckProvider({
      extras: { nearsyFirebaseEnv: 'default' },
      isJsDev: true,
    });
    assert.deepEqual(d, {
      action: 'skip',
      reason: 'firebase_env_not_development',
    });
  });

  it('never selects Debug when extras omit Firebase env (defaults to Production)', () => {
    const d = decideAppCheckProvider({
      extras: {},
      isJsDev: true,
    });
    assert.equal(d.action, 'skip');
    assert.equal(d.reason, 'firebase_env_not_development');
  });

  it('skips when Development Firebase env but not a development build', () => {
    const d = decideAppCheckProvider({
      extras: { nearsyFirebaseEnv: 'development', nearsyDevClient: false },
      isJsDev: false,
    });
    assert.deepEqual(d, {
      action: 'skip',
      reason: 'not_a_development_build',
    });
  });

  it('fails closed on invalid env override', () => {
    const d = decideAppCheckProvider({
      extras: { nearsyFirebaseEnv: 'development' },
      isJsDev: true,
      firebaseEnvOverride: 'invalid',
    });
    assert.deepEqual(d, {
      action: 'skip',
      reason: 'invalid_or_inconsistent_env',
    });
  });

  it('treats unknown nearsyFirebaseEnv label as default (not Debug)', () => {
    const d = decideAppCheckProvider({
      extras: { nearsyFirebaseEnv: 'staging' },
      isJsDev: true,
    });
    assert.equal(d.action, 'skip');
    assert.equal(d.reason, 'firebase_env_not_development');
  });
});

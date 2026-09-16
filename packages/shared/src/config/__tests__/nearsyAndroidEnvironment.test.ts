/**
 * Canonical Android environment resolver tests (J01).
 *
 * Run:
 *   node --experimental-strip-types --test packages/shared/src/config/__tests__/nearsyAndroidEnvironment.test.ts
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildAndroidRuntimeConfigSnapshot,
  parseNearsyAndroidEnvironmentLabel,
  resolveNearsyAndroidEnvironment,
} from '../nearsyAndroidEnvironment.ts';

describe('parseNearsyAndroidEnvironmentLabel', () => {
  it('maps empty/default/prod to production', () => {
    assert.equal(parseNearsyAndroidEnvironmentLabel(''), 'production');
    assert.equal(parseNearsyAndroidEnvironmentLabel('default'), 'production');
    assert.equal(parseNearsyAndroidEnvironmentLabel('production'), 'production');
    assert.equal(parseNearsyAndroidEnvironmentLabel('prod'), 'production');
  });

  it('maps development aliases', () => {
    assert.equal(parseNearsyAndroidEnvironmentLabel('development'), 'development');
    assert.equal(parseNearsyAndroidEnvironmentLabel('dev'), 'development');
  });

  it('rejects unknown labels', () => {
    assert.equal(parseNearsyAndroidEnvironmentLabel('staging'), 'unknown');
  });
});

describe('resolveNearsyAndroidEnvironment', () => {
  it('resolves development↔nearsy-dev', () => {
    const r = resolveNearsyAndroidEnvironment({
      extras: {
        nearsyFirebaseEnv: 'development',
        nearsyFirebaseProjectId: 'nearsy-dev',
        nearsyDevClient: true,
      },
      isJsDev: false,
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.config.firebaseProjectId, 'nearsy-dev');
      assert.equal(r.config.appCheckProvider, 'debug');
      assert.equal(r.config.linkedInAuthEnabled, true);
      assert.equal(r.isDevBuild, true);
    }
  });

  it('resolves production↔nearsy-pj Store-like extras', () => {
    const r = resolveNearsyAndroidEnvironment({
      extras: {
        nearsyFirebaseEnv: 'production',
        nearsyFirebaseProjectId: 'nearsy-pj',
        nearsyDevClient: false,
        nearsyFunctionsRegion: 'us-central1',
      },
      isJsDev: false,
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.config.appCheckProvider, 'production');
      assert.equal(r.config.linkedInAuthEnabled, true);
    }
    const snap = buildAndroidRuntimeConfigSnapshot(r);
    assert.equal(snap.environment, 'production');
    assert.equal(snap.firebaseProjectId, 'nearsy-pj');
    assert.equal(snap.appCheckProvider, 'production');
    assert.equal(snap.debugTokenPresent, false);
  });

  it('fails closed on mismatch', () => {
    const r = resolveNearsyAndroidEnvironment({
      extras: {
        nearsyFirebaseEnv: 'development',
        nearsyFirebaseProjectId: 'nearsy-pj',
      },
      isJsDev: true,
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, 'env_project_mismatch');
  });
});

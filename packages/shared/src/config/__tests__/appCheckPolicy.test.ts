/**
 * App Check provider policy tests (J01).
 *
 * Run:
 *   node --experimental-strip-types --test packages/shared/src/config/__tests__/appCheckPolicy.test.ts
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  decideAppCheckProvider,
  materializeAndroidAppCheckProviderConfig,
} from '../appCheckPolicy.ts';
import { AndroidAppCheckProviderConfigError } from '../androidAppCheckProviderConfig.ts';

const devExtras = {
  nearsyFirebaseEnv: 'development',
  nearsyFirebaseProjectId: 'nearsy-dev',
  nearsyDevClient: true,
  nearsyFunctionsRegion: 'us-central1',
};

const prodExtras = {
  nearsyFirebaseEnv: 'production',
  nearsyFirebaseProjectId: 'nearsy-pj',
  nearsyDevClient: false,
  nearsyFunctionsRegion: 'us-central1',
};

describe('decideAppCheckProvider', () => {
  it('development + nearsy-dev + JS dev → Debug', () => {
    const d = decideAppCheckProvider({
      extras: { ...devExtras, nearsyDevClient: false },
      isJsDev: true,
    });
    assert.deepEqual(d, {
      action: 'use_debug',
      reason: 'development_nearsy_dev',
    });
  });

  it('development + nearsy-dev + EAS dev client → Debug', () => {
    const d = decideAppCheckProvider({
      extras: devExtras,
      isJsDev: false,
    });
    assert.equal(d.action, 'use_debug');
  });

  it('production + nearsy-pj → Play Integrity', () => {
    const d = decideAppCheckProvider({
      extras: prodExtras,
      isJsDev: false,
    });
    assert.deepEqual(d, {
      action: 'use_play_integrity',
      reason: 'production_nearsy_pj',
    });
  });

  it('production + nearsy-pj never uses Debug even in __DEV__', () => {
    const d = decideAppCheckProvider({
      extras: prodExtras,
      isJsDev: true,
    });
    assert.equal(d.action, 'use_play_integrity');
  });

  it('development + nearsy-pj → fail closed', () => {
    const d = decideAppCheckProvider({
      extras: {
        nearsyFirebaseEnv: 'development',
        nearsyFirebaseProjectId: 'nearsy-pj',
        nearsyDevClient: true,
      },
      isJsDev: true,
    });
    assert.deepEqual(d, {
      action: 'reject',
      reason: 'env_project_mismatch',
    });
  });

  it('production + nearsy-dev → fail closed', () => {
    const d = decideAppCheckProvider({
      extras: {
        nearsyFirebaseEnv: 'production',
        nearsyFirebaseProjectId: 'nearsy-dev',
        nearsyDevClient: false,
      },
      isJsDev: false,
    });
    assert.equal(d.action, 'reject');
    assert.equal(d.reason, 'env_project_mismatch');
  });

  it('unknown environment → fail closed', () => {
    const d = decideAppCheckProvider({
      extras: {
        nearsyFirebaseEnv: 'staging',
        nearsyFirebaseProjectId: 'nearsy-pj',
      },
      isJsDev: true,
    });
    assert.deepEqual(d, {
      action: 'reject',
      reason: 'unknown_environment',
    });
  });

  it('unknown project → fail closed', () => {
    const d = decideAppCheckProvider({
      extras: {
        nearsyFirebaseEnv: 'production',
        nearsyFirebaseProjectId: 'other-project',
      },
      isJsDev: false,
    });
    assert.deepEqual(d, {
      action: 'reject',
      reason: 'unknown_project',
    });
  });

  it('development without project id → fail closed', () => {
    const d = decideAppCheckProvider({
      extras: { nearsyFirebaseEnv: 'development', nearsyDevClient: true },
      isJsDev: true,
    });
    assert.equal(d.action, 'reject');
    assert.equal(d.reason, 'unknown_project');
  });

  it('development + nearsy-dev without dev build → fail closed', () => {
    const d = decideAppCheckProvider({
      extras: {
        nearsyFirebaseEnv: 'development',
        nearsyFirebaseProjectId: 'nearsy-dev',
        nearsyDevClient: false,
      },
      isJsDev: false,
    });
    assert.deepEqual(d, {
      action: 'reject',
      reason: 'development_requires_dev_build',
    });
  });

  it('legacy default env label without project → fail closed', () => {
    const d = decideAppCheckProvider({
      extras: { nearsyFirebaseEnv: 'default' },
      isJsDev: true,
    });
    assert.equal(d.action, 'reject');
  });

  it('Store-like production extras shape → Play Integrity', () => {
    const d = decideAppCheckProvider({
      extras: {
        nearsyFirebaseEnv: 'production',
        nearsyFirebaseProjectId: 'nearsy-pj',
        nearsyDevClient: false,
        nearsyFunctionsRegion: 'us-central1',
      },
      isJsDev: false,
    });
    assert.equal(d.action, 'use_play_integrity');
  });
});

describe('materializeAndroidAppCheckProviderConfig', () => {
  it('maps Debug decision to debug provider', () => {
    const cfg = materializeAndroidAppCheckProviderConfig({
      action: 'use_debug',
      reason: 'development_nearsy_dev',
    });
    assert.equal(cfg.provider, 'debug');
    assert.equal(cfg.debugToken, undefined);
  });

  it('maps Play Integrity decision to playIntegrity without debug token', () => {
    const cfg = materializeAndroidAppCheckProviderConfig({
      action: 'use_play_integrity',
      reason: 'production_nearsy_pj',
    });
    assert.equal(cfg.provider, 'playIntegrity');
  });

  it('forbids debug token on production Play Integrity', () => {
    assert.throws(
      () =>
        materializeAndroidAppCheckProviderConfig(
          { action: 'use_play_integrity', reason: 'production_nearsy_pj' },
          'should-not-be-used',
        ),
      (err: unknown) =>
        err instanceof AndroidAppCheckProviderConfigError &&
        err.code === 'APP_CHECK_DEBUG_TOKEN_FORBIDDEN',
    );
  });
});

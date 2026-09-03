import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import {
  AppleAppCheckProviderConfigError,
  RNFB_APPLE_DEBUG_PROVIDER,
  RNFB_APPLE_PRODUCTION_PROVIDER,
  resolveAppleAppCheckProviderConfig,
} from '../appCheck/appleAppCheckProviderConfig';
import { resolveNearsyFirebaseEnvironment } from '../environment/nearsyFirebaseEnvironment';

describe('resolveAppleAppCheckProviderConfig', () => {
  it('development/debug resolves the RNFB debug provider with token', () => {
    const env = resolveNearsyFirebaseEnvironment('development');
    assert.equal(env.appCheckProvider, 'debug');
    const config = resolveAppleAppCheckProviderConfig({
      appCheckProvider: env.appCheckProvider,
      debugToken: 'debug-token-value',
    });
    assert.equal(config.provider, RNFB_APPLE_DEBUG_PROVIDER);
    assert.equal(config.debugToken, 'debug-token-value');
  });

  it('production resolves App Attest with DeviceCheck fallback and no debug token', () => {
    const env = resolveNearsyFirebaseEnvironment('production');
    assert.equal(env.appCheckProvider, 'production');
    const config = resolveAppleAppCheckProviderConfig({
      appCheckProvider: env.appCheckProvider,
    });
    assert.equal(config.provider, RNFB_APPLE_PRODUCTION_PROVIDER);
    assert.equal(config.debugToken, undefined);
    assert.equal('debugToken' in config, false);
  });

  it('production fails closed if a debug token is present', () => {
    assert.throws(
      () =>
        resolveAppleAppCheckProviderConfig({
          appCheckProvider: 'production',
          debugToken: 'must-not-be-used',
        }),
      (err: unknown) =>
        err instanceof AppleAppCheckProviderConfigError &&
        err.code === 'APP_CHECK_DEBUG_TOKEN_FORBIDDEN',
    );
  });

  it('debug fails closed without a token', () => {
    assert.throws(
      () =>
        resolveAppleAppCheckProviderConfig({
          appCheckProvider: 'debug',
        }),
      (err: unknown) =>
        err instanceof AppleAppCheckProviderConfigError &&
        err.code === 'APP_CHECK_DEBUG_TOKEN_MISSING',
    );
  });

  it('unsupported/invalid configuration remains fail-closed', () => {
    assert.throws(
      () =>
        resolveAppleAppCheckProviderConfig({
          appCheckProvider: 'production_pending',
        }),
      (err: unknown) =>
        err instanceof AppleAppCheckProviderConfigError &&
        err.code === 'APP_CHECK_PROVIDER_UNSUPPORTED',
    );
    assert.throws(
      () =>
        resolveAppleAppCheckProviderConfig({
          appCheckProvider: 'unknown',
        }),
      (err: unknown) =>
        err instanceof AppleAppCheckProviderConfigError &&
        err.code === 'APP_CHECK_PROVIDER_UNSUPPORTED',
    );
  });
});

describe('nativeAppCheckPort iOS production enablement', () => {
  it('no longer refuses production App Check at the iOS port', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const iosPort = readFileSync(
      join(here, '../appCheck/nativeAppCheckPort.ios.ts'),
      'utf8',
    );
    assert.match(iosPort, /resolveAppleAppCheckProviderConfig/);
    assert.doesNotMatch(
      iosPort,
      /LinkedIn App Check is not enabled for this environment/,
    );
    assert.doesNotMatch(iosPort, /appCheckProvider !== 'debug'/);
  });
});

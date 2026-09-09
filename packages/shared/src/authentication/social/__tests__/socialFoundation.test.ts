import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CANONICAL_IOS_BUNDLE_ID,
  validateGoogleAuthenticationConfiguration,
} from '../application/configurationValidator';
import { createSocialProviderRegistry } from '../application/providerRegistry';
import type { SocialAuthenticationProviderAdapter } from '../application/socialAuthenticationPort';
import {
  createSocialAuthError,
  mapUnknownProviderError,
  sanitizeSocialErrorForLog,
} from '../domain/socialAuthenticationError';

describe('validateGoogleAuthenticationConfiguration', () => {
  it('accepts a valid iOS Google configuration', () => {
    const result = validateGoogleAuthenticationConfiguration(
      {
        enabled: true,
        webClientId: 'web-client.apps.googleusercontent.com',
        iosClientId: 'ios-client.apps.googleusercontent.com',
        iosUrlScheme: 'com.googleusercontent.apps.ios-client',
        expectedIosBundleId: CANONICAL_IOS_BUNDLE_ID,
        plistBundleId: CANONICAL_IOS_BUNDLE_ID,
        plistProjectId: 'nearsy-pj',
        firebaseEnvironmentProjectId: 'nearsy-pj',
        scopes: ['openid', 'email', 'profile'],
      },
      { nativeModulePresent: true },
    );

    assert.equal(result.ok, true);
    assert.equal(result.issues.length, 0);
  });

  it('accepts nearsy-dev project alignment', () => {
    const result = validateGoogleAuthenticationConfiguration(
      {
        enabled: true,
        webClientId: '477970832846-web.apps.googleusercontent.com',
        iosClientId: '477970832846-ios.apps.googleusercontent.com',
        iosUrlScheme: 'com.googleusercontent.apps.477970832846-ios',
        expectedIosBundleId: CANONICAL_IOS_BUNDLE_ID,
        plistBundleId: CANONICAL_IOS_BUNDLE_ID,
        plistProjectId: 'nearsy-dev',
        firebaseEnvironmentProjectId: 'nearsy-dev',
        scopes: ['openid', 'email', 'profile'],
      },
      { nativeModulePresent: true },
    );

    assert.equal(result.ok, true);
  });

  it('rejects Ops OAuth credentials in Development', () => {
    const result = validateGoogleAuthenticationConfiguration({
      enabled: true,
      webClientId:
        '557470198780-web.apps.googleusercontent.com',
      iosClientId:
        '557470198780-ios.apps.googleusercontent.com',
      iosUrlScheme: 'com.googleusercontent.apps.557470198780-ios',
      expectedIosBundleId: CANONICAL_IOS_BUNDLE_ID,
      plistProjectId: 'nearsy-dev',
      firebaseEnvironmentProjectId: 'nearsy-dev',
      scopes: ['openid', 'email', 'profile'],
    });

    assert.equal(result.ok, false);
    assert.ok(
      result.issues.some(
        (issue) => issue.code === 'GOOGLE_OPS_CREDENTIALS_IN_DEV',
      ),
    );
  });

  it('detects CLIENT_ID / URL scheme mismatch', () => {
    const result = validateGoogleAuthenticationConfiguration({
      enabled: true,
      webClientId: 'web-client.apps.googleusercontent.com',
      iosClientId: 'ios-client.apps.googleusercontent.com',
      iosUrlScheme: 'com.googleusercontent.apps.other-client',
      expectedIosBundleId: CANONICAL_IOS_BUNDLE_ID,
      scopes: ['openid', 'email', 'profile'],
    });

    assert.equal(result.ok, false);
    assert.ok(
      result.issues.some(
        (issue) => issue.code === 'GOOGLE_CLIENT_SCHEME_MISMATCH',
      ),
    );
  });

  it('detects missing web client id', () => {
    const result = validateGoogleAuthenticationConfiguration({
      enabled: true,
      iosClientId: 'ios-client.apps.googleusercontent.com',
      iosUrlScheme: 'com.googleusercontent.apps.ios-client',
      expectedIosBundleId: CANONICAL_IOS_BUNDLE_ID,
      scopes: ['openid', 'email', 'profile'],
    });

    assert.equal(result.ok, false);
    assert.ok(
      result.issues.some((issue) => issue.code === 'GOOGLE_CONFIG_MISSING'),
    );
  });

  it('detects legacy plist bundle mismatch', () => {
    const result = validateGoogleAuthenticationConfiguration({
      enabled: true,
      webClientId: 'web-client.apps.googleusercontent.com',
      iosClientId: 'ios-client.apps.googleusercontent.com',
      iosUrlScheme: 'com.googleusercontent.apps.ios-client',
      expectedIosBundleId: CANONICAL_IOS_BUNDLE_ID,
      plistBundleId: 'com.nearsy.app',
      scopes: ['openid', 'email', 'profile'],
    });

    assert.equal(result.ok, false);
    assert.ok(
      result.issues.some((issue) => issue.code === 'GOOGLE_IOS_BUNDLE_MISMATCH'),
    );
  });

  it('detects missing URL scheme', () => {
    const result = validateGoogleAuthenticationConfiguration({
      enabled: true,
      webClientId: 'web-client.apps.googleusercontent.com',
      iosClientId: 'ios-client.apps.googleusercontent.com',
      expectedIosBundleId: CANONICAL_IOS_BUNDLE_ID,
      scopes: ['openid', 'email', 'profile'],
    });

    assert.equal(result.ok, false);
    assert.ok(
      result.issues.some((issue) => issue.code === 'GOOGLE_URL_SCHEME_MISSING'),
    );
  });

  it('detects missing native module', () => {
    const result = validateGoogleAuthenticationConfiguration(
      {
        enabled: true,
        webClientId: 'web-client.apps.googleusercontent.com',
        iosClientId: 'ios-client.apps.googleusercontent.com',
        iosUrlScheme: 'com.googleusercontent.apps.ios-client',
        expectedIosBundleId: CANONICAL_IOS_BUNDLE_ID,
        scopes: ['openid', 'email', 'profile'],
      },
      { nativeModulePresent: false },
    );

    assert.equal(result.ok, false);
    assert.ok(
      result.issues.some(
        (issue) => issue.code === 'GOOGLE_NATIVE_MODULE_MISSING',
      ),
    );
  });
});

describe('createSocialProviderRegistry', () => {
  const fakeGoogle: SocialAuthenticationProviderAdapter = {
    provider: 'google',
    async isAvailable() {
      return true;
    },
    async configure() {},
    async authenticate() {
      return {
        provider: 'google',
        providerUserId: 'test-user',
        idToken: 'token',
      };
    },
  };

  it('resolves the registered Google adapter', () => {
    const registry = createSocialProviderRegistry({ google: fakeGoogle });
    assert.equal(registry.isRegistered('google'), true);
    assert.equal(registry.get('google').provider, 'google');
  });

  it('fails for an unregistered provider', () => {
    const registry = createSocialProviderRegistry({ google: fakeGoogle });
    assert.throws(() => registry.get('apple'), (err: unknown) => {
      return (
        typeof err === 'object' &&
        err !== null &&
        'social' in err &&
        (err as { social: { code: string } }).social.code ===
          'PROVIDER_UNAVAILABLE'
      );
    });
  });
});

describe('social authentication errors', () => {
  it('maps cancellation codes', () => {
    const mapped = mapUnknownProviderError('google', {
      code: 'SIGN_IN_CANCELLED',
    });
    assert.equal(mapped.social.code, 'CANCELLED');
    assert.equal(mapped.social.recoverable, true);
  });

  it('sanitizes errors without token fields', () => {
    const error = createSocialAuthError({
      code: 'TOKEN_MISSING',
      provider: 'google',
      recoverable: false,
      messageKey: 'authentication.social.errors.generic',
      diagnosticCode: 'ID_TOKEN_MISSING',
    });

    const sanitized = sanitizeSocialErrorForLog(error.social);
    assert.equal(sanitized.code, 'TOKEN_MISSING');
    assert.equal('idToken' in sanitized, false);
    assert.equal('accessToken' in sanitized, false);
    assert.equal('technicalCause' in sanitized, false);
  });
});

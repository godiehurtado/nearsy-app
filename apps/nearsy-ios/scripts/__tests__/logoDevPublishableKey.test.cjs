const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const {
  LOGO_DEV_PUBLISHABLE_KEY_ENV,
  describeLogoDevPublishableKey,
  resolveLogoDevPublishableKey,
} = require('../logoDevPublishableKey.cjs');

const PLACEHOLDER_PK = 'pk_test_placeholder';
const PLACEHOLDER_SK = 'sk_test_secret';

describe('Logo.dev publishable key app.config validation', () => {
  it('rejects a missing key when required', () => {
    assert.throws(
      () => resolveLogoDevPublishableKey(undefined, { required: true }),
      /Missing required environment variable for development: EXPO_PUBLIC_LOGO_DEV_PUBLISHABLE_KEY/,
    );
    assert.equal(resolveLogoDevPublishableKey('', { required: false }), undefined);
    assert.equal(resolveLogoDevPublishableKey('   ', { required: false }), undefined);
  });

  it('accepts a pk_ prefix without using a real token', () => {
    assert.equal(
      resolveLogoDevPublishableKey(PLACEHOLDER_PK, { required: true }),
      PLACEHOLDER_PK,
    );
  });

  it('rejects sk_ secrets', () => {
    assert.throws(
      () => resolveLogoDevPublishableKey(PLACEHOLDER_SK, { required: true }),
      /must be a publishable pk_ key, not a secret/,
    );
  });

  it('descriptor never includes the key value or token=', () => {
    const snapshot = describeLogoDevPublishableKey(PLACEHOLDER_PK);
    const encoded = JSON.stringify(snapshot);
    assert.equal(snapshot.envName, LOGO_DEV_PUBLISHABLE_KEY_ENV);
    assert.equal(snapshot.keyPresent, true);
    assert.equal(snapshot.publishablePrefix, true);
    assert.equal(snapshot.secretPrefix, false);
    assert.ok(!encoded.includes(PLACEHOLDER_PK));
    assert.ok(!encoded.includes('pk_'));
    assert.ok(!encoded.includes('sk_'));
    assert.ok(!encoded.includes('token='));
  });
});

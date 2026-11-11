const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

const { assertAnalyticsBuildConfig } = require('../analyticsBuildConfig.cjs');

const appRoot = path.join(__dirname, '../..');
const eas = JSON.parse(fs.readFileSync(path.join(appRoot, 'eas.json'), 'utf8'));
const appConfig = fs.readFileSync(path.join(appRoot, 'app.config.js'), 'utf8');
const FAKE = 'phc_fake_token_for_tests';
const BUILDER = { EAS_BUILD: 'true' };

describe('analytics build guard', () => {
  it('profiles that declare nothing build without a token', () => {
    assert.deepEqual(assertAnalyticsBuildConfig({}), { declared: false });
    for (const name of ['development', 'preview', 'production']) {
      assert.deepEqual(assertAnalyticsBuildConfig({ ...eas.build[name].env }), { declared: false }, name);
    }
  });

  it('on the EAS builder, the beta profile without a token fails with a clear message', () => {
    assert.throws(
      () => assertAnalyticsBuildConfig({ ...BUILDER, ...eas.build.beta.env }),
      /declares analytics \(channel "beta"\) but EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN is missing/,
    );
    assert.throws(
      () =>
        assertAnalyticsBuildConfig({
          ...BUILDER,
          ...eas.build.beta.env,
          EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN: 'not-a-token',
        }),
      /missing or malformed/,
    );
  });

  it('the CLI read on this machine, without EAS variables, does not block the upload', () => {
    assert.deepEqual(assertAnalyticsBuildConfig({ ...eas.build.beta.env }), {
      declared: true,
      channel: 'beta',
      tokenChecked: false,
    });
  });

  it('the beta profile with a token passes', () => {
    assert.deepEqual(
      assertAnalyticsBuildConfig({ ...BUILDER, ...eas.build.beta.env, EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN: FAKE }),
      { declared: true, channel: 'beta', tokenChecked: true },
    );
  });

  it('half a configuration fails instead of building off by accident', () => {
    assert.throws(() => assertAnalyticsBuildConfig({ EXPO_PUBLIC_POSTHOG_ENABLED: 'true' }), /half configured/);
    assert.throws(
      () => assertAnalyticsBuildConfig({ EXPO_PUBLIC_POSTHOG_DISTRIBUTION_CHANNEL: 'beta' }),
      /half configured/,
    );
  });

  it('the message never contains the token', () => {
    const secret = 'phc_' + 'x'.repeat(2);
    try {
      assertAnalyticsBuildConfig({ ...BUILDER, ...eas.build.beta.env, EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN: secret });
      assert.fail('should throw');
    } catch (error) {
      assert.equal(String(error.message).includes(secret), false);
    }
  });

  it('the public production profile keeps PostHog in the binary with capture off', () => {
    const env = eas.build.production.env;
    for (const key of Object.keys(env)) {
      assert.equal(key.startsWith('EXPO_PUBLIC_POSTHOG_'), false, key);
    }
    // Even with the EAS token injected, no channel means nothing is declared.
    assert.deepEqual(
      assertAnalyticsBuildConfig({ ...BUILDER, ...env, EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN: FAKE }),
      { declared: false },
    );
    assert.equal(env.EXPO_PUBLIC_NEARSY_FIREBASE_ENV, 'production');
  });

  it('only the beta profile, separate from production, marks test users', () => {
    assert.equal(eas.build.beta.extends, 'production');
    assert.equal(eas.build.beta.env.EXPO_PUBLIC_POSTHOG_DISTRIBUTION_CHANNEL, 'beta');
    for (const [name, profile] of Object.entries(eas.build)) {
      if (name === 'beta') continue;
      assert.equal('EXPO_PUBLIC_POSTHOG_DISTRIBUTION_CHANNEL' in (profile.env ?? {}), false, name);
    }
  });

  it('app.config runs the guard', () => {
    assert.match(appConfig, /assertAnalyticsBuildConfig\(process\.env\)/);
  });
});

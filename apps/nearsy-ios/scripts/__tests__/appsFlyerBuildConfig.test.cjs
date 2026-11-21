/**
 * AppsFlyer build switch (contract nc1, C7): off by default in every profile; on
 * requires the dev key on the EAS builder; the key is never echoed in errors.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

const {
  resolveAppsFlyerBuildConfig,
  appsFlyerExtra,
  ONELINK_HOST,
  APPLE_APP_ID,
} = require('../appsFlyerBuildConfig.cjs');

const KEY = 'AbCdEf0123456789XyZ';

describe('appsFlyerBuildConfig', () => {
  it('is off unless explicitly true', () => {
    for (const value of [undefined, '', 'false']) {
      assert.deepEqual(resolveAppsFlyerBuildConfig({ NEARSY_APPSFLYER_ENABLED: value }), { enabled: false });
    }
    assert.throws(() => resolveAppsFlyerBuildConfig({ NEARSY_APPSFLYER_ENABLED: 'yes' }));
    assert.deepEqual(appsFlyerExtra({ enabled: false }), {});
  });

  it('on the EAS builder, on without a valid key fails without printing it', () => {
    for (const key of [undefined, 'short', 'has spaces in it 123456']) {
      try {
        resolveAppsFlyerBuildConfig({ NEARSY_APPSFLYER_ENABLED: 'true', NEARSY_APPSFLYER_DEV_KEY: key, EAS_BUILD: 'true' });
        assert.fail('expected failure');
      } catch (error) {
        assert.match(String(error.message), /NEARSY_APPSFLYER_DEV_KEY is missing or malformed/);
        if (key) assert.equal(String(error.message).includes(key), false);
      }
    }
  });

  it('locally, on without the key only checks the profile and embeds nothing', () => {
    const resolved = resolveAppsFlyerBuildConfig({ NEARSY_APPSFLYER_ENABLED: 'true' });
    assert.equal(resolved.enabled, true);
    assert.equal(resolved.keyChecked, false);
    assert.deepEqual(appsFlyerExtra(resolved), {});
  });

  it('on with a key: associated domain and runtime extra for nearsy.onelink.me', () => {
    const resolved = resolveAppsFlyerBuildConfig({ NEARSY_APPSFLYER_ENABLED: 'true', NEARSY_APPSFLYER_DEV_KEY: KEY, EAS_BUILD: 'true' });
    assert.deepEqual(resolved.associatedDomains, ['applinks:nearsy.onelink.me']);
    assert.equal(ONELINK_HOST, 'nearsy.onelink.me');
    const extra = appsFlyerExtra(resolved);
    assert.equal(extra.NEARSY_APPSFLYER_ENABLED, 'true');
    assert.equal(extra.NEARSY_APPSFLYER_DEV_KEY, KEY);
    assert.equal(extra.NEARSY_APPSFLYER_APPLE_APP_ID, APPLE_APP_ID);
    assert.equal(APPLE_APP_ID, '6759302206');
    assert.equal(extra.NEARSY_ONELINK_TEMPLATE_ID, 'Uxo6');
  });

  it('only the nearsy-dev ad hoc test profile switches AppsFlyer on; no profile carries a key', () => {
    const eas = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'eas.json'), 'utf8'));
    // Resolve `extends` so an inherited switch is caught too.
    const resolveEnv = (name) => {
      const profile = eas.build[name];
      return { ...(profile.extends ? resolveEnv(profile.extends) : {}), ...(profile.env ?? {}) };
    };
    const resolveField = (name, field) => {
      const profile = eas.build[name];
      if (profile[field] !== undefined) return profile[field];
      return profile.extends ? resolveField(profile.extends, field) : undefined;
    };
    const enabled = [];
    for (const name of Object.keys(eas.build ?? {})) {
      const env = resolveEnv(name);
      assert.equal(env.NEARSY_APPSFLYER_DEV_KEY, undefined, `${name}: the key lives only in EAS`);
      if (env.NEARSY_APPSFLYER_ENABLED === 'true') enabled.push(name);
    }
    assert.deepEqual(enabled, ['dev-internal-appsflyer']);
    const name = 'dev-internal-appsflyer';
    const env = resolveEnv(name);
    assert.equal(resolveField(name, 'distribution'), 'internal');
    assert.equal(resolveField(name, 'environment'), 'development');
    assert.equal(resolveField(name, 'developmentClient'), undefined);
    assert.equal(env.EXPO_PUBLIC_NEARSY_FIREBASE_ENV, 'development');
    assert.equal(env.EXPO_PUBLIC_POSTHOG_ENABLED, 'false');
    assert.equal(eas.submit?.[name], undefined);
  });

  it('react-native.config.js unlinks the native module whenever it is off', () => {
    const configPath = path.join(__dirname, '..', '..', 'react-native.config.js');
    const load = (env) => {
      const saved = process.env.NEARSY_APPSFLYER_ENABLED;
      if (env === undefined) delete process.env.NEARSY_APPSFLYER_ENABLED;
      else process.env.NEARSY_APPSFLYER_ENABLED = env;
      delete require.cache[require.resolve(configPath)];
      try {
        return require(configPath);
      } finally {
        if (saved === undefined) delete process.env.NEARSY_APPSFLYER_ENABLED;
        else process.env.NEARSY_APPSFLYER_ENABLED = saved;
      }
    };
    assert.deepEqual(load(undefined).dependencies['react-native-appsflyer'], { platforms: { ios: null, android: null } });
    assert.equal(load('true').dependencies['react-native-appsflyer'], undefined);
  });
});

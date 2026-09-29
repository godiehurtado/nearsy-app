/**
 * ENH-AUTH-FB-01 — Facebook Login build-time config and Info.plist policy.
 * Uses obviously fake client tokens; never reads real env values.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

const {
  FACEBOOK_APP_ID_ENV,
  FACEBOOK_CLIENT_TOKEN_ENV,
  FACEBOOK_QUERY_SCHEMES,
  describeFacebookAuthEnv,
  resolveFacebookAuthEnv,
  resolveFacebookAuthEnvForConfig,
  buildFacebookPluginProps,
} = require('../../scripts/facebookAuthConfig.cjs');
const withNearsyFacebookAuth = require('../withNearsyFacebookAuth');
const {
  applyNearsyFacebookInfoPlistPolicy,
} = require('../withNearsyFacebookAuth');

const APP_ROOT = path.join(__dirname, '..', '..');
const REPO_ROOT = path.join(APP_ROOT, '..', '..');
const CONTRACT_APP_ID = '955843897572627';
const FAKE_CLIENT_TOKEN = 'faketoken0000000000000000000000a';

function validEnv(overrides = {}) {
  return {
    [FACEBOOK_APP_ID_ENV]: CONTRACT_APP_ID,
    [FACEBOOK_CLIENT_TOKEN_ENV]: FAKE_CLIENT_TOKEN,
    ...overrides,
  };
}

async function evaluateInfoPlist(config) {
  const mod = config.mods?.ios?.infoPlist;
  assert.equal(typeof mod, 'function', 'expected an iOS Info.plist mod');
  const result = await mod({
    ...config,
    modResults: {},
    modRequest: {
      platform: 'ios',
      modName: 'infoPlist',
      projectRoot: APP_ROOT,
      platformProjectRoot: path.join(APP_ROOT, 'ios'),
      introspect: true,
    },
  });
  return result.modResults;
}

function loadAppConfig(env) {
  const saved = { ...process.env };
  const configPath = require.resolve('../../app.config.js');
  delete require.cache[configPath];
  Object.assign(process.env, env);
  try {
    const appJson = JSON.parse(
      fs.readFileSync(path.join(APP_ROOT, 'app.json'), 'utf8'),
    );
    return require(configPath)({ config: appJson.expo });
  } finally {
    for (const key of Object.keys(process.env)) {
      if (!(key in saved)) delete process.env[key];
    }
    Object.assign(process.env, saved);
  }
}

describe('Facebook auth env validation', () => {
  it('resolves App ID and Client Token from env', () => {
    const resolved = resolveFacebookAuthEnv(validEnv());
    assert.equal(resolved.appID, CONTRACT_APP_ID);
    assert.equal(resolved.clientToken, FAKE_CLIENT_TOKEN);
  });

  it('fails fast when App ID or Client Token are missing, without printing values', () => {
    assert.throws(
      () => resolveFacebookAuthEnv(validEnv({ [FACEBOOK_APP_ID_ENV]: '' })),
      new RegExp(`Missing required environment variable: ${FACEBOOK_APP_ID_ENV}`),
    );
    try {
      resolveFacebookAuthEnv(validEnv({ [FACEBOOK_CLIENT_TOKEN_ENV]: '  ' }));
      assert.fail('expected throw');
    } catch (err) {
      assert.match(String(err.message), new RegExp(FACEBOOK_CLIENT_TOKEN_ENV));
      assert.equal(String(err.message).includes(CONTRACT_APP_ID), false);
    }
  });

  it('rejects malformed App ID / Client Token and app access tokens', () => {
    assert.throws(
      () => resolveFacebookAuthEnv(validEnv({ [FACEBOOK_APP_ID_ENV]: 'fb123' })),
      /numeric Meta App ID/,
    );
    const appAccessToken = `${CONTRACT_APP_ID}|notARealSecretValue`;
    try {
      resolveFacebookAuthEnv(validEnv({ [FACEBOOK_CLIENT_TOKEN_ENV]: appAccessToken }));
      assert.fail('expected throw');
    } catch (err) {
      assert.match(String(err.message), /app access token/);
      assert.equal(String(err.message).includes('notARealSecretValue'), false);
    }
    assert.throws(
      () =>
        resolveFacebookAuthEnv(
          validEnv({ [FACEBOOK_CLIENT_TOKEN_ENV]: CONTRACT_APP_ID }),
        ),
      /invalid format/,
    );
  });

  it('rejects any App Secret exposed through EXPO_PUBLIC env', () => {
    assert.throws(
      () =>
        resolveFacebookAuthEnv(
          validEnv({ EXPO_PUBLIC_FACEBOOK_APP_SECRET: 'fake-secret-value' }),
        ),
      /must never be exposed to the mobile client/,
    );
  });

  it('describe output reports presence/format only (no values)', () => {
    const described = describeFacebookAuthEnv(validEnv());
    assert.deepEqual(described, {
      appIdEnv: FACEBOOK_APP_ID_ENV,
      appIdPresent: true,
      appIdFormatValid: true,
      clientTokenEnv: FACEBOOK_CLIENT_TOKEN_ENV,
      clientTokenPresent: true,
      clientTokenFormatValid: true,
      forbiddenSecretEnvPresent: false,
    });
    const serialized = JSON.stringify(described);
    assert.equal(serialized.includes(FAKE_CLIENT_TOKEN), false);
    assert.equal(serialized.includes(CONTRACT_APP_ID), false);
  });
});

describe('Facebook plugin props and Info.plist policy', () => {
  it('plugin props keep auto app events, advertiser ID and auto-init OFF with no ATT', () => {
    const props = buildFacebookPluginProps(resolveFacebookAuthEnv(validEnv()));
    assert.equal(props.appID, CONTRACT_APP_ID);
    assert.equal(props.displayName, 'Nearsy');
    assert.equal(props.scheme, `fb${CONTRACT_APP_ID}`);
    assert.equal(props.autoLogAppEventsEnabled, false);
    assert.equal(props.advertiserIDCollectionEnabled, false);
    assert.equal(props.isAutoInitEnabled, false);
    assert.equal('iosUserTrackingPermission' in props, false);
  });

  it('effective Info.plist matches the contract after the fbsdk mod runs', async () => {
    const props = buildFacebookPluginProps(resolveFacebookAuthEnv(validEnv()));
    const config = withNearsyFacebookAuth(
      { name: 'Nearsy', slug: 'nearsy-ios', ios: { infoPlist: {} } },
      props,
    );
    const plist = await evaluateInfoPlist(config);

    assert.equal(plist.FacebookAppID, CONTRACT_APP_ID);
    assert.equal(plist.FacebookDisplayName, 'Nearsy');
    assert.equal(plist.FacebookClientToken, FAKE_CLIENT_TOKEN);
    assert.equal(plist.FacebookAutoLogAppEventsEnabled, false);
    assert.equal(plist.FacebookAdvertiserIDCollectionEnabled, false);
    assert.equal(plist.FacebookAutoInitEnabled, false);
    assert.deepEqual(plist.LSApplicationQueriesSchemes, [...FACEBOOK_QUERY_SCHEMES]);
    const schemes = (plist.CFBundleURLTypes ?? []).flatMap(
      (entry) => entry.CFBundleURLSchemes ?? [],
    );
    assert.ok(schemes.includes(`fb${CONTRACT_APP_ID}`));
    assert.equal('NSUserTrackingUsageDescription' in plist, false);
    assert.equal('SKAdNetworkItems' in (config.ios?.infoPlist ?? {}), false);
    assert.equal('NSUserTrackingUsageDescription' in (config.ios?.infoPlist ?? {}), false);
  });

  it('policy preserves unrelated query schemes and SKAdNetwork IDs', () => {
    const plist = applyNearsyFacebookInfoPlistPolicy({
      LSApplicationQueriesSchemes: ['comgooglemaps', 'fbauth2', 'fbapi'],
      SKAdNetworkItems: [
        { SKAdNetworkIdentifier: 'v9wttpbfk9.skadnetwork' },
        { SKAdNetworkIdentifier: 'other.skadnetwork' },
      ],
      NSUserTrackingUsageDescription: 'tracking',
      FacebookAutoLogAppEventsEnabled: true,
    });
    assert.deepEqual(plist.LSApplicationQueriesSchemes, [
      'comgooglemaps',
      'fbapi',
      'fb-messenger-share-api',
    ]);
    assert.deepEqual(plist.SKAdNetworkItems, [
      { SKAdNetworkIdentifier: 'other.skadnetwork' },
    ]);
    assert.equal(plist.FacebookAutoLogAppEventsEnabled, false);
    assert.equal('NSUserTrackingUsageDescription' in plist, false);
  });
});

describe('app.config.js Facebook wiring', () => {
  const productionEnv = {
    EXPO_PUBLIC_NEARSY_FIREBASE_ENV: 'production',
    EXPO_PUBLIC_LOGO_DEV_PUBLISHABLE_KEY: 'pk_test_fake_for_unit_tests',
    FIREBASE_APP_CHECK_DEBUG_TOKEN: '',
  };

  it('registers the Nearsy Facebook plugin with env-derived props', () => {
    const config = loadAppConfig({ ...productionEnv, ...validEnv() });
    const entry = config.plugins.find(
      (plugin) => Array.isArray(plugin) && plugin[0] === './plugins/withNearsyFacebookAuth',
    );
    assert.ok(entry, 'withNearsyFacebookAuth plugin missing');
    assert.equal(entry[1].appID, CONTRACT_APP_ID);
    assert.equal(entry[1].autoLogAppEventsEnabled, false);
    assert.equal(entry[1].advertiserIDCollectionEnabled, false);
    assert.equal(config.extra[FACEBOOK_APP_ID_ENV], CONTRACT_APP_ID);
    assert.equal(
      JSON.stringify(config.extra).includes(FAKE_CLIENT_TOKEN),
      false,
      'client token must not be exposed through extra',
    );
    assert.equal(
      config.plugins.some((plugin) =>
        (Array.isArray(plugin) ? plugin[0] : plugin) === 'react-native-fbsdk-next',
      ),
      false,
      'fbsdk must only be applied through the Nearsy wrapper',
    );
    assert.equal(
      config.plugins.some((plugin) =>
        String(Array.isArray(plugin) ? plugin[0] : plugin).includes('tracking-transparency'),
      ),
      false,
    );
  });

  it('refuses to evaluate without the Facebook Client Token', () => {
    assert.throws(
      () =>
        loadAppConfig({
          ...productionEnv,
          ...validEnv({ [FACEBOOK_CLIENT_TOKEN_ENV]: '' }),
        }),
      new RegExp(FACEBOOK_CLIENT_TOKEN_ENV),
    );
  });

  it('EAS Build refuses to evaluate without Facebook env', () => {
    assert.throws(
      () =>
        loadAppConfig({
          ...productionEnv,
          EAS_BUILD: 'true',
          [FACEBOOK_APP_ID_ENV]: '',
          [FACEBOOK_CLIENT_TOKEN_ENV]: '',
        }),
      new RegExp(`Missing required environment variable: ${FACEBOOK_APP_ID_ENV}`),
    );
  });

  it('local eas-cli parent evaluation without Facebook env skips the plugin instead of failing', () => {
    const config = loadAppConfig({
      ...productionEnv,
      EAS_BUILD: '',
      [FACEBOOK_APP_ID_ENV]: '',
      [FACEBOOK_CLIENT_TOKEN_ENV]: '',
    });
    assert.equal(
      config.plugins.some(
        (plugin) => Array.isArray(plugin) && plugin[0] === './plugins/withNearsyFacebookAuth',
      ),
      false,
    );
    assert.equal(FACEBOOK_APP_ID_ENV in config.extra, false);
  });

  it('development config always requires Facebook env; secrets are always rejected', () => {
    assert.throws(
      () => resolveFacebookAuthEnvForConfig({}, { isDevelopment: true }),
      new RegExp(FACEBOOK_APP_ID_ENV),
    );
    assert.equal(resolveFacebookAuthEnvForConfig({}, { isDevelopment: false }), null);
    assert.throws(
      () =>
        resolveFacebookAuthEnvForConfig(
          { EXPO_PUBLIC_META_APP_SECRET: 'fake-secret-value' },
          { isDevelopment: false },
        ),
      /must never be exposed to the mobile client/,
    );
    assert.deepEqual(
      resolveFacebookAuthEnvForConfig(validEnv(), { isDevelopment: true }),
      { appID: CONTRACT_APP_ID, clientToken: FAKE_CLIENT_TOKEN },
    );
  });
});

describe('No hardcoded Facebook credentials in source', () => {
  const SOURCE_ROOTS = [
    path.join(APP_ROOT, 'app.config.js'),
    path.join(APP_ROOT, 'app.json'),
    path.join(APP_ROOT, 'eas.json'),
    path.join(APP_ROOT, 'plugins'),
    path.join(APP_ROOT, 'scripts'),
    path.join(REPO_ROOT, 'packages', 'shared', 'src'),
  ];

  function listFiles(target) {
    if (!fs.existsSync(target)) return [];
    const stat = fs.statSync(target);
    if (stat.isFile()) return [target];
    return fs.readdirSync(target).flatMap((name) => {
      if (name === 'node_modules' || name === '__tests__') return [];
      return listFiles(path.join(target, name));
    });
  }

  it('App ID only comes from env and no App Secret / Client Token literal exists', () => {
    const files = SOURCE_ROOTS.flatMap(listFiles).filter((file) =>
      /\.(c?js|tsx?|json)$/.test(file),
    );
    assert.ok(files.length > 0);
    for (const file of files) {
      const source = fs.readFileSync(file, 'utf8');
      assert.equal(
        source.includes(CONTRACT_APP_ID),
        false,
        `Meta App ID hardcoded in ${path.relative(REPO_ROOT, file)}`,
      );
      assert.doesNotMatch(
        source,
        /FacebookClientToken['"]?\s*[:=]\s*['"][A-Za-z0-9]{16,}/,
        `Client Token literal in ${path.relative(REPO_ROOT, file)}`,
      );
      assert.doesNotMatch(
        source,
        /app_?secret['"]?\s*[:=]\s*['"][A-Za-z0-9]{16,}/i,
        `App Secret literal in ${path.relative(REPO_ROOT, file)}`,
      );
    }
  });
});

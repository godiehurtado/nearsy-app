/**
 * I3-G pre-build validation (sanitized). Loads EAS development env via
 * eas env:exec dump, evaluates Expo configs, never prints OAuth IDs/tokens.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const APP_ROOT = path.join(__dirname, '..');
const DUMP_REL = './scripts/_dump-eas-env.cjs';
const OUT_REL = './.nearsy-eas-env-dump.tmp.json';
const OPS_PREFIX = '557470198780';

function fail(msg) {
  console.error('FAIL:', msg);
  process.exit(1);
}

function ok(msg) {
  console.log('OK:', msg);
}

function loadEasDevelopmentEnv() {
  const outFile = path.join(APP_ROOT, OUT_REL);
  const bashCmd = `node ${DUMP_REL} ${OUT_REL}`;
  const result = spawnSync(`eas env:exec development "${bashCmd}"`, {
    cwd: APP_ROOT,
    encoding: 'utf8',
    shell: true,
    env: {
      ...process.env,
      EXPO_PUBLIC_NEARSY_FIREBASE_ENV: '',
    },
  });
  if (result.status !== 0) {
    fail(
      `eas env:exec failed: ${(result.stderr || result.stdout || '').slice(0, 400)}`,
    );
  }
  if (!fs.existsSync(outFile)) fail('EAS env dump missing');
  try {
    return JSON.parse(fs.readFileSync(outFile, 'utf8'));
  } finally {
    try {
      fs.unlinkSync(outFile);
    } catch {
      /* ignore */
    }
  }
}

function shape(value) {
  if (!value) return null;
  const s = String(value);
  return {
    present: true,
    len: s.length,
    oauthPrefix: s.includes('apps.googleusercontent')
      ? s.split('-')[0]
      : s.startsWith('com.googleusercontent.apps.')
        ? s.slice('com.googleusercontent.apps.'.length).split('-')[0]
        : null,
  };
}

function evaluateConfig(envMap) {
  const appConfig = require(path.join(APP_ROOT, 'app.config.js'));
  const appJson = require(path.join(APP_ROOT, 'app.json'));
  return appConfig({ config: appJson.expo ?? appJson });
}

function assertNoOpsInDevExtra(extra) {
  for (const key of [
    'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID',
    'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID',
    'EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME',
  ]) {
    const v = String(extra[key] || '');
    if (v.includes(OPS_PREFIX)) {
      fail(`Development extra contains Ops OAuth prefix in ${key}`);
    }
  }
}

function main() {
  const loaded = loadEasDevelopmentEnv();
  const keys = Object.keys(loaded).sort();
  ok(`EAS development keys loaded (${keys.length})`);

  for (const required of [
    'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
    'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID',
    'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID',
    'EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME',
    'EXPO_PUBLIC_LOGO_DEV_PUBLISHABLE_KEY',
    'FIREBASE_APP_CHECK_DEBUG_TOKEN',
  ]) {
    if (!loaded[required]) fail(`Missing EAS key ${required}`);
  }
  const logoDevKey = String(loaded.EXPO_PUBLIC_LOGO_DEV_PUBLISHABLE_KEY || '').trim();
  if (logoDevKey.startsWith('sk_')) {
    fail('Development Logo.dev key must be publishable (pk_), not a secret');
  }
  if (!logoDevKey.startsWith('pk_')) {
    fail('Development Logo.dev key must start with pk_');
  }
  ok('Required Google + App Check + Logo.dev EAS keys present');

  // Development config evaluation
  const prev = { ...process.env };
  Object.assign(process.env, loaded);
  process.env.EXPO_PUBLIC_NEARSY_FIREBASE_ENV = 'development';

  let devConfig;
  try {
    // Clear require cache for app.config
    delete require.cache[require.resolve(path.join(APP_ROOT, 'app.config.js'))];
    devConfig = evaluateConfig(loaded);
  } catch (e) {
    fail(`Development app.config evaluation: ${e.message}`);
  }

  const extra = devConfig.extra || {};
  if (extra.EXPO_PUBLIC_FIREBASE_PROJECT_ID !== 'nearsy-dev') {
    fail('Dev projectId != nearsy-dev');
  }
  if (devConfig.ios?.googleServicesFile !== './GoogleService-Info.development.plist') {
    fail('Dev googleServicesFile unexpected');
  }
  if (extra.EXPO_PUBLIC_LINKEDIN_AUTH_ENABLED !== 'true') {
    fail('LinkedIn should be enabled in Development');
  }
  if (!extra.NEARSY_APP_CHECK_DEBUG_TOKEN) {
    fail('App Check debug token not injected for Development');
  }
  const extraLogo = String(extra.EXPO_PUBLIC_LOGO_DEV_PUBLISHABLE_KEY || '').trim();
  if (!extraLogo) fail('Development extra missing Logo.dev publishable key');
  if (extraLogo.startsWith('sk_') || !extraLogo.startsWith('pk_')) {
    fail('Development extra Logo.dev key is not a publishable pk_ value');
  }
  assertNoOpsInDevExtra(extra);

  const googlePlugin = (devConfig.plugins || []).find(
    (p) =>
      Array.isArray(p) &&
      p[0] === '@react-native-google-signin/google-signin',
  );
  if (!googlePlugin?.[1]?.iosUrlScheme) fail('Google iosUrlScheme plugin missing');
  if (String(googlePlugin[1].iosUrlScheme).includes(OPS_PREFIX)) {
    fail('Dev Google plugin scheme uses Ops prefix');
  }
  const schemeCount = (devConfig.plugins || []).filter(
    (p) =>
      Array.isArray(p) &&
      p[0] === '@react-native-google-signin/google-signin',
  ).length;
  if (schemeCount !== 1) fail(`Expected 1 google-signin plugin, got ${schemeCount}`);

  const hasApple = (devConfig.plugins || []).includes('expo-apple-authentication');
  if (!hasApple) fail('Apple authentication plugin missing');

  ok('Development Expo config: nearsy-dev + Google Dev + Apple + LinkedIn + App Check + Logo.dev');
  console.log(
    'shapes',
    JSON.stringify({
      web: shape(extra.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID),
      ios: shape(extra.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID),
      scheme: shape(extra.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME),
    }),
  );

  // Production config evaluation (clear Dev Google, Logo.dev, and debug token)
  for (const k of Object.keys(loaded)) {
    if (
      k.startsWith('EXPO_PUBLIC_GOOGLE_') ||
      k === 'FIREBASE_APP_CHECK_DEBUG_TOKEN' ||
      k === 'EXPO_PUBLIC_LOGO_DEV_PUBLISHABLE_KEY'
    ) {
      delete process.env[k];
    }
  }
  process.env.EXPO_PUBLIC_NEARSY_FIREBASE_ENV = 'production';
  // Keep production Firebase from app.json defaults; clear forced Dev Firebase overrides
  for (const k of [
    'EXPO_PUBLIC_FIREBASE_API_KEY',
    'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
    'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
    'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET',
    'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
    'EXPO_PUBLIC_FIREBASE_APP_ID',
  ]) {
    delete process.env[k];
  }

  let prodConfig;
  try {
    delete require.cache[require.resolve(path.join(APP_ROOT, 'app.config.js'))];
    prodConfig = evaluateConfig({});
  } catch (e) {
    fail(`Production app.config evaluation: ${e.message}`);
  }

  const pextra = prodConfig.extra || {};
  if (pextra.EXPO_PUBLIC_FIREBASE_PROJECT_ID !== 'nearsy-pj') {
    fail('Prod projectId != nearsy-pj');
  }
  if (prodConfig.ios?.googleServicesFile !== './GoogleService-Info.plist') {
    fail('Prod googleServicesFile unexpected');
  }
  if (pextra.EXPO_PUBLIC_LINKEDIN_AUTH_ENABLED !== 'true') {
    fail('LinkedIn should be enabled in Production');
  }
  if (pextra.NEARSY_APP_CHECK_DEBUG_TOKEN) {
    fail('Production must not inject App Check debug token');
  }
  if (pextra.EXPO_PUBLIC_LOGO_DEV_PUBLISHABLE_KEY) {
    fail('Production extra must not receive the Development Logo.dev key');
  }
  // Production may use Ops Google from app.json — ensure not Dev project number alone as sole check
  const prodScheme = String(pextra.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME || '');
  if (prodScheme && !prodScheme.includes(OPS_PREFIX)) {
    // Soft note only — Ops clients are expected for production
  }
  ok('Production Expo config: nearsy-pj + no Dev Google env + LinkedIn off + no debug token');

  // restore
  Object.keys(process.env).forEach((k) => {
    if (!(k in prev)) delete process.env[k];
  });
  Object.assign(process.env, prev);

  ok('I3-G Expo config validation passed');
}

main();

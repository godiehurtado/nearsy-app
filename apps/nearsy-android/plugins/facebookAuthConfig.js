/**
 * Facebook Login native config for app.config.js (ENH-AUTH-FB-01, Android).
 *
 * App ID and Client Token come only from the build environment. The Client
 * Token value must never be logged; diagnostics report variable names only.
 * The App Secret is server-side (Firebase Console) and never belongs here.
 */
const FACEBOOK_APP_ID_ENV = 'EXPO_PUBLIC_FACEBOOK_APP_ID';
const FACEBOOK_CLIENT_TOKEN_ENV = 'EXPO_PUBLIC_FACEBOOK_CLIENT_TOKEN';
const FACEBOOK_DISPLAY_NAME = 'Nearsy';
const FACEBOOK_PRIVACY_PLUGIN = './plugins/withFacebookPrivacyHardening';
const FACEBOOK_SDK_VERSION_PLUGIN = './plugins/withFacebookAndroidSdkVersion';

/**
 * Always listed: the Facebook SDK AAR is autolinked even when Login is
 * unconfigured, so privacy hardening and the SDK version pin must apply.
 */
const FACEBOOK_STATIC_PLUGINS = [
  FACEBOOK_PRIVACY_PLUGIN,
  FACEBOOK_SDK_VERSION_PLUGIN,
];

const APP_ID_PATTERN = /^\d{10,20}$/;
const CLIENT_TOKEN_PATTERN = /^[a-f0-9]{32}$/i;

/** @param {Record<string, string | undefined>} env @param {string} name */
function readEnv(env, name) {
  return String(env[name] || '').trim();
}

/**
 * @param {Record<string, string | undefined>} [env]
 * @returns {{ configured: true, appId: string, clientToken: string, issues: string[] } | { configured: false, issues: string[] }}
 */
function resolveFacebookAuthConfig(env = process.env) {
  const appId = readEnv(env, FACEBOOK_APP_ID_ENV);
  const clientToken = readEnv(env, FACEBOOK_CLIENT_TOKEN_ENV);
  const issues = [];

  if (!appId) {
    issues.push(`${FACEBOOK_APP_ID_ENV} missing`);
  } else if (!APP_ID_PATTERN.test(appId)) {
    issues.push(`${FACEBOOK_APP_ID_ENV} invalid format`);
  }

  if (!clientToken) {
    issues.push(`${FACEBOOK_CLIENT_TOKEN_ENV} missing`);
  } else if (!CLIENT_TOKEN_PATTERN.test(clientToken)) {
    issues.push(`${FACEBOOK_CLIENT_TOKEN_ENV} invalid format`);
  }

  if (issues.length > 0) {
    return { configured: false, issues };
  }
  return { configured: true, appId, clientToken, issues };
}

/**
 * react-native-fbsdk-next config plugin props, or null when unconfigured.
 * @param {ReturnType<typeof resolveFacebookAuthConfig>} resolution
 */
function buildFacebookPluginProps(resolution) {
  if (!resolution.configured) return null;
  return {
    appID: resolution.appId,
    clientToken: resolution.clientToken,
    displayName: FACEBOOK_DISPLAY_NAME,
    scheme: `fb${resolution.appId}`,
    isAutoInitEnabled: false,
    autoLogAppEventsEnabled: false,
    advertiserIDCollectionEnabled: false,
    iosUserTrackingPermission: false,
  };
}

/**
 * Applies the Facebook config plugin directly instead of listing it in
 * `plugins`: listed plugin props are serialized into the public Expo config
 * (dev manifest, embedded app.config), which would duplicate the Client
 * Token outside the native resources. Mods are stripped from public config.
 * @param {Record<string, any>} expoConfig
 * @param {ReturnType<typeof resolveFacebookAuthConfig>} resolution
 */
function withNearsyFacebookAuth(expoConfig, resolution) {
  const props = buildFacebookPluginProps(resolution);
  if (!props) return expoConfig;
  // eslint-disable-next-line global-require
  const pluginModule = require('react-native-fbsdk-next/app.plugin');
  const withFacebook = pluginModule.default ?? pluginModule;
  return withFacebook(expoConfig, props);
}

module.exports = {
  FACEBOOK_APP_ID_ENV,
  FACEBOOK_CLIENT_TOKEN_ENV,
  FACEBOOK_DISPLAY_NAME,
  FACEBOOK_PRIVACY_PLUGIN,
  FACEBOOK_SDK_VERSION_PLUGIN,
  FACEBOOK_STATIC_PLUGINS,
  resolveFacebookAuthConfig,
  buildFacebookPluginProps,
  withNearsyFacebookAuth,
};

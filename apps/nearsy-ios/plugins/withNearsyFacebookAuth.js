/**
 * Expo config plugin — ENH-AUTH-FB-01 Facebook Login (iOS).
 *
 * Wraps react-native-fbsdk-next so the effective Info.plist is canonical after
 * `expo prebuild --clean`:
 * - FacebookAppID / FacebookClientToken / FacebookDisplayName / fb{APP_ID} scheme
 * - FacebookAutoInitEnabled, FacebookAutoLogAppEventsEnabled,
 *   FacebookAdvertiserIDCollectionEnabled = false
 * - LSApplicationQueriesSchemes: exactly fbapi + fb-messenger-share-api for Facebook
 * - no SKAdNetwork ad-attribution IDs and no NSUserTrackingUsageDescription (no ATT)
 */
const { withInfoPlist, createRunOncePlugin } = require('@expo/config-plugins');
const fbsdkPlugin = require('react-native-fbsdk-next/app.plugin');

const withFacebook = fbsdkPlugin.default ?? fbsdkPlugin;

const {
  FACEBOOK_QUERY_SCHEMES,
  FACEBOOK_NON_CONTRACT_QUERY_SCHEMES,
  FACEBOOK_SKADNETWORK_IDENTIFIERS,
  resolveFacebookAuthEnv,
} = require('../scripts/facebookAuthConfig.cjs');

/**
 * @param {Record<string, any>} infoPlist
 * @returns {Record<string, any>}
 */
function applyNearsyFacebookInfoPlistPolicy(infoPlist) {
  const next = { ...infoPlist };

  const existing = Array.isArray(next.LSApplicationQueriesSchemes)
    ? next.LSApplicationQueriesSchemes
    : [];
  const kept = existing.filter(
    (scheme) =>
      !FACEBOOK_NON_CONTRACT_QUERY_SCHEMES.includes(scheme) &&
      !FACEBOOK_QUERY_SCHEMES.includes(scheme),
  );
  next.LSApplicationQueriesSchemes = [...kept, ...FACEBOOK_QUERY_SCHEMES];

  next.FacebookAutoInitEnabled = false;
  next.FacebookAutoLogAppEventsEnabled = false;
  next.FacebookAdvertiserIDCollectionEnabled = false;

  delete next.NSUserTrackingUsageDescription;

  return stripFacebookSKAdNetworkItems(next);
}

/**
 * @param {Record<string, any>} infoPlist
 * @returns {Record<string, any>}
 */
function stripFacebookSKAdNetworkItems(infoPlist) {
  if (!Array.isArray(infoPlist.SKAdNetworkItems)) return infoPlist;
  const next = { ...infoPlist };
  const remaining = infoPlist.SKAdNetworkItems.filter(
    (item) =>
      !FACEBOOK_SKADNETWORK_IDENTIFIERS.includes(
        String(item?.SKAdNetworkIdentifier ?? '').toLowerCase(),
      ),
  );
  if (remaining.length === 0) {
    delete next.SKAdNetworkItems;
  } else {
    next.SKAdNetworkItems = remaining;
  }
  return next;
}

/**
 * @param {import('@expo/config-plugins').ExportedConfig} config
 * @param {Record<string, unknown>} props Output of buildFacebookPluginProps.
 * @param {Record<string, string | undefined>} [env]
 */
function withNearsyFacebookAuth(config, props, env = process.env) {
  // The Client Token is read here rather than passed as a plugin prop: plugin
  // props are part of the public Expo config (Metro manifest / embedded app
  // config), while this value only belongs in the native Info.plist.
  const { appID, clientToken } = resolveFacebookAuthEnv(env);
  if (props?.appID !== appID) {
    throw new Error(
      '[withNearsyFacebookAuth] Plugin appID does not match EXPO_PUBLIC_FACEBOOK_APP_ID.',
    );
  }

  // Mods run last-registered-first: registering this Info.plist mod before the
  // fbsdk plugin makes it run after fbsdk's Info.plist mod.
  config = withInfoPlist(config, (cfg) => {
    cfg.modResults = applyNearsyFacebookInfoPlistPolicy(cfg.modResults);
    return cfg;
  });

  config = withFacebook(config, {
    ...props,
    clientToken,
    iosUserTrackingPermission: false,
  });

  // fbsdk writes SKAdNetworkItems / tracking copy into static ios.infoPlist.
  if (config.ios?.infoPlist) {
    const staticPlist = stripFacebookSKAdNetworkItems(config.ios.infoPlist);
    delete staticPlist.NSUserTrackingUsageDescription;
    config.ios = { ...config.ios, infoPlist: staticPlist };
  }

  return config;
}

module.exports = createRunOncePlugin(
  withNearsyFacebookAuth,
  'withNearsyFacebookAuth',
  '1.0.0',
);
module.exports.applyNearsyFacebookInfoPlistPolicy = applyNearsyFacebookInfoPlistPolicy;
module.exports.stripFacebookSKAdNetworkItems = stripFacebookSKAdNetworkItems;

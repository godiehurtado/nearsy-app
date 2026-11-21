/**
 * Autolinking overrides for the iOS app.
 *
 * react-native-appsflyer is linked only in builds that switch AppsFlyer on
 * (NEARSY_APPSFLYER_ENABLED=true). Every other binary ships without its native
 * code, pods or privacy manifest. The JS layer never loads the package when off.
 */
const { resolveAppsFlyerBuildConfig } = require('./scripts/appsFlyerBuildConfig.cjs');

const appsFlyer = resolveAppsFlyerBuildConfig(process.env);

module.exports = {
  dependencies: {
    ...(appsFlyer.enabled
      ? {}
      : { 'react-native-appsflyer': { platforms: { ios: null, android: null } } }),
  },
};

/**
 * AppsFlyer is linked natively only when the build enables it
 * (NEARSY_APPSFLYER_ENABLED=true, read at prebuild and Gradle time like
 * app.config.js). A disabled build carries no AppsFlyer SDK, permissions or
 * backup rules, so it stays identical to builds before the integration. The JS
 * binding requires the module only after the same flag is checked at runtime.
 */
const appsFlyerEnabled =
  String(process.env.NEARSY_APPSFLYER_ENABLED || '')
    .trim()
    .toLowerCase() === 'true';

module.exports = {
  dependencies: appsFlyerEnabled
    ? {}
    : {
        'react-native-appsflyer': {
          platforms: { android: null, ios: null },
        },
      },
};

const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * ENH-AUTH-FB-01: Nearsy uses Facebook only for Login. The Facebook Android
 * SDK (and play-services-ads-identifier) merge advertising-related
 * permissions into the final manifest; strip them so no advertising ID or
 * AdServices attribution is available to the app. react-native-fbsdk-next
 * also declares the AdServices config property on <application>.
 */
const REMOVED_PERMISSIONS = [
  'com.google.android.gms.permission.AD_ID',
  'android.permission.ACCESS_ADSERVICES_AD_ID',
  'android.permission.ACCESS_ADSERVICES_ATTRIBUTION',
  'android.permission.ACCESS_ADSERVICES_TOPICS',
  'android.permission.ACCESS_ADSERVICES_CUSTOM_AUDIENCE',
];

const REMOVED_APPLICATION_PROPERTIES = ['android.adservices.AD_SERVICES_CONFIG'];

const TOOLS_NAMESPACE = 'http://schemas.android.com/tools';

/** @param {any} manifest */
function applyFacebookPrivacyHardening(manifest) {
  const root = manifest.manifest;
  root.$ = root.$ || {};
  root.$['xmlns:tools'] = TOOLS_NAMESPACE;

  const existing = Array.isArray(root['uses-permission'])
    ? root['uses-permission']
    : [];
  const kept = existing.filter(
    (entry) => !REMOVED_PERMISSIONS.includes(entry?.$?.['android:name']),
  );
  const removals = REMOVED_PERMISSIONS.map((name) => ({
    $: { 'android:name': name, 'tools:node': 'remove' },
  }));
  root['uses-permission'] = [...kept, ...removals];

  const application = Array.isArray(root.application) ? root.application[0] : null;
  if (application) {
    const properties = Array.isArray(application.property)
      ? application.property
      : [];
    const keptProperties = properties.filter(
      (entry) => !REMOVED_APPLICATION_PROPERTIES.includes(entry?.$?.['android:name']),
    );
    const propertyRemovals = REMOVED_APPLICATION_PROPERTIES.map((name) => ({
      $: { 'android:name': name, 'tools:node': 'remove' },
    }));
    application.property = [...keptProperties, ...propertyRemovals];
  }
  return manifest;
}

function withFacebookPrivacyHardening(config) {
  return withAndroidManifest(config, (manifestConfig) => {
    manifestConfig.modResults = applyFacebookPrivacyHardening(
      manifestConfig.modResults,
    );
    return manifestConfig;
  });
}

module.exports = withFacebookPrivacyHardening;
module.exports.REMOVED_PERMISSIONS = REMOVED_PERMISSIONS;
module.exports.REMOVED_APPLICATION_PROPERTIES = REMOVED_APPLICATION_PROPERTIES;
module.exports.applyFacebookPrivacyHardening = applyFacebookPrivacyHardening;

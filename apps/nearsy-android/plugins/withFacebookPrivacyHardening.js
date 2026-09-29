const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * ENH-AUTH-FB-01: Nearsy uses Facebook only for Login. The Facebook Android
 * SDK (and play-services-ads-identifier) merge advertising-related
 * permissions into the final manifest; strip them so no advertising ID or
 * AdServices attribution is available to the app.
 */
const REMOVED_PERMISSIONS = [
  'com.google.android.gms.permission.AD_ID',
  'android.permission.ACCESS_ADSERVICES_AD_ID',
  'android.permission.ACCESS_ADSERVICES_ATTRIBUTION',
  'android.permission.ACCESS_ADSERVICES_TOPICS',
];

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
module.exports.applyFacebookPrivacyHardening = applyFacebookPrivacyHardening;

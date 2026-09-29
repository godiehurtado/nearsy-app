const { withProjectBuildGradle } = require('@expo/config-plugins');

/**
 * react-native-fbsdk-next 13.4.3 (android/build.gradle) depends on
 * `facebook-android-sdk:${safeExtGet('facebookSdkVersion', '18.+')}`, read
 * from rootProject.ext. Pin the exact version Gradle resolves for 18.+ so
 * builds are reproducible; bump deliberately together with the library.
 */
const FACEBOOK_ANDROID_SDK_VERSION = '18.3.0';
const MARKER = 'NEARSY_FACEBOOK_SDK_VERSION';
const EXT_LINE_PATTERN = /^ext\.facebookSdkVersion\s*=.*$/m;

/** @param {string} contents */
function applyFacebookAndroidSdkVersion(contents) {
  const next = contents.replace(/\r\n/g, '\n');
  const line = `ext.facebookSdkVersion = "${FACEBOOK_ANDROID_SDK_VERSION}"`;
  if (EXT_LINE_PATTERN.test(next)) {
    return next.replace(EXT_LINE_PATTERN, line);
  }
  return `${next.replace(/\n*$/, '\n')}\n// ${MARKER}: pins react-native-fbsdk-next facebookSdkVersion (library default 18.+).\n${line}\n`;
}

function withFacebookAndroidSdkVersion(config) {
  return withProjectBuildGradle(config, (gradleConfig) => {
    if (gradleConfig.modResults.language !== 'groovy') {
      throw new Error(
        '[withFacebookAndroidSdkVersion] Expected a Groovy root build.gradle.',
      );
    }
    gradleConfig.modResults.contents = applyFacebookAndroidSdkVersion(
      gradleConfig.modResults.contents,
    );
    return gradleConfig;
  });
}

module.exports = withFacebookAndroidSdkVersion;
module.exports.FACEBOOK_ANDROID_SDK_VERSION = FACEBOOK_ANDROID_SDK_VERSION;
module.exports.applyFacebookAndroidSdkVersion = applyFacebookAndroidSdkVersion;

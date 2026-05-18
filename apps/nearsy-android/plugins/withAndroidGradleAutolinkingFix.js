const { withAppBuildGradle, withSettingsGradle } = require('@expo/config-plugins');

const EXPO_AUTOLINKING_BLOCK = `extensions.configure(com.facebook.react.ReactSettingsExtension) { ex ->
  if (System.getenv('EXPO_USE_COMMUNITY_AUTOLINKING') == '1') {
    ex.autolinkLibrariesFromCommand()
  } else {
    ex.autolinkLibrariesFromCommand(expoAutolinking.rnConfigCommand)
  }
}`;

const COMMUNITY_AUTOLINKING_BLOCK = `extensions.configure(com.facebook.react.ReactSettingsExtension) { ex ->
  // Community autolinking resolves RN library Android sourceDir values correctly
  // for this pnpm workspace; Expo autolinking still handles Expo modules below.
  ex.autolinkLibrariesFromCommand()
}`;

const RESOLVE_EXPO_CLI_LINE =
  `    cliFile = new File(["node", "--print", "require.resolve('@expo/cli', { paths: [require.resolve('expo/package.json')] })"].execute(null, rootDir).text.trim())`;

const WRAPPED_EXPO_CLI_LINE =
  '    cliFile = file("$projectRoot/scripts/expo-cli-no-workspace-root.js")';

const RESOLVE_ENTRY_LINE =
  `    entryFile = file(["node", "-e", "require('expo/scripts/resolveAppEntry')", projectRoot, "android", "absolute"].execute(null, rootDir).text.trim())`;

const FIXED_ENTRY_LINES = `    root = file(projectRoot)
    entryFile = file("$projectRoot/index.ts")`;

function replaceOrThrow(contents, before, after, fileName) {
  if (contents.includes(after)) {
    return contents;
  }

  if (!contents.includes(before)) {
    throw new Error(`Unable to apply Android Gradle autolinking fix to ${fileName}. Expected template block was not found.`);
  }

  return contents.replace(before, after);
}

function withAndroidGradleAutolinkingFix(config) {
  config = withSettingsGradle(config, (settingsConfig) => {
    settingsConfig.modResults.contents = replaceOrThrow(
      settingsConfig.modResults.contents,
      EXPO_AUTOLINKING_BLOCK,
      COMMUNITY_AUTOLINKING_BLOCK,
      'settings.gradle'
    );
    return settingsConfig;
  });

  config = withAppBuildGradle(config, (appBuildConfig) => {
    let contents = replaceOrThrow(
      appBuildConfig.modResults.contents,
      RESOLVE_ENTRY_LINE,
      FIXED_ENTRY_LINES,
      'app/build.gradle'
    );

    contents = replaceOrThrow(
      contents,
      RESOLVE_EXPO_CLI_LINE,
      WRAPPED_EXPO_CLI_LINE,
      'app/build.gradle'
    );

    appBuildConfig.modResults.contents = contents;
    return appBuildConfig;
  });

  return config;
}

module.exports = withAndroidGradleAutolinkingFix;

const { withAppBuildGradle, withSettingsGradle } = require('@expo/config-plugins');

const LOG_PREFIX = '[withAndroidGradleAutolinkingFix]';

const PATCH_MARKER = 'NEARSY_COMMUNITY_AUTOLINKING';

const COMMUNITY_AUTOLINKING_BLOCK = `extensions.configure(com.facebook.react.ReactSettingsExtension) { ex ->
  // ${PATCH_MARKER}: community RN autolinking for pnpm workspace; Expo modules still autolink below.
  ex.autolinkLibrariesFromCommand()
}`;

const WRAPPED_EXPO_CLI_LINE =
  '    cliFile = file("$projectRoot/scripts/expo-cli-no-workspace-root.js")';

const FIXED_ENTRY_LINES = `    root = file(projectRoot)
    entryFile = file("$projectRoot/index.ts")`;

/** @param {string} contents */
function normalizeEol(contents) {
  return contents.replace(/\r\n/g, '\n');
}

/** @param {string} contents @param {number} index */
function snippetAround(contents, index, radius = 240) {
  const start = Math.max(0, index - radius);
  const end = Math.min(contents.length, index + radius);
  return contents.slice(start, end);
}

/**
 * @param {string} contents
 * @param {string} fileName
 */
function patchSettingsGradle(contents, fileName) {
  let next = normalizeEol(contents);

  if (next.includes(PATCH_MARKER)) {
    if (next.includes('rnConfigCommand')) {
      throw new Error(
        `${LOG_PREFIX} ${fileName} contains ${PATCH_MARKER} but still uses expoAutolinking.rnConfigCommand.`,
      );
    }
    console.log(`${LOG_PREFIX} ${fileName} already patched (${PATCH_MARKER} present).`);
    return next;
  }

  if (!next.includes('ReactSettingsExtension')) {
    console.error(
      `${LOG_PREFIX} ${fileName} replacement target not found: ReactSettingsExtension block missing.`,
    );
    throw new Error(
      `${LOG_PREFIX} Unable to patch ${fileName}: ReactSettingsExtension block missing.`,
    );
  }

  const patterns = [
    {
      name: 'expo-if-else-autolinking-block',
      regex:
        /extensions\.configure\(com\.facebook\.react\.ReactSettingsExtension\)\s*\{\s*ex\s*->\s*if\s*\(System\.getenv\('EXPO_USE_COMMUNITY_AUTOLINKING'\)\s*==\s*'1'\)\s*\{[\s\S]*?\}\s*else\s*\{[\s\S]*?\}\s*\}/,
    },
    {
      name: 'expo-rnConfigCommand-configure-block',
      regex:
        /extensions\.configure\(com\.facebook\.react\.ReactSettingsExtension\)\s*\{\s*ex\s*->[\s\S]*?rnConfigCommand[\s\S]*?\}/,
    },
  ];

  let patched = false;

  for (const { name, regex } of patterns) {
    if (!regex.test(next)) {
      continue;
    }

    const updated = next.replace(regex, COMMUNITY_AUTOLINKING_BLOCK);
    if (updated !== next) {
      next = updated;
      patched = true;
      console.log(`${LOG_PREFIX} ${fileName} patch applied (${name}).`);
      break;
    }
  }

  if (!patched && next.includes('rnConfigCommand')) {
    const linePatched = next.replace(
      /ex\.autolinkLibrariesFromCommand\(\s*expoAutolinking\.rnConfigCommand\s*\)/g,
      'ex.autolinkLibrariesFromCommand()',
    );

    if (linePatched !== next) {
      next = linePatched;
      patched = true;
      console.log(
        `${LOG_PREFIX} ${fileName} patch applied (rnConfigCommand line replacement).`,
      );
    }
  }

  if (
    !patched &&
    next.includes('ex.autolinkLibrariesFromCommand()') &&
    !next.includes('rnConfigCommand')
  ) {
    console.log(
      `${LOG_PREFIX} ${fileName} already uses community autolinking (no rnConfigCommand).`,
    );
    return next;
  }

  if (!patched || next.includes('rnConfigCommand')) {
    const idx = next.indexOf('ReactSettingsExtension');
    console.error(
      `${LOG_PREFIX} ${fileName} replacement target not found or patch incomplete.`,
    );
    console.error(snippetAround(next, idx >= 0 ? idx : 0));
    throw new Error(
      `${LOG_PREFIX} Unable to patch ${fileName}: expo autolinking block still present.`,
    );
  }

  if (!next.includes(PATCH_MARKER)) {
    throw new Error(
      `${LOG_PREFIX} ${fileName} patch verification failed: marker not written.`,
    );
  }

  console.log(`${LOG_PREFIX} ${fileName} patch succeeded.`);
  return next;
}

/**
 * @param {string} contents
 * @param {string} fileName
 */
function patchAppBuildGradle(contents, fileName) {
  let next = normalizeEol(contents);

  const entryAlreadyPatched =
    next.includes('entryFile = file("$projectRoot/index.ts")') &&
    /^\s*root\s*=\s*file\(projectRoot\)/m.test(next);
  const cliAlreadyPatched = next.includes(WRAPPED_EXPO_CLI_LINE.trim());

  if (entryAlreadyPatched && cliAlreadyPatched) {
    console.log(`${LOG_PREFIX} ${fileName} already patched (entryFile + cliFile).`);
    return next;
  }

  if (!entryAlreadyPatched) {
    const entryPatterns = [
      {
        name: 'resolveAppEntry-entryFile',
        regex:
          /^\s*entryFile\s*=\s*file\(\["node",\s*"-e",\s*"require\('expo\/scripts\/resolveAppEntry'\)"[\s\S]*?\)\s*$/m,
      },
      {
        name: 'generic-entryFile-line',
        regex: /^\s*entryFile\s*=\s*file\([\s\S]*?\)\s*$/m,
      },
    ];

    let entryPatched = false;
    for (const { name, regex } of entryPatterns) {
      if (!regex.test(next)) {
        continue;
      }

      const updated = next.replace(regex, FIXED_ENTRY_LINES);
      if (updated !== next) {
        next = updated;
        entryPatched = true;
        console.log(`${LOG_PREFIX} ${fileName} entryFile patch applied (${name}).`);
        break;
      }
    }

    if (!entryPatched && !entryAlreadyPatched) {
      console.error(
        `${LOG_PREFIX} ${fileName} replacement target not found: entryFile line.`,
      );
      throw new Error(
        `${LOG_PREFIX} Unable to patch ${fileName}: entryFile target not found.`,
      );
    }
  }

  if (!cliAlreadyPatched) {
    const cliPatterns = [
      {
        name: 'resolve-expo-cli-line',
        regex:
          /^\s*cliFile\s*=\s*new File\(\["node",\s*"--print",\s*"require\.resolve\('@expo\/cli'[\s\S]*?\)\s*$/m,
      },
      {
        name: 'generic-cliFile-line',
        regex: /^\s*cliFile\s*=\s*new File\([\s\S]*?\)\s*$/m,
      },
    ];

    let cliPatched = false;
    for (const { name, regex } of cliPatterns) {
      if (!regex.test(next)) {
        continue;
      }

      const updated = next.replace(regex, WRAPPED_EXPO_CLI_LINE);
      if (updated !== next) {
        next = updated;
        cliPatched = true;
        console.log(`${LOG_PREFIX} ${fileName} cliFile patch applied (${name}).`);
        break;
      }
    }

    if (!cliPatched) {
      console.error(
        `${LOG_PREFIX} ${fileName} replacement target not found: cliFile line.`,
      );
      throw new Error(
        `${LOG_PREFIX} Unable to patch ${fileName}: cliFile target not found.`,
      );
    }
  }

  if (
    !next.includes('entryFile = file("$projectRoot/index.ts")') ||
    !next.includes(WRAPPED_EXPO_CLI_LINE.trim())
  ) {
    throw new Error(
      `${LOG_PREFIX} ${fileName} patch verification failed after modifications.`,
    );
  }

  console.log(`${LOG_PREFIX} ${fileName} patch succeeded.`);
  return next;
}

function withAndroidGradleAutolinkingFix(config) {
  console.log(`${LOG_PREFIX} plugin start`);

  config = withSettingsGradle(config, (settingsConfig) => {
    settingsConfig.modResults.contents = patchSettingsGradle(
      settingsConfig.modResults.contents,
      'settings.gradle',
    );
    return settingsConfig;
  });

  config = withAppBuildGradle(config, (appBuildConfig) => {
    appBuildConfig.modResults.contents = patchAppBuildGradle(
      appBuildConfig.modResults.contents,
      'app/build.gradle',
    );
    return appBuildConfig;
  });

  console.log(`${LOG_PREFIX} plugin finished`);
  return config;
}

module.exports = withAndroidGradleAutolinkingFix;

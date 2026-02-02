// plugins/withRnFirebasePodfileFix.js
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

function ensureLine(str, line) {
  return str.includes(line) ? str : `${str}\n${line}`;
}

module.exports = function withRnFirebasePodfileFix(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(
        config.modRequest.platformProjectRoot,
        'Podfile',
      );

      if (!fs.existsSync(podfilePath)) {
        console.log(
          '[withRnFirebasePodfileFix] Podfile not found:',
          podfilePath,
        );
        return config;
      }

      let contents = fs.readFileSync(podfilePath, 'utf8');

      // 1) use_modular_headers! (antes del primer target)
      // if (!contents.includes('use_modular_headers!')) {
      //   const targetRegex = /^target\s+['"].+['"]\s+do/m;
      //   const match = contents.match(targetRegex);
      //   if (match) {
      //     contents = contents.replace(
      //       targetRegex,
      //       `use_modular_headers!\n\n${match[0]}`,
      //     );
      //     console.log(
      //       '[withRnFirebasePodfileFix] Injected use_modular_headers!',
      //     );
      //   }
      // }

      // 2) RNFirebase static frameworks (dentro del primer target)
      const targetStartRegex = /^target\s+['"].+['"]\s+do/m;
      const targetStartMatch = contents.match(targetStartRegex);

      if (targetStartMatch) {
        const hasUseFrameworksStatic =
          contents.includes('use_frameworks! :linkage => :static') ||
          contents.includes('use_frameworks!(:linkage => :static)');

        const hasRNFirebaseStaticFlag = contents.includes(
          '$RNFirebaseAsStaticFramework = true',
        );

        let injection = '';
        if (!hasUseFrameworksStatic)
          injection += `  use_frameworks! :linkage => :static\n`;
        if (!hasRNFirebaseStaticFlag)
          injection += `  $RNFirebaseAsStaticFramework = true\n`;

        if (injection) {
          contents = contents.replace(
            targetStartRegex,
            `${targetStartMatch[0]}\n${injection}`,
          );
          console.log(
            '[withRnFirebasePodfileFix] Injected static frameworks settings',
          );
        }
      }

      // 3) Fix non-modular header warnings treated as errors (RNFBApp, RNFBFirestore, etc.)
      const patchSnippet = `
  # --- RNFirebase non-modular headers fix (EAS) ---
  installer.pods_project.targets.each do |target|
    should_patch =
      target.name.start_with?('RNFB') ||
      target.name == 'React-Core' ||
      target.name.start_with?('React-') ||
      target.name.start_with?('ReactCommon')

    if should_patch
      target.build_configurations.each do |config|
        # Allow non-modular includes inside framework modules
        config.build_settings['CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES'] = 'YES'

        # Disable the warning itself
        config.build_settings['CLANG_WARN_NON_MODULAR_INCLUDE_IN_FRAMEWORK_MODULE'] = 'NO'
        config.build_settings['GCC_TREAT_WARNINGS_AS_ERRORS'] = 'NO'

        # Remove -Werror (and specific Werror variants) that make it fail anyway
        other_cflags = config.build_settings['OTHER_CFLAGS'] || '$(inherited)'
        other_cflags = other_cflags.to_s
          .gsub('-Werror=non-modular-include-in-framework-module', '')
          .gsub('-Werror', '')
          .strip

        # Ensure the suppression flag exists
        unless other_cflags.include?('-Wno-non-modular-include-in-framework-module')
          other_cflags = "\#{other_cflags} -Wno-non-modular-include-in-framework-module".strip
        end

        config.build_settings['OTHER_CFLAGS'] = other_cflags
      end
    end
  end
`;

      const hasPostInstall = /post_install do \|installer\|/.test(contents);

      if (!hasPostInstall) {
        // add a post_install at the end
        contents =
          contents.trimEnd() +
          `

post_install do |installer|
${patchSnippet}
end
`;
        console.log(
          '[withRnFirebasePodfileFix] Added post_install with RNFB fix',
        );
      } else {
        // If post_install exists, inject our snippet if not already present
        if (!contents.includes('RNFirebase non-modular headers fix')) {
          // insert right after "post_install do |installer|"
          contents = contents.replace(
            /post_install do \|installer\|\n/,
            (m) => `${m}${patchSnippet}\n`,
          );
          console.log(
            '[withRnFirebasePodfileFix] Patched existing post_install with RNFB fix',
          );
        } else {
          console.log(
            '[withRnFirebasePodfileFix] RNFB fix already present in post_install',
          );
        }
      }

      fs.writeFileSync(podfilePath, contents, 'utf8');
      return config;
    },
  ]);
};

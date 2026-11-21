/**
 * Expo config plugin: AppsFlyer/OneLink native wiring for Nearsy iOS (contract nc1).
 * Used INSTEAD of react-native-appsflyer's own plugin; see nearsyAppsFlyerCore.js.
 *
 * enabled=false (default): removes any Nearsy AppsFlyer code and asserts none is left.
 * enabled=true: Podfile strict mode + guarded continueUserActivity forward only.
 * Associated Domains are set by app.config.js (ios.associatedDomains).
 */
const { withDangerousMod, IOSConfig, createRunOncePlugin } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const {
  applySwiftAppDelegate,
  assertSwiftAppDelegate,
  applyPodfile,
} = require('./nearsyAppsFlyerCore');

const withNearsyAppsFlyer = (config, props = {}) => {
  const enabled = props.enabled === true;
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const { language, path: filePath, contents } = IOSConfig.Paths.getAppDelegate(projectRoot);
      if (language !== 'swift') {
        throw new Error(`[withNearsyAppsFlyer] Unsupported AppDelegate language: ${language}`);
      }
      const next = applySwiftAppDelegate(contents, {
        enabled,
        host: props.host,
        template: props.template,
      });
      const analysis = assertSwiftAppDelegate(next, enabled);
      await fs.promises.writeFile(filePath, next, 'utf8');

      const podfilePath = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      if (fs.existsSync(podfilePath)) {
        const podfile = fs.readFileSync(podfilePath, 'utf8');
        const nextPodfile = applyPodfile(podfile, enabled);
        if (nextPodfile !== podfile) fs.writeFileSync(podfilePath, nextPodfile, 'utf8');
      }

      // Sanitized proof for EAS/prebuild logs (no keys, no URLs).
      console.log(`[withNearsyAppsFlyer] enabled=${enabled} AppDelegate OK: ${JSON.stringify(analysis)}`);
      return cfg;
    },
  ]);
};

module.exports = createRunOncePlugin(withNearsyAppsFlyer, 'withNearsyAppsFlyer', '1.0.0');

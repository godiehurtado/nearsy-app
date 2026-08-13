/**
 * Expo config plugin — I1-G duplicate FirebaseApp.configure fix.
 *
 * Stock @react-native-firebase/app-check (23.8.6) Swift AppDelegate modifier
 * inserts a *second* FirebaseApp.configure() after RNFB App's configure, which
 * aborts at runtime (FIRApp appWasConfiguredTwice).
 *
 * This plugin replaces that stock AppDelegate behavior:
 * - Do not use @react-native-firebase/app-check's AppDelegate plugin.
 * - Keep @react-native-firebase/app for Google Services + canonical configure.
 * - Ensure exactly: App Check provider factory → single FirebaseApp.configure().
 */
const {
  withDangerousMod,
  IOSConfig,
  createRunOncePlugin,
} = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const {
  normalizeSwiftAppDelegateFirebaseInit,
  normalizeObjcAppDelegateFirebaseInit,
  ensureBridgingHeaderAppCheckImport,
  analyzeAppDelegateFirebaseInit,
} = require('./nearsyRnfbAppCheckCore');

function ensureSwiftBridgingHeader(projectRoot) {
  const iosDir = path.join(projectRoot, 'ios');
  if (!fs.existsSync(iosDir)) return;

  const entries = fs.readdirSync(iosDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const bridgingHeader = path.join(
      iosDir,
      entry.name,
      `${entry.name}-Bridging-Header.h`,
    );
    if (!fs.existsSync(bridgingHeader)) continue;
    const contents = fs.readFileSync(bridgingHeader, 'utf8');
    const next = ensureBridgingHeaderAppCheckImport(contents);
    if (next !== contents) {
      fs.writeFileSync(bridgingHeader, next, 'utf8');
    }
    break;
  }
}

const withNearsyRnfbAppCheck = (config) => {
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const fileInfo = IOSConfig.Paths.getAppDelegate(projectRoot);
      const { language, path: filePath, contents } = fileInfo;

      let next;
      if (language === 'swift') {
        next = normalizeSwiftAppDelegateFirebaseInit(contents);
        ensureSwiftBridgingHeader(projectRoot);
      } else if (language === 'objc' || language === 'objcpp') {
        next = normalizeObjcAppDelegateFirebaseInit(contents);
      } else {
        throw new Error(
          `[withNearsyRnfbAppCheck] Unsupported AppDelegate language: ${language}`,
        );
      }

      const analysis = analyzeAppDelegateFirebaseInit(next);
      if (!analysis.ok) {
        throw new Error(
          `[withNearsyRnfbAppCheck] Post-condition failed: ${JSON.stringify(analysis)}`,
        );
      }

      // Sanitized invariant proof for EAS/prebuild logs (no secrets).
      console.log(
        `[withNearsyRnfbAppCheck] AppDelegate invariant OK: ${JSON.stringify(analysis)}`,
      );

      await fs.promises.writeFile(filePath, next, 'utf8');
      return cfg;
    },
  ]);
};

module.exports = createRunOncePlugin(
  withNearsyRnfbAppCheck,
  'withNearsyRnfbAppCheck',
  '1.0.0',
);

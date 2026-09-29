/**
 * Firebase google-services selection for app.config.js.
 *
 * Production / preview / default: tracked ./google-services.json (nearsy-pj).
 *
 * nearsy-dev requires NEARSY_FIREBASE_ENV and EXPO_PUBLIC_NEARSY_FIREBASE_ENV
 * to both be development|dev; a mismatch fails instead of guessing. The dev
 * file comes from the EAS file variable GOOGLE_SERVICES_JSON_DEV (mandatory on
 * EAS Build) or, for local runs only, the gitignored
 * ./google-services.nearsy-dev.json. It must belong to nearsy-dev and
 * com.nearsy.app; development never falls back to the production file.
 *
 * Error messages never include the file path or its content.
 */
const fs = require('fs');
const path = require('path');

const FIREBASE_ENV = 'NEARSY_FIREBASE_ENV';
const PUBLIC_FIREBASE_ENV = 'EXPO_PUBLIC_NEARSY_FIREBASE_ENV';
const GOOGLE_SERVICES_DEV_FILE_ENV = 'GOOGLE_SERVICES_JSON_DEV';
const PRODUCTION_GOOGLE_SERVICES_FILE = './google-services.json';
const LOCAL_DEV_GOOGLE_SERVICES_FILE = './google-services.nearsy-dev.json';
const DEV_PROJECT_ID = 'nearsy-dev';
const ANDROID_PACKAGE = 'com.nearsy.app';

/** @param {Record<string, string | undefined>} env @param {string} name */
function readEnv(env, name) {
  return String(env[name] || '').trim();
}

/** @param {string} value */
function isDevelopment(value) {
  const normalized = value.toLowerCase();
  return normalized === 'development' || normalized === 'dev';
}

/**
 * @param {string} absolutePath
 * @param {string} label Safe source description (never the path).
 */
function assertNearsyDevGoogleServices(absolutePath, label) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  } catch {
    throw new Error(
      `[app.config] ${label} is missing or is not a valid google-services JSON file.`,
    );
  }
  const projectId = parsed && parsed.project_info && parsed.project_info.project_id;
  const clients = (parsed && Array.isArray(parsed.client) && parsed.client) || [];
  const hasPackage = clients.some(
    (client) =>
      client &&
      client.client_info &&
      client.client_info.android_client_info &&
      client.client_info.android_client_info.package_name === ANDROID_PACKAGE,
  );
  if (projectId !== DEV_PROJECT_ID || !hasPackage) {
    throw new Error(
      `[app.config] ${label} is not the ${DEV_PROJECT_ID} google-services file for ${ANDROID_PACKAGE}.`,
    );
  }
}

/**
 * @param {Record<string, string | undefined>} [env]
 * @param {string} [projectRoot]
 * @returns {{ useNearsyDev: boolean, googleServicesFile: string }}
 */
function resolveGoogleServicesConfig(env = process.env, projectRoot = path.join(__dirname, '..')) {
  const nativeDev = isDevelopment(readEnv(env, FIREBASE_ENV));
  const publicDev = isDevelopment(readEnv(env, PUBLIC_FIREBASE_ENV));

  if (nativeDev !== publicDev) {
    throw new Error(
      `[app.config] ${FIREBASE_ENV} and ${PUBLIC_FIREBASE_ENV} must both be "development" for nearsy-dev, or both non-development for production.`,
    );
  }

  if (!nativeDev) {
    return { useNearsyDev: false, googleServicesFile: PRODUCTION_GOOGLE_SERVICES_FILE };
  }

  const devFile = readEnv(env, GOOGLE_SERVICES_DEV_FILE_ENV);
  if (devFile) {
    assertNearsyDevGoogleServices(
      path.resolve(projectRoot, devFile),
      GOOGLE_SERVICES_DEV_FILE_ENV,
    );
    return { useNearsyDev: true, googleServicesFile: devFile };
  }

  if (readEnv(env, 'EAS_BUILD') === 'true') {
    throw new Error(
      `[app.config] ${GOOGLE_SERVICES_DEV_FILE_ENV} (EAS file variable, environment development) is required for nearsy-dev EAS builds.`,
    );
  }

  assertNearsyDevGoogleServices(
    path.resolve(projectRoot, LOCAL_DEV_GOOGLE_SERVICES_FILE),
    'Local google-services.nearsy-dev.json',
  );
  return { useNearsyDev: true, googleServicesFile: LOCAL_DEV_GOOGLE_SERVICES_FILE };
}

module.exports = {
  FIREBASE_ENV,
  PUBLIC_FIREBASE_ENV,
  GOOGLE_SERVICES_DEV_FILE_ENV,
  PRODUCTION_GOOGLE_SERVICES_FILE,
  LOCAL_DEV_GOOGLE_SERVICES_FILE,
  resolveGoogleServicesConfig,
};

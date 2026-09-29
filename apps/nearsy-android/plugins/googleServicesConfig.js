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
 * com.nearsy.app without nearsy-pj references; GOOGLE_SERVICES_JSON_DEV must
 * also carry the Android OAuth client for the EAS signing SHA-1 (Google
 * Sign-In). Development never falls back to the production file.
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
const PRODUCTION_PROJECT_ID = 'nearsy-pj';
const ANDROID_PACKAGE = 'com.nearsy.app';
/** Public SHA-1 of the EAS Android signing certificate (Meta key hash nHDH…). */
const EAS_SIGNING_CERT_SHA1 = '9c70c79ae4d0fe22e268ea5f50a742b0edf0bc8c';

/** @param {Record<string, string | undefined>} env @param {string} name */
function readEnv(env, name) {
  return String(env[name] || '').trim();
}

/** @param {string} value */
function isDevelopment(value) {
  const normalized = value.toLowerCase();
  return normalized === 'development' || normalized === 'dev';
}

/** @param {any} client */
function isNearsyAndroidClient(client) {
  return Boolean(
    client &&
      client.client_info &&
      client.client_info.android_client_info &&
      client.client_info.android_client_info.package_name === ANDROID_PACKAGE,
  );
}

/** @param {any} client */
function hasEasSigningOAuthClient(client) {
  const oauthClients = (client && Array.isArray(client.oauth_client) && client.oauth_client) || [];
  return oauthClients.some(
    (oauth) =>
      oauth &&
      oauth.client_type === 1 &&
      oauth.android_info &&
      oauth.android_info.package_name === ANDROID_PACKAGE &&
      String(oauth.android_info.certificate_hash || '')
        .replace(/:/g, '')
        .toLowerCase() === EAS_SIGNING_CERT_SHA1,
  );
}

/**
 * @param {string} absolutePath
 * @param {string} label Safe source description (never the path).
 * @param {{ requireEasSigningOAuthClient: boolean }} options
 */
function assertNearsyDevGoogleServices(absolutePath, label, { requireEasSigningOAuthClient }) {
  let raw;
  let parsed;
  try {
    raw = fs.readFileSync(absolutePath, 'utf8');
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      `[app.config] ${label} is missing or is not a valid google-services JSON file.`,
    );
  }
  const projectId = parsed && parsed.project_info && parsed.project_info.project_id;
  const clients = (parsed && Array.isArray(parsed.client) && parsed.client) || [];
  const nearsyClients = clients.filter(isNearsyAndroidClient);
  if (projectId !== DEV_PROJECT_ID || nearsyClients.length === 0) {
    throw new Error(
      `[app.config] ${label} is not the ${DEV_PROJECT_ID} google-services file for ${ANDROID_PACKAGE}.`,
    );
  }
  if (raw.includes(PRODUCTION_PROJECT_ID)) {
    throw new Error(`[app.config] ${label} references ${PRODUCTION_PROJECT_ID}.`);
  }
  if (requireEasSigningOAuthClient && !nearsyClients.some(hasEasSigningOAuthClient)) {
    throw new Error(
      `[app.config] ${label} has no Android OAuth client for ${ANDROID_PACKAGE} with the EAS signing certificate SHA-1.`,
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
      { requireEasSigningOAuthClient: true },
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
    { requireEasSigningOAuthClient: false },
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

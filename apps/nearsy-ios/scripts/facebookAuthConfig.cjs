/**
 * Build-time Facebook Login configuration (ENH-AUTH-FB-01).
 *
 * App ID and Client Token come from EAS/env only. The Meta App Secret never
 * belongs to the mobile client: it is rejected here and must only live in
 * Firebase Console. Never logs or returns descriptors that include values.
 */
'use strict';

const FACEBOOK_APP_ID_ENV = 'EXPO_PUBLIC_FACEBOOK_APP_ID';
const FACEBOOK_CLIENT_TOKEN_ENV = 'EXPO_PUBLIC_FACEBOOK_CLIENT_TOKEN';
const FACEBOOK_DISPLAY_NAME = 'Nearsy';

/** Contractual iOS query schemes (Meta iOS SDK getting started). */
const FACEBOOK_QUERY_SCHEMES = Object.freeze(['fbapi', 'fb-messenger-share-api']);

/** Schemes react-native-fbsdk-next injects that are outside the Nearsy contract. */
const FACEBOOK_NON_CONTRACT_QUERY_SCHEMES = Object.freeze([
  'fb-messenger-api',
  'fbauth2',
  'fbshareextension',
]);

/** Ad-attribution SKAdNetwork IDs react-native-fbsdk-next always injects. */
const FACEBOOK_SKADNETWORK_IDENTIFIERS = Object.freeze([
  'v9wttpbfk9.skadnetwork',
  'n38lu8286q.skadnetwork',
]);

const FORBIDDEN_SECRET_ENV_NAMES = Object.freeze([
  'EXPO_PUBLIC_FACEBOOK_APP_SECRET',
  'EXPO_PUBLIC_META_APP_SECRET',
  'EXPO_PUBLIC_FB_APP_SECRET',
]);

const APP_ID_PATTERN = /^\d{5,20}$/;
const CLIENT_TOKEN_PATTERN = /^[A-Za-z0-9]{16,128}$/;

/** @param {unknown} raw */
function trimmed(raw) {
  return typeof raw === 'string' ? raw.trim() : '';
}

/**
 * Presence/format only — safe to print.
 * @param {Record<string, string | undefined>} env
 */
function describeFacebookAuthEnv(env) {
  const appId = trimmed(env[FACEBOOK_APP_ID_ENV]);
  const clientToken = trimmed(env[FACEBOOK_CLIENT_TOKEN_ENV]);
  return {
    appIdEnv: FACEBOOK_APP_ID_ENV,
    appIdPresent: appId.length > 0,
    appIdFormatValid: APP_ID_PATTERN.test(appId),
    clientTokenEnv: FACEBOOK_CLIENT_TOKEN_ENV,
    clientTokenPresent: clientToken.length > 0,
    clientTokenFormatValid:
      CLIENT_TOKEN_PATTERN.test(clientToken) && clientToken !== appId,
    forbiddenSecretEnvPresent: FORBIDDEN_SECRET_ENV_NAMES.some(
      (name) => trimmed(env[name]).length > 0,
    ),
  };
}

/**
 * @param {Record<string, string | undefined>} env
 * @returns {{ appID: string, clientToken: string }}
 */
function resolveFacebookAuthEnv(env) {
  for (const name of FORBIDDEN_SECRET_ENV_NAMES) {
    if (trimmed(env[name])) {
      throw new Error(
        `[app.config] ${name} must never be exposed to the mobile client. Remove it; the Meta App Secret belongs only in Firebase Console.`,
      );
    }
  }

  const appID = trimmed(env[FACEBOOK_APP_ID_ENV]);
  if (!appID) {
    throw new Error(
      `[app.config] Missing required environment variable: ${FACEBOOK_APP_ID_ENV}`,
    );
  }
  if (!APP_ID_PATTERN.test(appID)) {
    throw new Error(
      `[app.config] ${FACEBOOK_APP_ID_ENV} must be the numeric Meta App ID.`,
    );
  }

  const clientToken = trimmed(env[FACEBOOK_CLIENT_TOKEN_ENV]);
  if (!clientToken) {
    throw new Error(
      `[app.config] Missing required environment variable: ${FACEBOOK_CLIENT_TOKEN_ENV}`,
    );
  }
  if (clientToken.includes('|')) {
    throw new Error(
      `[app.config] ${FACEBOOK_CLIENT_TOKEN_ENV} looks like an app access token (contains the App Secret). Use the Client Token from Meta > Settings > Advanced.`,
    );
  }
  if (!CLIENT_TOKEN_PATTERN.test(clientToken) || clientToken === appID) {
    throw new Error(
      `[app.config] ${FACEBOOK_CLIENT_TOKEN_ENV} has an invalid format.`,
    );
  }

  return { appID, clientToken };
}

/**
 * Facebook config is mandatory on EAS Build, for development config and
 * whenever any Facebook variable is set. Only a local production-branch
 * evaluation with neither variable (e.g. the eas-cli parent of
 * `eas env:exec`, which reads app.config before injecting EAS env) may skip
 * it; that evaluation never produces a native project.
 * @param {Record<string, string | undefined>} env
 * @param {{ isDevelopment: boolean }} context
 * @returns {{ appID: string, clientToken: string } | null}
 */
function resolveFacebookAuthEnvForConfig(env, { isDevelopment }) {
  const anyPresent =
    trimmed(env[FACEBOOK_APP_ID_ENV]).length > 0 ||
    trimmed(env[FACEBOOK_CLIENT_TOKEN_ENV]).length > 0;
  const required =
    trimmed(env.EAS_BUILD) === 'true' || isDevelopment || anyPresent;
  if (required) return resolveFacebookAuthEnv(env);

  for (const name of FORBIDDEN_SECRET_ENV_NAMES) {
    if (trimmed(env[name])) return resolveFacebookAuthEnv(env);
  }
  return null;
}

/**
 * Props for react-native-fbsdk-next. Privacy flags are fixed OFF; no ATT copy.
 * @param {{ appID: string, clientToken: string }} resolved
 */
function buildFacebookPluginProps(resolved) {
  return {
    appID: resolved.appID,
    clientToken: resolved.clientToken,
    displayName: FACEBOOK_DISPLAY_NAME,
    scheme: `fb${resolved.appID}`,
    isAutoInitEnabled: false,
    autoLogAppEventsEnabled: false,
    advertiserIDCollectionEnabled: false,
  };
}

module.exports = {
  FACEBOOK_APP_ID_ENV,
  FACEBOOK_CLIENT_TOKEN_ENV,
  FACEBOOK_DISPLAY_NAME,
  FACEBOOK_QUERY_SCHEMES,
  FACEBOOK_NON_CONTRACT_QUERY_SCHEMES,
  FACEBOOK_SKADNETWORK_IDENTIFIERS,
  FORBIDDEN_SECRET_ENV_NAMES,
  describeFacebookAuthEnv,
  resolveFacebookAuthEnv,
  resolveFacebookAuthEnvForConfig,
  buildFacebookPluginProps,
};

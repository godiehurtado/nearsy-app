/**
 * Expo config — selects Firebase google-services by environment.
 *
 * Default / production / preview: ./google-services.json (nearsy-pj)
 * Explicit development only when NEARSY_FIREBASE_ENV=development:
 *   ./google-services.nearsy-dev.json (gitignored; never committed)
 *
 * Accidental Production activation is avoided: development must be opted in.
 * This file does NOT enable LinkedIn OIDC PoC or any A2 managed-OIDC path.
 */
const appJson = require('./app.json');

const firebaseEnv = String(process.env.NEARSY_FIREBASE_ENV || '')
  .trim()
  .toLowerCase();
const useNearsyDev = firebaseEnv === 'development';

/** Explicit development-client marker (EAS development-nearsy-dev sets this). */
const nearsyDevClient =
  String(process.env.NEARSY_DEV_CLIENT || '')
    .trim()
    .toLowerCase() === 'true';

const googleServicesFile = useNearsyDev
  ? './google-services.nearsy-dev.json'
  : './google-services.json';

module.exports = {
  expo: {
    ...appJson.expo,
    android: {
      ...appJson.expo.android,
      googleServicesFile,
    },
    extra: {
      ...(appJson.expo.extra || {}),
      /** Surface selected Firebase env to JS (no secrets). */
      nearsyFirebaseEnv: useNearsyDev ? 'development' : 'default',
      /**
       * True only when the build opts into the Development client channel.
       * Combined with nearsyFirebaseEnv for App Check Debug eligibility.
       */
      nearsyDevClient,
    },
  },
};

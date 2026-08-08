/**
 * Expo config wrapper — selects Firebase google-services by environment.
 *
 * Default / production / preview: ./google-services.json (existing productive file)
 * Explicit development only when NEARSY_FIREBASE_ENV=development:
 *   ./google-services.nearsy-dev.json (gitignored; never committed)
 *
 * Accidental production activation is avoided: development must be opted in.
 */
const appJson = require('./app.json');

const firebaseEnv = String(process.env.NEARSY_FIREBASE_ENV || '')
  .trim()
  .toLowerCase();
const useNearsyDev = firebaseEnv === 'development';

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
      /** LinkedIn OIDC PoC is only meaningful on nearsy-dev builds. */
      nearsyLinkedInOidcPoc: useNearsyDev,
    },
  },
};

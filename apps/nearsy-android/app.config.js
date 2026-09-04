/**
 * Expo config — selects Firebase google-services by environment (J01).
 *
 * Default / production / preview: ./google-services.json (nearsy-pj)
 * Explicit development only when NEARSY_FIREBASE_ENV=development|dev:
 *   ./google-services.nearsy-dev.json (gitignored; never committed)
 *
 * Accidental Production activation is avoided: development must be opted in.
 * Emits a single extras shape consumed by packages/shared environment resolver.
 */
const appJson = require('./app.json');

const firebaseEnv = String(process.env.NEARSY_FIREBASE_ENV || '')
  .trim()
  .toLowerCase();
const useNearsyDev = firebaseEnv === 'development' || firebaseEnv === 'dev';

/** Explicit development-client marker (EAS development-nearsy-dev sets this). */
const nearsyDevClient =
  String(process.env.NEARSY_DEV_CLIENT || '')
    .trim()
    .toLowerCase() === 'true';

const googleServicesFile = useNearsyDev
  ? './google-services.nearsy-dev.json'
  : './google-services.json';

/** Canonical labels for JS (never print secrets). */
const nearsyFirebaseEnv = useNearsyDev ? 'development' : 'production';
const nearsyFirebaseProjectId = useNearsyDev ? 'nearsy-dev' : 'nearsy-pj';

module.exports = {
  expo: {
    ...appJson.expo,
    android: {
      ...appJson.expo.android,
      googleServicesFile,
    },
    extra: {
      ...(appJson.expo.extra || {}),
      /** Canonical environment: development | production */
      nearsyFirebaseEnv,
      /** Must pair with nearsyFirebaseEnv (nearsy-dev | nearsy-pj) */
      nearsyFirebaseProjectId,
      nearsyFunctionsRegion: 'us-central1',
      /**
       * True only when the build opts into the Development client channel.
       * Combined with nearsyFirebaseEnv for App Check Debug eligibility.
       */
      nearsyDevClient,
    },
  },
};

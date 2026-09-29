/**
 * Expo config — selects Firebase google-services by environment (J01).
 *
 * Default / production / preview: ./google-services.json (nearsy-pj)
 * Explicit development only when NEARSY_FIREBASE_ENV and
 * EXPO_PUBLIC_NEARSY_FIREBASE_ENV are both development|dev: the EAS file
 * variable GOOGLE_SERVICES_JSON_DEV (required on EAS Build) or, locally,
 * ./google-services.nearsy-dev.json (gitignored; never committed).
 * See plugins/googleServicesConfig.js.
 *
 * Accidental Production activation is avoided: development must be opted in.
 * Emits a single extras shape consumed by packages/shared environment resolver.
 */
const appJson = require('./app.json');
const {
  FACEBOOK_STATIC_PLUGINS,
  resolveFacebookAuthConfig,
  withNearsyFacebookAuth,
} = require('./plugins/facebookAuthConfig');
const { resolveGoogleServicesConfig } = require('./plugins/googleServicesConfig');

const { useNearsyDev, googleServicesFile } = resolveGoogleServicesConfig(process.env);

/** Explicit development-client marker (EAS development-nearsy-dev sets this). */
const nearsyDevClient =
  String(process.env.NEARSY_DEV_CLIENT || '')
    .trim()
    .toLowerCase() === 'true';

/** Canonical labels for JS (never print secrets). */
const nearsyFirebaseEnv = useNearsyDev ? 'development' : 'production';
const nearsyFirebaseProjectId = useNearsyDev ? 'nearsy-dev' : 'nearsy-pj';

/**
 * Logo.dev publishable key (pk_ only). Never embed sk_ secrets.
 * Expo inlines EXPO_PUBLIC_* at bundle time; also copy into extra for
 * Constants.expoConfig readers (affiliation logo rebuild after persist).
 */
const logoDevPublishableKey = String(
  process.env.EXPO_PUBLIC_LOGO_DEV_PUBLISHABLE_KEY || '',
).trim();

/**
 * Facebook Login (ENH-AUTH-FB-01). App ID + Client Token from env only; the
 * token is written to native resources by the plugin, never into extra or
 * the serialized plugins list.
 */
const facebookAuth = resolveFacebookAuthConfig(process.env);
if (!facebookAuth.configured) {
  console.warn(
    `[app.config] Facebook Login disabled: ${facebookAuth.issues.join(', ')}`,
  );
}

const expoConfig = {
  ...appJson.expo,
  plugins: [...(appJson.expo.plugins || []), ...FACEBOOK_STATIC_PLUGINS],
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
    /** Gates the native Facebook SDK in JS (never the token itself). */
    facebookAuthConfigured: facebookAuth.configured,
    ...(logoDevPublishableKey.startsWith('pk_')
      ? { EXPO_PUBLIC_LOGO_DEV_PUBLISHABLE_KEY: logoDevPublishableKey }
      : {}),
  },
};

module.exports = {
  expo: withNearsyFacebookAuth(expoConfig, facebookAuth),
};

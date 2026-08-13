/**
 * Expo app config — build-time Firebase environment selection (I1).
 *
 * development → nearsy-dev (+ GoogleService-Info.development.plist)
 * production  → nearsy-pj  (+ GoogleService-Info.plist)
 *
 * Linking (Expo 54 / RN 0.81.5 / RNFB 23.8.6):
 *   CocoaPods + useFrameworks: "static" + forceStaticLinking for RNFB modules.
 * Do not use SPM/default dynamic frameworks with this RNFB pin.
 *
 * Plugin order: @react-native-firebase/app provides Google Services + canonical
 * FirebaseApp.configure(). withNearsyRnfbAppCheck (I1-G) then enforces exactly:
 *   RNFBAppCheckModule.sharedInstance() → FirebaseApp.configure() (once each).
 * Do NOT use stock @react-native-firebase/app-check AppDelegate plugin on Swift:
 * it inserts a second FirebaseApp.configure() and aborts (appWasConfiguredTwice).
 */

const fs = require('fs');
const path = require('path');

const FUNCTIONS_REGION = 'us-central1';
const DEV_PLIST = './GoogleService-Info.development.plist';
const PROD_PLIST = './GoogleService-Info.plist';

function resolveEnvironmentName() {
  const raw = String(
    process.env.EXPO_PUBLIC_NEARSY_FIREBASE_ENV ?? '',
  )
    .trim()
    .toLowerCase();
  if (raw === 'development' || raw === 'dev') return 'development';
  if (raw === 'production' || raw === 'prod' || raw === '') return 'production';
  throw new Error(
    `[app.config] Unsupported EXPO_PUBLIC_NEARSY_FIREBASE_ENV: ${raw}`,
  );
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value || !String(value).trim()) {
    throw new Error(
      `[app.config] Missing required environment variable for development: ${name}`,
    );
  }
  return String(value).trim();
}

function assertPlistExists(relativePath) {
  const absolute = path.resolve(__dirname, relativePath);
  if (!fs.existsSync(absolute)) {
    throw new Error(
      `[app.config] Missing Google Services file for selected environment: ${relativePath}`,
    );
  }
}

/** @param {import('expo/config').ConfigContext} ctx */
module.exports = ({ config }) => {
  const environment = resolveEnvironmentName();
  const isDevelopment = environment === 'development';

  const googleServicesFile = isDevelopment ? DEV_PLIST : PROD_PLIST;
  assertPlistExists(googleServicesFile);

  /** @type {Record<string, string>} */
  let extraBase;

  if (isDevelopment) {
    extraBase = {
      EXPO_PUBLIC_NEARSY_FIREBASE_ENV: 'development',
      EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION: FUNCTIONS_REGION,
      EXPO_PUBLIC_FIREBASE_API_KEY: requireEnv('EXPO_PUBLIC_FIREBASE_API_KEY'),
      EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: requireEnv(
        'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
      ),
      EXPO_PUBLIC_FIREBASE_PROJECT_ID: requireEnv(
        'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
      ),
      EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: requireEnv(
        'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET',
      ),
      EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: requireEnv(
        'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
      ),
      EXPO_PUBLIC_FIREBASE_APP_ID: requireEnv('EXPO_PUBLIC_FIREBASE_APP_ID'),
      // Google Sign-In may keep Ops clients until Dev clients are supplied.
      EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID:
        process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ??
        config.extra?.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
      EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID:
        process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ??
        config.extra?.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
      EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME:
        process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME ??
        config.extra?.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME,
      EXPO_PUBLIC_LINKEDIN_AUTH_ENABLED: 'true',
      NEARSY_LINKEDIN_APP_RETURN_URL: 'nearsy://linkedin-auth',
    };

    if (extraBase.EXPO_PUBLIC_FIREBASE_PROJECT_ID !== 'nearsy-dev') {
      throw new Error(
        '[app.config] Development builds must set EXPO_PUBLIC_FIREBASE_PROJECT_ID=nearsy-dev',
      );
    }

    // Inject debug token into extra only for development builds (never commit the value).
    const debugToken = process.env.FIREBASE_APP_CHECK_DEBUG_TOKEN;
    if (debugToken && String(debugToken).trim()) {
      extraBase.NEARSY_APP_CHECK_DEBUG_TOKEN = String(debugToken).trim();
    }
  } else {
    if (process.env.FIREBASE_APP_CHECK_DEBUG_TOKEN) {
      throw new Error(
        '[app.config] FIREBASE_APP_CHECK_DEBUG_TOKEN must not be set for production builds',
      );
    }

    extraBase = {
      EXPO_PUBLIC_NEARSY_FIREBASE_ENV: 'production',
      EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION: FUNCTIONS_REGION,
      EXPO_PUBLIC_FIREBASE_API_KEY:
        process.env.EXPO_PUBLIC_FIREBASE_API_KEY ??
        config.extra?.EXPO_PUBLIC_FIREBASE_API_KEY,
      EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN:
        process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ??
        config.extra?.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
      EXPO_PUBLIC_FIREBASE_PROJECT_ID:
        process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ??
        config.extra?.EXPO_PUBLIC_FIREBASE_PROJECT_ID ??
        'nearsy-pj',
      EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET:
        process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ??
        config.extra?.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
      EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID:
        process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ??
        config.extra?.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      EXPO_PUBLIC_FIREBASE_APP_ID:
        process.env.EXPO_PUBLIC_FIREBASE_APP_ID ??
        config.extra?.EXPO_PUBLIC_FIREBASE_APP_ID,
      EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID:
        process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ??
        config.extra?.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
      EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID:
        process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ??
        config.extra?.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
      EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME:
        process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME ??
        config.extra?.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME,
      EXPO_PUBLIC_LINKEDIN_AUTH_ENABLED: 'false',
      NEARSY_LINKEDIN_APP_RETURN_URL: 'nearsy://linkedin-auth',
    };

    if (extraBase.EXPO_PUBLIC_FIREBASE_PROJECT_ID !== 'nearsy-pj') {
      throw new Error(
        '[app.config] Production builds must use EXPO_PUBLIC_FIREBASE_PROJECT_ID=nearsy-pj',
      );
    }
  }

  return {
    ...config,
    ios: {
      ...config.ios,
      bundleIdentifier: 'com.nearsy.app.client',
      googleServicesFile,
    },
    plugins: [
      // RNFB App: GoogleService-Info + canonical FirebaseApp.configure().
      '@react-native-firebase/app',
      // I1-G: App Check provider factory BEFORE that single configure.
      // Stock @react-native-firebase/app-check AppDelegate plugin is intentionally
      // omitted — its Swift path duplicates FirebaseApp.configure().
      './plugins/withNearsyRnfbAppCheck',
      'expo-dev-client',
      'expo-image-picker',
      [
        'expo-location',
        {
          isAndroidForegroundServiceEnabled: true,
        },
      ],
      'expo-notifications',
      'expo-asset',
      'expo-font',
      'expo-web-browser',
      [
        'expo-build-properties',
        {
          ios: {
            // RNFB 23.8.6 is CocoaPods-only (no SPM). Dynamic frameworks with
            // Expo 54 / RN 0.81 cause -Werror=non-modular-include-in-framework-module
            // when RNFBApp imports React-Core headers. Static + forceStaticLinking
            // is the controlled correction for the modules Nearsy actually uses.
            useFrameworks: 'static',
            forceStaticLinking: ['RNFBApp', 'RNFBAppCheck', 'RNFBFunctions'],
            extraPods: [
              {
                name: 'GoogleUtilities',
                modular_headers: true,
              },
              {
                name: 'RecaptchaInterop',
                modular_headers: true,
              },
            ],
          },
        },
      ],
      [
        '@react-native-google-signin/google-signin',
        {
          iosUrlScheme:
            extraBase.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME ??
            config.extra?.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME,
        },
      ],
      'expo-localization',
      'expo-apple-authentication',
    ],
    extra: {
      ...config.extra,
      ...extraBase,
      eas: config.extra?.eas,
    },
  };
};

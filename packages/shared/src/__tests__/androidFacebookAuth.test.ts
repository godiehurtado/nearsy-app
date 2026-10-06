/**
 * ENH-AUTH-FB-01 guards: Expo config (env-driven Facebook plugin, privacy
 * hardening), no secrets / hardcodes, Android UI wiring, routing reuse,
 * i18n parity and regressions for existing providers.
 *
 * Run:
 *   node --experimental-strip-types --test packages/shared/src/__tests__/androidFacebookAuth.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { authenticationTranslations } from '../i18n/resources/authentication.ts';
import settingsEn from '../i18n/resources/settings.ts';
import { resolveFacebookAuthConfigured } from '../config/facebookAuthConfig.ts';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '../../../..');
const androidAppRoot = join(repoRoot, 'apps/nearsy-android');
const sharedSrc = join(here, '..');
const requireFromApp = createRequire(join(androidAppRoot, 'package.json'));

const FAKE_TOKEN = 'abcdefabcdefabcdefabcdefabcdef12';
const PUBLIC_APP_ID = '955843897572627';

function readRepo(relative: string): string {
  return readFileSync(join(repoRoot, relative), 'utf8').replace(/\r\n/g, '\n');
}

function readShared(relative: string): string {
  return readFileSync(join(sharedSrc, relative), 'utf8').replace(/\r\n/g, '\n');
}

type PluginEntry = string | [string, Record<string, unknown>];
type LoadedConfig = {
  expo: {
    plugins?: PluginEntry[];
    android?: { package?: string };
    extra?: Record<string, unknown>;
    mods?: Record<string, Record<string, unknown>>;
    _internal?: { pluginHistory?: Record<string, { name: string; version: string }> };
  };
};

type FacebookAuthConfigModule = {
  FACEBOOK_STATIC_PLUGINS: string[];
  resolveFacebookAuthConfig: (env: Record<string, string>) => { configured: boolean; issues: string[] };
  buildFacebookPluginProps: (resolution: unknown) => Record<string, unknown> | null;
  withNearsyFacebookAuth: (config: Record<string, unknown>, resolution: unknown) => Record<string, unknown>;
};

const facebookAuthConfig = requireFromApp('./plugins/facebookAuthConfig') as FacebookAuthConfigModule;

const ENV_KEYS = [
  'EXPO_PUBLIC_FACEBOOK_APP_ID',
  'EXPO_PUBLIC_FACEBOOK_CLIENT_TOKEN',
  'NEARSY_FIREBASE_ENV',
] as const;

function loadAppConfig(env: Partial<Record<(typeof ENV_KEYS)[number], string>>): LoadedConfig {
  const previous = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    for (const key of ENV_KEYS) {
      if (env[key] === undefined) delete process.env[key];
      else process.env[key] = env[key];
    }
    const resolved = requireFromApp.resolve('./app.config.js');
    delete requireFromApp.cache[resolved];
    return requireFromApp('./app.config.js') as LoadedConfig;
  } finally {
    console.warn = originalWarn;
    for (const key of ENV_KEYS) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

function facebookPluginApplied(cfg: LoadedConfig): boolean {
  return Boolean(cfg.expo._internal?.pluginHistory?.['react-native-fbsdk-next']);
}

function facebookProps(env: Record<string, string>) {
  return facebookAuthConfig.buildFacebookPluginProps(facebookAuthConfig.resolveFacebookAuthConfig(env));
}

describe('App config: Facebook SDK plugin (env-driven)', () => {
  const configured = {
    EXPO_PUBLIC_FACEBOOK_APP_ID: PUBLIC_APP_ID,
    EXPO_PUBLIC_FACEBOOK_CLIENT_TOKEN: FAKE_TOKEN,
  };

  it('applies react-native-fbsdk-next 13.4.3 native mods when configured', () => {
    for (const firebaseEnv of ['production', 'development']) {
      const cfg = loadAppConfig({ ...configured, NEARSY_FIREBASE_ENV: firebaseEnv });
      assert.deepEqual(cfg.expo._internal?.pluginHistory?.['react-native-fbsdk-next'], {
        name: 'react-native-fbsdk-next',
        version: '13.4.3',
      });
      assert.ok(cfg.expo.mods?.android?.manifest, `android manifest mod missing for ${firebaseEnv}`);
      assert.ok(cfg.expo.mods?.android?.strings, `android strings mod missing for ${firebaseEnv}`);
      assert.equal(cfg.expo.android?.package, 'com.nearsy.app');
      assert.equal(cfg.expo.extra?.facebookAuthConfigured, true);
    }
  });

  it('plugin props: env App ID/token, Nearsy name and fb scheme', () => {
    const props = facebookProps(configured)!;
    assert.equal(props.appID, PUBLIC_APP_ID);
    assert.equal(props.clientToken, FAKE_TOKEN);
    assert.equal(props.displayName, 'Nearsy');
    assert.equal(props.scheme, `fb${PUBLIC_APP_ID}`);
  });

  it('withNearsyFacebookAuth hands exactly those props to the fbsdk plugin', () => {
    const pluginPath = requireFromApp.resolve('react-native-fbsdk-next/app.plugin');
    const configPath = requireFromApp.resolve('./plugins/facebookAuthConfig');
    const original = requireFromApp.cache[pluginPath];
    const calls: Array<Record<string, unknown>> = [];
    requireFromApp.cache[pluginPath] = {
      exports: { default: (cfg: Record<string, unknown>, props: Record<string, unknown>) => {
        calls.push(props);
        return { ...cfg, applied: true };
      } },
    } as unknown as NodeJS.Module;
    delete requireFromApp.cache[configPath];
    try {
      const fresh = requireFromApp('./plugins/facebookAuthConfig') as FacebookAuthConfigModule;
      const resolution = fresh.resolveFacebookAuthConfig(configured);
      const result = fresh.withNearsyFacebookAuth({ name: 'x' }, resolution);
      assert.equal(result.applied, true);
      assert.deepEqual(calls, [fresh.buildFacebookPluginProps(resolution)]);

      const untouched = { name: 'y' };
      assert.equal(fresh.withNearsyFacebookAuth(untouched, fresh.resolveFacebookAuthConfig({})), untouched);
      assert.equal(calls.length, 1);
    } finally {
      if (original) requireFromApp.cache[pluginPath] = original;
      else delete requireFromApp.cache[pluginPath];
      delete requireFromApp.cache[configPath];
    }
  });

  it('auto-init and automatic App Events are disabled', () => {
    const props = facebookProps(configured)!;
    assert.equal(props.isAutoInitEnabled, false);
    assert.equal(props.autoLogAppEventsEnabled, false);
  });

  it('advertiser ID collection and tracking prompt are disabled', () => {
    const props = facebookProps(configured)!;
    assert.equal(props.advertiserIDCollectionEnabled, false);
    assert.equal(props.iosUserTrackingPermission, false);
  });

  it('never exposes the Client Token through extra or the serialized public config', () => {
    for (const firebaseEnv of ['production', 'development']) {
      const cfg = loadAppConfig({ ...configured, NEARSY_FIREBASE_ENV: firebaseEnv });
      assert.equal(JSON.stringify(cfg.expo.extra).includes(FAKE_TOKEN), false);
      const { mods: _mods, ...publicFields } = cfg.expo;
      assert.equal(JSON.stringify(publicFields).includes(FAKE_TOKEN), false, firebaseEnv);
      assert.equal(
        (cfg.expo.plugins ?? []).some((p) => (Array.isArray(p) ? p[0] : p) === 'react-native-fbsdk-next'),
        false,
      );
    }
  });

  it('missing or malformed env → plugin omitted, flag false, diagnostics without values', () => {
    const variants: Array<Partial<Record<(typeof ENV_KEYS)[number], string>>> = [
      {},
      { EXPO_PUBLIC_FACEBOOK_APP_ID: PUBLIC_APP_ID },
      { EXPO_PUBLIC_FACEBOOK_CLIENT_TOKEN: FAKE_TOKEN },
      { EXPO_PUBLIC_FACEBOOK_APP_ID: 'fb-not-numeric', EXPO_PUBLIC_FACEBOOK_CLIENT_TOKEN: FAKE_TOKEN },
      { EXPO_PUBLIC_FACEBOOK_APP_ID: PUBLIC_APP_ID, EXPO_PUBLIC_FACEBOOK_CLIENT_TOKEN: 'short' },
    ];
    for (const env of variants) {
      const cfg = loadAppConfig(env);
      assert.equal(facebookPluginApplied(cfg), false);
      assert.equal(cfg.expo.extra?.facebookAuthConfigured, false);
    }

    const bad = facebookAuthConfig.resolveFacebookAuthConfig({
      EXPO_PUBLIC_FACEBOOK_APP_ID: PUBLIC_APP_ID,
      EXPO_PUBLIC_FACEBOOK_CLIENT_TOKEN: 'not-a-valid-token-value',
    });
    assert.equal(bad.configured, false);
    assert.deepEqual(bad.issues, ['EXPO_PUBLIC_FACEBOOK_CLIENT_TOKEN invalid format']);
    assert.equal(bad.issues.join(' ').includes('not-a-valid-token-value'), false);
  });

  it('privacy hardening and SDK version pin are always applied (configured or not)', () => {
    assert.deepEqual(facebookAuthConfig.FACEBOOK_STATIC_PLUGINS, [
      './plugins/withFacebookPrivacyHardening',
      './plugins/withFacebookAndroidSdkVersion',
    ]);
    for (const env of [{}, configured]) {
      const plugins = loadAppConfig(env).expo.plugins ?? [];
      for (const plugin of facebookAuthConfig.FACEBOOK_STATIC_PLUGINS) {
        assert.ok(plugins.includes(plugin), plugin);
      }
    }
  });

  it('runtime flag only trusts an explicit boolean true', () => {
    assert.equal(resolveFacebookAuthConfigured({ facebookAuthConfigured: true }), true);
    assert.equal(resolveFacebookAuthConfigured({ facebookAuthConfigured: 'true' }), false);
    assert.equal(resolveFacebookAuthConfigured({}), false);
    assert.equal(resolveFacebookAuthConfigured(null), false);
  });
});

describe('Privacy hardening plugin', () => {
  it('removes AD_ID and AdServices permissions via tools:node="remove"', () => {
    const { applyFacebookPrivacyHardening, REMOVED_PERMISSIONS } = requireFromApp(
      './plugins/withFacebookPrivacyHardening',
    ) as {
      applyFacebookPrivacyHardening: (m: any) => any;
      REMOVED_PERMISSIONS: string[];
    };
    assert.deepEqual(REMOVED_PERMISSIONS, [
      'com.google.android.gms.permission.AD_ID',
      'android.permission.ACCESS_ADSERVICES_AD_ID',
      'android.permission.ACCESS_ADSERVICES_ATTRIBUTION',
      'android.permission.ACCESS_ADSERVICES_TOPICS',
      'android.permission.ACCESS_ADSERVICES_CUSTOM_AUDIENCE',
    ]);

    const manifest = applyFacebookPrivacyHardening({
      manifest: {
        $: { 'xmlns:android': 'http://schemas.android.com/apk/res/android' },
        'uses-permission': [
          { $: { 'android:name': 'android.permission.INTERNET' } },
          { $: { 'android:name': 'com.google.android.gms.permission.AD_ID' } },
        ],
      },
    });
    const root = manifest.manifest;
    assert.equal(root.$['xmlns:tools'], 'http://schemas.android.com/tools');
    const perms = root['uses-permission'].map((p: any) => p.$);
    assert.deepEqual(perms[0], { 'android:name': 'android.permission.INTERNET' });
    for (const name of REMOVED_PERMISSIONS) {
      const entries = perms.filter((p: any) => p['android:name'] === name);
      assert.equal(entries.length, 1, name);
      assert.equal(entries[0]['tools:node'], 'remove', name);
    }
    // Idempotent.
    const again = applyFacebookPrivacyHardening(manifest).manifest['uses-permission'];
    assert.equal(again.length, perms.length);
  });

  it('removes the AdServices config property from <application> and keeps other entries', () => {
    const { applyFacebookPrivacyHardening, REMOVED_APPLICATION_PROPERTIES } = requireFromApp(
      './plugins/withFacebookPrivacyHardening',
    ) as {
      applyFacebookPrivacyHardening: (m: any) => any;
      REMOVED_APPLICATION_PROPERTIES: string[];
    };
    assert.deepEqual(REMOVED_APPLICATION_PROPERTIES, ['android.adservices.AD_SERVICES_CONFIG']);

    const autoInit = { $: { 'android:name': 'com.facebook.sdk.AutoInitEnabled', 'android:value': 'false' } };
    const otherProperty = { $: { 'android:name': 'com.example.OTHER', 'android:value': 'x' } };
    const manifest = applyFacebookPrivacyHardening({
      manifest: {
        $: {},
        application: [
          {
            $: { 'android:name': '.MainApplication' },
            'meta-data': [autoInit],
            property: [
              otherProperty,
              { $: { 'android:name': 'android.adservices.AD_SERVICES_CONFIG', 'android:resource': '@xml/ad_services_config' } },
            ],
          },
        ],
      },
    });
    const application = manifest.manifest.application[0];
    assert.deepEqual(application['meta-data'], [autoInit]);
    assert.deepEqual(application.property, [
      otherProperty,
      { $: { 'android:name': 'android.adservices.AD_SERVICES_CONFIG', 'tools:node': 'remove' } },
    ]);

    const again = applyFacebookPrivacyHardening(manifest).manifest.application[0].property;
    assert.deepEqual(again, application.property);

    const withoutApplication = applyFacebookPrivacyHardening({ manifest: { $: {} } });
    assert.equal(withoutApplication.manifest.application, undefined);
  });
});

describe('Facebook Android SDK version pin', () => {
  const pin = requireFromApp('./plugins/withFacebookAndroidSdkVersion') as {
    FACEBOOK_ANDROID_SDK_VERSION: string;
    applyFacebookAndroidSdkVersion: (contents: string) => string;
  };
  const LINE = 'ext.facebookSdkVersion = "18.3.0"';

  it('pins the exact version Gradle resolves for the library default 18.+', () => {
    assert.equal(pin.FACEBOOK_ANDROID_SDK_VERSION, '18.3.0');
    const fbsdkGradle = readRepo('node_modules/react-native-fbsdk-next/android/build.gradle');
    assert.match(fbsdkGradle, /rootProject\.ext\.has\(prop\) \? rootProject\.ext\.get\(prop\) : fallback/);
    assert.match(fbsdkGradle, /def FACEBOOK_SDK_VERSION = safeExtGet\('facebookSdkVersion', '18\.\+'\)/);
    assert.match(fbsdkGradle, /facebook-android-sdk:\$\{FACEBOOK_SDK_VERSION\}/);
  });

  it('appends the ext property once and is idempotent', () => {
    const base = 'buildscript {\r\n  repositories { google() }\r\n}\r\n\r\napply plugin: "expo-root-project"\r\n';
    const once = pin.applyFacebookAndroidSdkVersion(base);
    assert.equal(once.includes('\r'), false);
    assert.equal(once.split(LINE).length - 1, 1);
    assert.match(once, /\/\/ NEARSY_FACEBOOK_SDK_VERSION: /);
    assert.ok(once.startsWith('buildscript {\n'));
    assert.equal(pin.applyFacebookAndroidSdkVersion(once), once);
  });

  it('replaces an existing facebookSdkVersion instead of duplicating it', () => {
    const out = pin.applyFacebookAndroidSdkVersion('ext.facebookSdkVersion = "17.0.0"\napply plugin: "x"\n');
    assert.equal(out, `${LINE}\napply plugin: "x"\n`);
  });

  it('only accepts a Groovy root build.gradle', () => {
    const src = readRepo('apps/nearsy-android/plugins/withFacebookAndroidSdkVersion.js');
    assert.match(src, /withProjectBuildGradle\(/);
    assert.match(src, /modResults\.language !== 'groovy'/);
  });
});

describe('No App Secret, Client Token or App ID hardcodes', () => {
  const FACEBOOK_FILES = [
    'apps/nearsy-android/app.json',
    'apps/nearsy-android/app.config.js',
    'apps/nearsy-android/eas.json',
    'apps/nearsy-android/plugins/facebookAuthConfig.js',
    'apps/nearsy-android/plugins/withFacebookPrivacyHardening.js',
    'apps/nearsy-android/plugins/withFacebookAndroidSdkVersion.js',
    'packages/shared/src/authentication/facebook/facebookAuthCore.ts',
    'packages/shared/src/authentication/facebook/facebookDeleteAccount.ts',
    'packages/shared/src/config/facebookAuthConfig.ts',
    'packages/shared/src/services/facebookLogin.android.ts',
    'packages/shared/src/services/firebaseFacebookAuth.android.ts',
    'packages/shared/src/services/facebookSession.android.ts',
    'packages/shared/src/services/facebookSession.ts',
    'packages/shared/src/hooks/useFacebookSignInFlow.android.ts',
    'packages/shared/src/hooks/useFacebookSignInFlow.ts',
    'packages/shared/src/authentication/facebook/facebookAccountLinking.ts',
    'packages/shared/src/services/firebaseFacebookLink.android.ts',
    'packages/shared/src/services/facebookAccountLinking.android.ts',
    'packages/shared/src/services/facebookAccountLinking.ts',
    'packages/shared/src/screens/SignInMethodsScreen.tsx',
  ];

  it('no App Secret identifiers or env vars anywhere in the Facebook surface', () => {
    for (const file of FACEBOOK_FILES) {
      const src = readRepo(file);
      assert.doesNotMatch(src, /APP_SECRET|appSecret|app_secret|client_secret/i, file);
    }
  });

  it('no 32-hex Client Token literal and no hardcoded App ID in source/config', () => {
    for (const file of FACEBOOK_FILES) {
      const src = readRepo(file);
      assert.doesNotMatch(src, /['"`][a-f0-9]{32}['"`]/i, file);
      assert.equal(src.includes(PUBLIC_APP_ID), false, file);
    }
  });

  it('App ID and Client Token are read from EXPO_PUBLIC env names only', () => {
    const helper = readRepo('apps/nearsy-android/plugins/facebookAuthConfig.js');
    assert.match(helper, /'EXPO_PUBLIC_FACEBOOK_APP_ID'/);
    assert.match(helper, /'EXPO_PUBLIC_FACEBOOK_CLIENT_TOKEN'/);
    const appConfig = readRepo('apps/nearsy-android/app.config.js');
    assert.match(appConfig, /resolveFacebookAuthConfig\(process\.env\)/);
    // Diagnostics never interpolate the token value.
    assert.doesNotMatch(appConfig, /console\.\w+\([^)]*clientToken/);
  });

  it('shared JS never reads the Client Token or logs access tokens', () => {
    for (const file of FACEBOOK_FILES.filter((f) => f.startsWith('packages/'))) {
      const src = readRepo(file);
      assert.equal(src.includes('EXPO_PUBLIC_FACEBOOK_CLIENT_TOKEN'), false, file);
      assert.doesNotMatch(src, /console\.\w+\([^)]*accessToken/, file);
    }
  });

  it('local env files stay gitignored', () => {
    assert.match(readRepo('.gitignore'), /^\.env\*\.local$/m);
  });
});

describe('Native adapters', () => {
  it('SDK adapter: public_profile+email, cancel handling, lazy init, idempotent logout', () => {
    const src = readShared('services/facebookLogin.android.ts');
    assert.match(src, /LoginManager\.logInWithPermissions\(\[\s*\.\.\.FACEBOOK_LOGIN_PERMISSIONS/);
    assert.match(src, /result\.isCancelled/);
    assert.match(src, /AccessToken\.getCurrentAccessToken\(\)/);
    assert.match(src, /Settings\.initializeSDK\(\)/);
    assert.doesNotMatch(src, /AppEventsLogger|setAdvertiserIDCollectionEnabled\(true\)|setAutoLogAppEventsEnabled\(true\)/);
    assert.match(src, /export function logOutFacebookSession[\s\S]*?isNearsyFacebookAuthConfigured\(\)[\s\S]*?try \{[\s\S]*?LoginManager\.logOut\(\)/);
  });

  it('Firebase adapter: FacebookAuthProvider.credential → signIn / reauthenticate, no linking', () => {
    const src = readShared('services/firebaseFacebookAuth.android.ts');
    assert.match(src, /auth\.FacebookAuthProvider\.credential\(accessToken\)/);
    assert.match(src, /firebaseAuth\.signInWithCredential\(credential\)/);
    assert.match(src, /user\.reauthenticateWithCredential\(credential\)/);
    for (const file of [
      'services/firebaseFacebookAuth.android.ts',
      'services/facebookSession.android.ts',
      'authentication/facebook/facebookAuthCore.ts',
      'hooks/useFacebookSignInFlow.android.ts',
    ]) {
      assert.doesNotMatch(readShared(file), /linkWithCredential|linkWithPopup|fetchSignInMethodsForEmail/, file);
    }
  });

  it('non-Android stubs never import the native SDK at runtime', () => {
    for (const file of ['services/facebookSession.ts', 'hooks/useFacebookSignInFlow.ts']) {
      const src = readShared(file);
      assert.doesNotMatch(src, /react-native-fbsdk-next/, file);
      assert.doesNotMatch(src, /^import (?!type )[^;]*\.android'/m, file);
    }
  });
});

describe('Android UI wiring (Welcome / Login)', () => {
  for (const screen of ['screens/LoginScreen.tsx', 'screens/WelcomeScreen.tsx']) {
    it(`${screen}: Facebook tile is wired on Android with loading + a11y label`, () => {
      const src = readShared(screen);
      assert.match(src, /useFacebookSignInFlow\(\)/);
      assert.match(
        src,
        /(provider|p) === 'meta' &&\s*Platform\.OS === 'android' &&\s*isNearsyFacebookAuthConfigured\(\)/,
      );
      assert.match(src, /t\('authentication\.login\.social\.facebook'\)/);
      assert.match(src, /meta: t\('authentication\.social\.facebook\.continue'\)/);
      assert.match(src, /facebookSubmitting\s*\?\s*'meta'/);
      assert.match(src, /linkedInSubmitting \|\| facebookSubmitting/);
    });

    it(`${screen}: Google and LinkedIn branches keep precedence and unchanged gates`, () => {
      const src = readShared(screen);
      const google = src.indexOf("=== 'google'");
      const linkedin = src.indexOf("=== 'linkedin'");
      const meta = src.indexOf("=== 'meta'");
      assert.ok(google > 0 && linkedin > google && meta > linkedin);
      assert.match(src, /isNearsyLinkedInAuthAllowed\(\)/);
      assert.match(src, /signInWithGoogle\(\)/);
      assert.match(src, /comingSoonMessage/);
    });
  }

  it('provider row keeps order and still hides Apple on Android', () => {
    const src = readShared('components/AuthSocialButtonRow.tsx');
    const order = ['logo-google', 'logo-apple', 'logo-facebook', 'logo-linkedin'].map((icon) =>
      src.indexOf(icon),
    );
    assert.deepEqual([...order].sort((a, b) => a - b), order);
    assert.match(src, /Platform\.OS === 'android'\s*\?\s*ALL_PROVIDERS\.filter\(\(p\) => p\.id !== 'apple'\)/);
    assert.match(src, /accessibilityLabels\?\.\[provider\.id\] \?\? labels\[provider\.id\]/);
  });
});

describe('Routing reuse (existing profile gate)', () => {
  const hook = readShared('hooks/useFacebookSignInFlow.android.ts');
  const flow = readShared('authentication/facebook/facebookSignInFlow.ts');

  it('existing complete user → clears prefill and resets to MainTabs', () => {
    assert.match(flow, /const complete = await deps\.isProfileComplete\(result\.uid\)/);
    assert.match(flow, /return complete \? \{ kind: 'mainTabs' \} : profileCompletion/);
    assert.match(hook, /case 'mainTabs':[\s\S]*?clearPendingSocialProfilePrefill\(\);\s*navigation\.reset\(\{\s*index: 0,\s*routes: \[\{ name: 'MainTabs' \}\]/);
  });

  it('new or incomplete user → ProfileCompletion (DOB → OTP → CRJ gate)', () => {
    assert.match(flow, /if \(!profile\) return profileCompletion;/);
    assert.match(flow, /email: result\.email \?\? ''/);
    assert.match(hook, /case 'profileCompletion':[\s\S]*?setTimeout\(/);
    assert.match(hook, /name: 'ProfileCompletion'/);
    assert.match(hook, /email: outcome\.email/);
  });

  it('double tap guarded; in-progress silent; cancel and errors use Facebook copy', () => {
    assert.match(hook, /if \(submittingRef\.current\) return;/);
    assert.match(flow, /if \(err\.code === 'OPERATION_IN_PROGRESS'\) return null;/);
    assert.match(flow, /return \{ titleKey: FACEBOOK_TITLE_KEY, messageKey: err\.messageKey \}/);
    assert.match(flow, /const FACEBOOK_GENERIC_KEY = 'authentication\.social\.facebook\.errors\.generic'/);
    assert.match(hook, /t\(outcome\.alert\.messageKey as any\)/);
    for (const src of [hook, flow]) {
      assert.doesNotMatch(src, /console\.log\([^)]*(uid|email|accessToken)/);
    }
  });

  it('prefill store is the shared social store (no new persistence)', () => {
    const facade = readShared('services/facebookSession.android.ts');
    assert.match(facade, /commitPrefill: setPendingSocialProfilePrefill/);
    assert.doesNotMatch(facade, /AsyncStorage|SecureStore|firestore/i);
  });
});

describe('Logout and Delete Account wiring', () => {
  it('More logout signs out Facebook (when linked) before Firebase signOut', () => {
    const more = readShared('screens/MoreScreen.tsx');
    assert.match(more, /signOutProviderSessions: \(\) => \{\s*if \(hasFacebookProvider\(firebaseAuth\.currentUser\)\) \{\s*logOutFacebookSession\(\);/);
    assert.ok(more.indexOf('signOutProviderSessions') < more.indexOf('await firebaseAuth.signOut()'));
  });

  it('Delete Account: Facebook-only accounts reauth before deleting; password flow preserved', () => {
    const screen = readShared('screens/DeleteAccountScreen.tsx');
    assert.match(screen, /resolveDeleteAccountReauthMethod\(firebaseAuth\.currentUser\) === 'facebook'/);
    assert.match(screen, /reauthenticate: reauthenticateWithFacebook/);
    assert.match(screen, /if \(usesFacebookReauth\) \{\s*await handleFacebookDelete\(\);\s*return;/);
    assert.match(screen, /reauthWithPassword\(pw\)/);
    assert.match(screen, /auth\/requires-recent-login/);
  });
});

describe('i18n EN/ES', () => {
  const en = authenticationTranslations.en;
  const esAuth = authenticationTranslations.es;

  it('exact Facebook copy', () => {
    assert.equal(en.social.facebook.continue, 'Continue with Facebook');
    assert.equal(en.social.facebook.errors.cancelled, 'Facebook sign-in was canceled.');
    assert.equal(
      en.social.facebook.errors.generic,
      'We couldn’t sign you in with Facebook. Please try again.',
    );
    assert.equal(esAuth.social.facebook.continue, 'Continuar con Facebook');
    assert.equal(
      esAuth.social.facebook.errors.cancelled,
      'Se canceló el inicio de sesión con Facebook.',
    );
    assert.equal(
      esAuth.social.facebook.errors.generic,
      'No pudimos iniciar sesión con Facebook. Inténtalo nuevamente.',
    );
    assert.equal(en.login.social.facebook, 'Facebook');
    assert.equal(esAuth.login.social.facebook, 'Facebook');
  });

  // locales/es.ts uses extensionless imports (Metro-only); assert its source.
  const esSource = readShared('i18n/locales/es.ts');
  const esDeleteAccount = esSource.slice(
    esSource.indexOf('deleteAccount: {'),
    esSource.indexOf('blockedPeople: {'),
  );

  it('Delete Account Facebook reauth copy exists in EN and ES', () => {
    assert.ok(settingsEn.deleteAccount.reauthBodyFacebook.includes('Facebook'));
    assert.ok(settingsEn.deleteAccount.reauthContinueFacebook.includes('Facebook'));
    assert.match(esDeleteAccount, /reauthBodyFacebook:\s*'[^']*Facebook[^']*'/);
    assert.match(esDeleteAccount, /reauthContinueFacebook: 'Continuar con Facebook y eliminar'/);
  });

  it('every message key used by the Facebook flow resolves in EN and ES', () => {
    const resolve = (root: unknown, key: string) =>
      key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], root);
    for (const key of [
      'social.facebook.errors.cancelled',
      'social.facebook.errors.generic',
    ]) {
      assert.equal(typeof resolve(en, key), 'string', `EN ${key}`);
      assert.equal(typeof resolve(esAuth, key), 'string', `ES ${key}`);
    }
    for (const leaf of ['reauthCancelled', 'reauthMismatch', 'reauthFailed', 'done', 'error']) {
      assert.equal(
        typeof (settingsEn.deleteAccount as Record<string, unknown>)[leaf],
        'string',
        `EN settings.deleteAccount.${leaf}`,
      );
      assert.match(esDeleteAccount, new RegExp(`\\b${leaf}:`), `ES settings.deleteAccount.${leaf}`);
    }
  });
});

describe('Scope guards', () => {
  it('Apple is not wired on Android by this change', () => {
    for (const file of [
      'hooks/useFacebookSignInFlow.android.ts',
      'services/facebookSession.android.ts',
      'services/facebookLogin.android.ts',
      'services/firebaseFacebookAuth.android.ts',
    ]) {
      assert.doesNotMatch(readShared(file), /apple/i, file);
    }
    const login = readShared('screens/LoginScreen.tsx');
    assert.doesNotMatch(login, /provider === 'apple'/);
  });

  it('react-native-fbsdk-next is an exact Android-only dependency', () => {
    const androidPkg = JSON.parse(readRepo('apps/nearsy-android/package.json'));
    assert.equal(androidPkg.dependencies['react-native-fbsdk-next'], '13.4.3');
    const iosPkg = JSON.parse(readRepo('apps/nearsy-ios/package.json'));
    assert.equal(iosPkg.dependencies?.['react-native-fbsdk-next'], undefined);
  });
});

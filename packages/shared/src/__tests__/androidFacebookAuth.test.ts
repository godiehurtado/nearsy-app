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
  };
};

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

function facebookPlugin(cfg: LoadedConfig) {
  return (cfg.expo.plugins ?? []).find(
    (p): p is [string, Record<string, unknown>] =>
      Array.isArray(p) && p[0] === 'react-native-fbsdk-next',
  );
}

describe('App config: Facebook SDK plugin (env-driven)', () => {
  const configured = {
    EXPO_PUBLIC_FACEBOOK_APP_ID: PUBLIC_APP_ID,
    EXPO_PUBLIC_FACEBOOK_CLIENT_TOKEN: FAKE_TOKEN,
  };

  it('adds react-native-fbsdk-next with env App ID/token, Nearsy name and fb scheme', () => {
    for (const firebaseEnv of ['production', 'development']) {
      const cfg = loadAppConfig({ ...configured, NEARSY_FIREBASE_ENV: firebaseEnv });
      const plugin = facebookPlugin(cfg);
      assert.ok(plugin, `plugin missing for ${firebaseEnv}`);
      const props = plugin[1];
      assert.equal(props.appID, PUBLIC_APP_ID);
      assert.equal(props.clientToken, FAKE_TOKEN);
      assert.equal(props.displayName, 'Nearsy');
      assert.equal(props.scheme, `fb${PUBLIC_APP_ID}`);
      assert.equal(cfg.expo.android?.package, 'com.nearsy.app');
      assert.equal(cfg.expo.extra?.facebookAuthConfigured, true);
    }
  });

  it('auto-init and automatic App Events are disabled', () => {
    const props = facebookPlugin(loadAppConfig(configured))![1];
    assert.equal(props.isAutoInitEnabled, false);
    assert.equal(props.autoLogAppEventsEnabled, false);
  });

  it('advertiser ID collection and tracking prompt are disabled', () => {
    const props = facebookPlugin(loadAppConfig(configured))![1];
    assert.equal(props.advertiserIDCollectionEnabled, false);
    assert.equal(props.iosUserTrackingPermission, false);
  });

  it('never exposes the Client Token through extra', () => {
    const cfg = loadAppConfig(configured);
    assert.equal(JSON.stringify(cfg.expo.extra).includes(FAKE_TOKEN), false);
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
      assert.equal(facebookPlugin(cfg), undefined);
      assert.equal(cfg.expo.extra?.facebookAuthConfigured, false);
    }

    const { resolveFacebookAuthConfig } = requireFromApp('./plugins/facebookAuthConfig') as {
      resolveFacebookAuthConfig: (env: Record<string, string>) => { configured: boolean; issues: string[] };
    };
    const bad = resolveFacebookAuthConfig({
      EXPO_PUBLIC_FACEBOOK_APP_ID: PUBLIC_APP_ID,
      EXPO_PUBLIC_FACEBOOK_CLIENT_TOKEN: 'not-a-valid-token-value',
    });
    assert.equal(bad.configured, false);
    assert.deepEqual(bad.issues, ['EXPO_PUBLIC_FACEBOOK_CLIENT_TOKEN invalid format']);
    assert.equal(bad.issues.join(' ').includes('not-a-valid-token-value'), false);
  });

  it('privacy hardening plugin is always applied (configured or not)', () => {
    for (const env of [{}, configured]) {
      const plugins = loadAppConfig(env).expo.plugins ?? [];
      assert.ok(plugins.includes('./plugins/withFacebookPrivacyHardening'));
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
});

describe('No App Secret, Client Token or App ID hardcodes', () => {
  const FACEBOOK_FILES = [
    'apps/nearsy-android/app.json',
    'apps/nearsy-android/app.config.js',
    'apps/nearsy-android/eas.json',
    'apps/nearsy-android/plugins/facebookAuthConfig.js',
    'apps/nearsy-android/plugins/withFacebookPrivacyHardening.js',
    'packages/shared/src/authentication/facebook/facebookAuthCore.ts',
    'packages/shared/src/authentication/facebook/facebookDeleteAccount.ts',
    'packages/shared/src/config/facebookAuthConfig.ts',
    'packages/shared/src/services/facebookLogin.android.ts',
    'packages/shared/src/services/firebaseFacebookAuth.android.ts',
    'packages/shared/src/services/facebookSession.android.ts',
    'packages/shared/src/services/facebookSession.ts',
    'packages/shared/src/hooks/useFacebookSignInFlow.android.ts',
    'packages/shared/src/hooks/useFacebookSignInFlow.ts',
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

  it('existing complete user → clears prefill and resets to MainTabs', () => {
    assert.match(hook, /const complete = await isProfileComplete\(result\.uid\)/);
    assert.match(hook, /if \(complete\) \{\s*clearPendingSocialProfilePrefill\(\);\s*navigation\.reset\(\{\s*index: 0,\s*routes: \[\{ name: 'MainTabs' \}\]/);
  });

  it('new or incomplete user → ProfileCompletion (DOB → OTP → CRJ gate)', () => {
    assert.match(hook, /if \(!profile\) \{\s*setTimeout\(goToProfileCompletion, 150\)/);
    assert.match(hook, /name: 'ProfileCompletion'/);
    assert.match(hook, /email: emailForProfile/);
    assert.match(hook, /const emailForProfile = result\.email \?\? ''/);
  });

  it('double tap guarded; in-progress silent; cancel and errors use Facebook copy', () => {
    assert.match(hook, /if \(submittingRef\.current\) return;/);
    assert.match(hook, /if \(err\.code === 'OPERATION_IN_PROGRESS'\) return;/);
    assert.match(hook, /t\(err\.messageKey as any\)/);
    assert.match(hook, /t\('authentication\.social\.facebook\.errors\.generic'\)/);
    assert.doesNotMatch(hook, /console\.log\([^)]*(uid|email|accessToken)/);
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

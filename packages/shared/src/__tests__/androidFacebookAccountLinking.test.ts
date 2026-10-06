/**
 * ENH-AUTH-LINK-01 guards: the authenticated Sign-in methods screen is the
 * only place that links Facebook; Welcome/Login never link; adapters keep
 * sign-in and linking separate; More entry, i18n EN/ES, no unlink, no PII,
 * Delete Account and logout untouched.
 *
 * Run:
 *   node --experimental-strip-types --test packages/shared/src/__tests__/androidFacebookAccountLinking.test.ts
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { authenticationTranslations } from '../i18n/resources/authentication.ts';
import settingsEn from '../i18n/resources/settings.ts';
import { messageKeyForFacebookLinkError } from '../authentication/facebook/facebookAccountLinking.ts';

const here = dirname(fileURLToPath(import.meta.url));
const sharedSrc = join(here, '..');

function readShared(file: string): string {
  return readFileSync(join(sharedSrc, file), 'utf8').replace(/\r\n/g, '\n');
}

function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function sourceFiles(dir = sharedSrc): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === '__tests__' || name === 'node_modules') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(name)) {
      out.push(relative(sharedSrc, full).replace(/\\/g, '/'));
    }
  }
  return out;
}

const LINKING_FILES = [
  'authentication/facebook/facebookAccountLinking.ts',
  'authentication/signInMethods.ts',
  'services/firebaseFacebookLink.android.ts',
  'services/facebookAccountLinking.android.ts',
  'services/facebookAccountLinking.ts',
  'screens/SignInMethodsScreen.tsx',
];

const NORMAL_LOGIN_FILES = [
  'screens/LoginScreen.tsx',
  'screens/WelcomeScreen.tsx',
  'hooks/useFacebookSignInFlow.android.ts',
  'hooks/useFacebookSignInFlow.ts',
  'authentication/facebook/facebookSignInFlow.ts',
  'authentication/facebook/facebookAuthCore.ts',
  'services/facebookSession.android.ts',
  'services/firebaseFacebookAuth.android.ts',
];

describe('Single authorized linking point', () => {
  const files = sourceFiles();

  it('linkWithCredential is called only by the dedicated link adapter', () => {
    const callers = files.filter((f) => /\.linkWithCredential\(/.test(readShared(f)));
    assert.deepEqual(callers, ['services/firebaseFacebookLink.android.ts']);
  });

  it('only the Sign-in methods screen creates the Facebook account linker', () => {
    const users = files.filter(
      (f) =>
        /createFacebookAccountLinker\(/.test(readShared(f)) &&
        !f.startsWith('services/facebookAccountLinking'),
    );
    assert.deepEqual(users, ['screens/SignInMethodsScreen.tsx']);
  });

  it('fetchSignInMethodsForEmail is not used anywhere', () => {
    for (const file of files) {
      assert.doesNotMatch(readShared(file), /fetchSignInMethodsForEmail/, file);
    }
  });

  it('Welcome / Login and the normal Facebook sign-in path never link', () => {
    for (const file of NORMAL_LOGIN_FILES) {
      const src = readShared(file);
      assert.doesNotMatch(
        src,
        /linkWithCredential|linkWithPopup|facebookAccountLinking|firebaseFacebookLink|createFacebookAccountLinker/,
        file,
      );
    }
  });

  it('no pending credential: the normal flow keeps no credential for later', () => {
    for (const file of [...NORMAL_LOGIN_FILES, ...LINKING_FILES]) {
      assert.doesNotMatch(readShared(file), /pendingCredential|pendingFacebook|setPendingCredential/i, file);
    }
  });
});

describe('Linking adapters', () => {
  const adapter = readShared('services/firebaseFacebookLink.android.ts');
  const facade = readShared('services/facebookAccountLinking.android.ts');

  it('link adapter: fresh credential → currentUser.linkWithCredential, UID pinned', () => {
    assert.match(adapter, /const user = firebaseAuth\.currentUser;/);
    assert.match(adapter, /if \(user\.uid !== expectedUid\)/);
    assert.match(adapter, /auth\.FacebookAuthProvider\.credential\(accessToken\)/);
    assert.match(adapter, /await user\.linkWithCredential\(credential\)/);
    assert.match(adapter, /await user\.reload\(\)/);
  });

  it('linking files never sign in, unlink, persist, use Graph API or write Firestore', () => {
    for (const file of LINKING_FILES) {
      const src = codeOnly(readShared(file));
      assert.doesNotMatch(src, /signInWithCredential|signInWithCustomToken|signInWithEmail/, file);
      assert.doesNotMatch(src, /\bunlink\b|\.unlink\(|disconnect/i, file);
      assert.doesNotMatch(src, /AsyncStorage|SecureStore|MMKV|firestore|setDoc|updateDoc/i, file);
      assert.doesNotMatch(src, /GraphRequest|graph\.facebook\.com/, file);
      assert.doesNotMatch(src, /apple/i, file);
      assert.doesNotMatch(src, /console\.\w+\([^)]*(accessToken|token|uid|email)/i, file);
    }
  });

  it('facade reuses the native SDK adapter (fresh token) and idempotent logout', () => {
    assert.match(facade, /requestAccessToken: requestFacebookAccessToken/);
    assert.match(facade, /discardProviderSession: logOutFacebookSession/);
    assert.match(facade, /linkWithAccessToken: linkFacebookAccessTokenToCurrentUser/);
    assert.match(facade, /isConfigured: isNearsyFacebookAuthConfigured/);
    const sdk = readShared('services/facebookLogin.android.ts');
    assert.match(
      sdk,
      /requestFacebookAccessToken[\s\S]*?LoginManager\.logOut\(\);\s*const result = await LoginManager\.logInWithPermissions/,
    );
  });

  it('non-Android stub never imports native modules at runtime', () => {
    const stub = readShared('services/facebookAccountLinking.ts');
    assert.doesNotMatch(stub, /react-native-fbsdk-next|@react-native-firebase/);
    assert.doesNotMatch(stub, /^import (?!type )[^;]*\.android'/m);
    assert.match(stub, /code: 'NOT_CONFIGURED'/);
  });
});

describe('More entry and navigation', () => {
  it('More shows Sign-in methods in Account on Android and navigates to it', () => {
    const more = readShared('screens/MoreScreen.tsx');
    assert.match(
      more,
      /\{Platform\.OS === 'android' \? \(\s*<SettingsRow\s*icon="key-outline"\s*title=\{t\('settings\.signInMethods\.title'\)\}\s*onPress=\{\(\) => navigation\.navigate\('SignInMethods'\)\}/,
    );
    const account = more.slice(
      more.indexOf("t('settings.sections.account')"),
      more.indexOf("t('settings.sections.privacy')"),
    );
    assert.ok(account.includes("navigation.navigate('SignInMethods')"));
  });

  it('MoreStack registers SignInMethods next to existing routes', () => {
    const stack = readShared('navigation/MoreStack.tsx');
    assert.match(stack, /SignInMethods: undefined;/);
    assert.match(stack, /<Stack\.Screen name="SignInMethods" component=\{SignInMethodsScreen\} \/>/);
    for (const route of ['MoreHome', 'BlockedPeople', 'DeleteAccount']) {
      assert.match(stack, new RegExp(`<Stack\\.Screen name="${route}"`), route);
    }
  });

  it('logout keeps signing out Facebook before Firebase (unchanged)', () => {
    const more = readShared('screens/MoreScreen.tsx');
    assert.match(
      more,
      /signOutProviderSessions: \(\) => \{\s*if \(hasFacebookProvider\(firebaseAuth\.currentUser\)\) \{\s*logOutFacebookSession\(\);/,
    );
  });
});

describe('Sign-in methods screen', () => {
  const screen = readShared('screens/SignInMethodsScreen.tsx');

  it('rows come from resolveSignInMethods with Connected / Not connected', () => {
    assert.match(screen, /const methods = resolveSignInMethods\(user\);/);
    assert.match(screen, /t\('settings\.signInMethods\.connected'\)/);
    assert.match(screen, /t\('settings\.signInMethods\.notConnected'\)/);
    assert.match(screen, /showChevron=\{false\}/);
  });

  it('Connect Facebook only when signed in, not linked and configured; no disconnect', () => {
    assert.match(
      screen,
      /const canConnectFacebook =\s*!!user && !hasFacebookLinked\(user\) && isNearsyFacebookAuthConfigured\(\);/,
    );
    assert.match(screen, /\{canConnectFacebook \? \(/);
    assert.match(screen, /t\('settings\.signInMethods\.connectFacebook'\)/);
    assert.doesNotMatch(codeOnly(screen), /disconnect|unlink|remove/i);
  });

  it('explicit confirmation alert before Facebook; dismiss counts as cancel', () => {
    assert.match(screen, /t\('settings\.signInMethods\.confirmTitle'\)/);
    assert.match(screen, /onPress: \(\) => resolve\(false\)/);
    assert.match(screen, /onPress: \(\) => resolve\(true\)/);
    assert.match(screen, /onDismiss: \(\) => resolve\(false\)/);
  });

  it('double tap guarded, loading always cleared, cancel silent, errors by message key', () => {
    assert.match(screen, /if \(connectingRef\.current\) return;/);
    assert.match(screen, /finally \{\s*connectingRef\.current = false;\s*setConnecting\(false\);/);
    assert.match(screen, /disabled=\{connecting\}/);
    assert.match(screen, /if \(outcome\.status === 'failed'\) \{\s*Alert\.alert\(\s*t\('settings\.signInMethods\.errors\.title'\),\s*t\(messageKeyForFacebookLinkError\(outcome\.code\)\)/);
    assert.match(screen, /outcome\.status === 'linked' \|\| outcome\.status === 'alreadyLinked'/);
    assert.doesNotMatch(screen, /status === 'cancelled'[\s\S]{0,80}Alert/);
  });

  it('never navigates away or resets the stack after linking', () => {
    assert.doesNotMatch(screen, /navigation\.(reset|replace|navigate)\(/);
  });
});

describe('Delete Account untouched', () => {
  it('Delete Account does not use the linking modules and keeps its reauth rules', () => {
    const screen = readShared('screens/DeleteAccountScreen.tsx');
    assert.doesNotMatch(screen, /facebookAccountLinking|firebaseFacebookLink|signInMethods/);
    assert.match(screen, /resolveDeleteAccountReauthMethod\(firebaseAuth\.currentUser\) === 'facebook'/);
    assert.match(screen, /reauthWithPassword\(pw\)/);
  });
});

describe('i18n EN/ES', () => {
  const en = authenticationTranslations.en.social.facebook.errors;
  const es = authenticationTranslations.es.social.facebook.errors;

  it('account-exists copy (normal Facebook login) is exact and provider-neutral', () => {
    assert.equal(en.accountExistsTitle, 'Account already exists');
    assert.equal(
      en.accountExists,
      'A Nearsy account already exists with this email. Sign in using one of your current methods and connect Facebook from Sign-in methods.',
    );
    assert.equal(es.accountExistsTitle, 'Cuenta existente');
    assert.equal(
      es.accountExists,
      'Ya existe una cuenta de Nearsy con este correo. Inicia sesión con uno de tus métodos actuales y conecta Facebook desde Métodos de inicio de sesión.',
    );
    for (const copy of [en.accountExists, es.accountExists]) {
      assert.doesNotMatch(copy, /google|linkedin|apple|password|contraseña/i);
    }
  });

  const signIn = settingsEn.signInMethods;
  const esSource = readShared('i18n/locales/es.ts');
  const esStart = esSource.indexOf('signInMethods: {');
  const esBlock = esSource.slice(esStart, esSource.indexOf('editor: {', esStart));

  it('screen titles and actions EN/ES', () => {
    assert.equal(signIn.title, 'Sign-in methods');
    assert.equal(signIn.connectFacebook, 'Connect Facebook');
    assert.equal(signIn.connected, 'Connected');
    assert.equal(signIn.notConnected, 'Not connected');
    assert.match(esBlock, /title: 'Métodos de inicio de sesión'/);
    assert.match(esBlock, /connectFacebook: 'Conectar Facebook'/);
    assert.match(esBlock, /connected: 'Conectado'/);
    assert.match(esBlock, /notConnected: 'No conectado'/);
  });

  it('every key used by the screen and the use case exists in EN and ES', () => {
    const screen = readShared('screens/SignInMethodsScreen.tsx');
    const used = new Set(
      [...screen.matchAll(/t\('settings\.signInMethods\.([\w.]+)'/g)].map((m) => m[1]),
    );
    for (const code of [
      'NOT_AUTHENTICATED',
      'USER_CHANGED',
      'NOT_CONFIGURED',
      'TOKEN_MISSING',
      'CREDENTIAL_IN_USE',
      'EMAIL_IN_USE',
      'REQUIRES_RECENT_LOGIN',
      'NETWORK_ERROR',
      'UNKNOWN',
    ] as const) {
      used.add(messageKeyForFacebookLinkError(code).replace('settings.signInMethods.', ''));
    }
    for (const id of ['email', 'google', 'facebook', 'linkedin']) used.add(`methods.${id}`);

    for (const key of used) {
      const value = key
        .split('.')
        .reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], signIn);
      assert.equal(typeof value, 'string', `EN ${key}`);
      const leaf = key.split('.').at(-1)!;
      assert.match(esBlock, new RegExp(`\\b${leaf}:`), `ES ${key}`);
    }
  });

  it('email-in-use and credential-in-use copy never enumerates providers', () => {
    const esErrors = esBlock.slice(esBlock.indexOf('errors: {'));
    for (const copy of [signIn.errors.emailInUse, signIn.errors.credentialInUse, esErrors]) {
      assert.doesNotMatch(copy, /google|linkedin|apple|password|contraseña/i);
    }
    assert.doesNotMatch(signIn.errors.emailInUse, /email/i);
  });

  it('requires-recent-login tells the person to sign out, sign back in and retry', () => {
    assert.equal(
      signIn.errors.requiresRecentLogin,
      'For security, log out, sign back in with your current method and try again.',
    );
    assert.match(
      esBlock,
      /requiresRecentLogin:\s*'Por seguridad, cierra sesión, vuelve a entrar con tu método actual e inténtalo de nuevo\.'/,
    );
  });
});

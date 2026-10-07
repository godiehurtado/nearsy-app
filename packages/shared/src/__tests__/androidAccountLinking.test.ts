/**
 * ENH-AUTH-LINK-01 guards: the authenticated Sign-in methods screen is the
 * only place that links Google or Facebook; Welcome/Login keep signing in;
 * the Login-only preventive Google warning; adapters keep sign-in and linking
 * separate; More entry, i18n EN/ES, no unlink, no PII, Delete Account and
 * logout untouched.
 *
 * Run:
 *   node --experimental-strip-types --test packages/shared/src/__tests__/androidAccountLinking.test.ts
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { authenticationTranslations } from '../i18n/resources/authentication.ts';
import settingsEn from '../i18n/resources/settings.ts';
import { messageKeyForFacebookLinkError } from '../authentication/facebook/facebookAccountLinking.ts';
import { messageKeyForGoogleLinkError } from '../authentication/google/googleAccountLinking.ts';
import type { AccountLinkErrorCode } from '../authentication/accountLinking/accountLinkingCore.ts';

const here = dirname(fileURLToPath(import.meta.url));
const sharedSrc = join(here, '..');
const OUT_OF_SCOPE_PROVIDER = /\x61pple/i;

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
  'authentication/accountLinking/accountLinkingCore.ts',
  'authentication/facebook/facebookAccountLinking.ts',
  'authentication/google/googleAccountLinking.ts',
  'authentication/google/googleLoginWarning.ts',
  'authentication/signInMethods.ts',
  'services/firebaseAccountLink.android.ts',
  'services/accountLinkSession.android.ts',
  'services/accountLinkSession.ts',
  'services/facebookAccountLinking.android.ts',
  'services/facebookAccountLinking.ts',
  'services/googleAccountLinking.android.ts',
  'services/googleAccountLinking.ts',
  'screens/SignInMethodsScreen.tsx',
];

const NORMAL_LOGIN_FILES = [
  'screens/LoginScreen.tsx',
  'screens/WelcomeScreen.tsx',
  'hooks/useFacebookSignInFlow.android.ts',
  'hooks/useFacebookSignInFlow.ts',
  'hooks/useGoogleSignInFlow.ts',
  'authentication/authenticateWithGoogle.ts',
  'authentication/facebook/facebookSignInFlow.ts',
  'authentication/facebook/facebookAuthCore.ts',
  'services/facebookSession.android.ts',
  'services/firebaseFacebookAuth.android.ts',
  'services/firebaseGoogleAuth.android.ts',
  'services/googleAuth.android.ts',
];

describe('Single authorized linking point', () => {
  const files = sourceFiles();

  it('linkWithCredential is called only by the shared link adapter', () => {
    const callers = files.filter((f) => /\.linkWithCredential\(/.test(readShared(f)));
    assert.deepEqual(callers, ['services/firebaseAccountLink.android.ts']);
  });

  it('only the Sign-in methods screen creates the Google and Facebook linkers', () => {
    for (const factory of ['createFacebookAccountLinker', 'createGoogleAccountLinker']) {
      const users = files.filter(
        (f) =>
          new RegExp(`${factory}\\(`).test(readShared(f)) &&
          !/^services\/(facebook|google)AccountLinking/.test(f),
      );
      assert.deepEqual(users, ['screens/SignInMethodsScreen.tsx'], factory);
    }
  });

  it('fetchSignInMethodsForEmail is not used anywhere', () => {
    for (const file of files) {
      assert.doesNotMatch(readShared(file), /fetchSignInMethodsForEmail/, file);
    }
  });

  it('Welcome / Login and the normal Google and Facebook sign-in paths never link', () => {
    for (const file of NORMAL_LOGIN_FILES) {
      assert.doesNotMatch(
        readShared(file),
        /linkWithCredential|linkWithPopup|AccountLinking|firebaseAccountLink|accountLinkingCore|AccountLinker/,
        file,
      );
    }
  });

  it('Welcome / Login keep using sign-in (signInWithCredential via the sign-in use cases)', () => {
    assert.match(readShared('services/firebaseGoogleAuth.android.ts'), /firebaseAuth\.signInWithCredential\(credential\)/);
    assert.match(readShared('services/firebaseFacebookAuth.android.ts'), /firebaseAuth\.signInWithCredential\(credential\)/);
    assert.match(readShared('hooks/useGoogleSignInFlow.ts'), /await authenticateWithGoogle\(\)/);
    for (const screen of ['screens/LoginScreen.tsx', 'screens/WelcomeScreen.tsx']) {
      const src = readShared(screen);
      assert.match(src, /useGoogleSignInFlow\(\)/, screen);
      assert.match(src, /void signInWithGoogle\(\);/, screen);
      assert.match(src, /void signInWithFacebook\(\);/, screen);
      assert.match(src, /void signInWithLinkedIn\(\);/, screen);
    }
  });

  it('no pending credential: nothing keeps a credential for later', () => {
    for (const file of [...NORMAL_LOGIN_FILES, ...LINKING_FILES]) {
      assert.doesNotMatch(
        readShared(file),
        /pendingCredential|pendingFacebook|pendingGoogleCredential|setPendingCredential/i,
        file,
      );
    }
  });
});

describe('Linking adapters', () => {
  const adapter = readShared('services/firebaseAccountLink.android.ts');
  const facebookFacade = readShared('services/facebookAccountLinking.android.ts');
  const googleFacade = readShared('services/googleAccountLinking.android.ts');

  it('link adapter: provider credential → currentUser.linkWithCredential, UID pinned', () => {
    assert.match(adapter, /const user = firebaseAuth\.currentUser;/);
    assert.match(adapter, /if \(user\.uid !== expectedUid\)/);
    assert.match(adapter, /auth\.FacebookAuthProvider\.credential\(accessToken\)/);
    assert.match(adapter, /auth\.GoogleAuthProvider\.credential\(idToken\)/);
    assert.match(adapter, /await user\.linkWithCredential\(credential\)/);
    assert.match(adapter, /await user\.reload\(\)/);
  });

  it('linking files never sign in, create users, unlink, persist, use Graph API or write Firestore', () => {
    for (const file of LINKING_FILES) {
      const src = codeOnly(readShared(file));
      assert.doesNotMatch(src, /signInWithCredential|signInWithCustomToken|signInWithEmail|createUser/, file);
      assert.doesNotMatch(src, /\bunlink\b|\.unlink\(|disconnect/i, file);
      assert.doesNotMatch(src, /AsyncStorage|SecureStore|MMKV|firestore|setDoc|updateDoc|storage\(\)/i, file);
      assert.doesNotMatch(src, /GraphRequest|graph\.facebook\.com/, file);
      assert.doesNotMatch(src, /console\.\w+\([^)]*(accessToken|idToken|token|uid|email)/i, file);
    }
  });

  it('Facebook facade reuses the native SDK adapter (fresh token) and idempotent logout', () => {
    assert.match(facebookFacade, /requestAccessToken: requestFacebookAccessToken/);
    assert.match(facebookFacade, /discardProviderSession: logOutFacebookSession/);
    assert.match(facebookFacade, /linkWithAccessToken: linkFacebookAccessTokenToCurrentUser/);
    assert.match(facebookFacade, /isConfigured: isNearsyFacebookAuthConfigured/);
    assert.match(
      readShared('services/facebookLogin.android.ts'),
      /requestFacebookAccessToken[\s\S]*?LoginManager\.logOut\(\);\s*const result = await LoginManager\.logInWithPermissions/,
    );
  });

  it('Google facade drops the previous Google session, reuses the picker and cleans up', () => {
    assert.match(
      googleFacade,
      /requestIdToken: async \(\) => \{\s*await discardGoogleSignInSession\(\);\s*const \{ idToken \} = await requestGoogleIdToken\(\);\s*return \{ idToken \};/,
    );
    assert.match(googleFacade, /linkWithIdToken: linkGoogleIdTokenToCurrentUser/);
    assert.match(googleFacade, /discardProviderSession: discardGoogleSignInSession/);
    const sdk = readShared('services/googleAuth.android.ts');
    assert.match(
      sdk,
      /export async function discardGoogleSignInSession[\s\S]*?try \{[\s\S]*?await GoogleSignin\.signOut\(\);[\s\S]*?\} catch \{/,
    );
    assert.doesNotMatch(readShared('authentication/authenticateWithGoogle.ts'), /discardGoogleSignInSession/);
  });

  it('non-Android stubs never import native modules at runtime', () => {
    for (const file of [
      'services/facebookAccountLinking.ts',
      'services/googleAccountLinking.ts',
      'services/accountLinkSession.ts',
    ]) {
      const stub = readShared(file);
      assert.doesNotMatch(stub, /react-native-fbsdk-next|@react-native-firebase|google-signin/, file);
      assert.doesNotMatch(stub, /^import (?!type )[^;]*\.android'/m, file);
    }
  });
});

describe('Login preventive Google warning wiring', () => {
  const login = readShared('screens/LoginScreen.tsx');

  it('Login + Google on Android goes through the warning gate, then the existing sign-in', () => {
    assert.match(
      login,
      /if \(provider === 'google'\) \{\s*if \(Platform\.OS === 'android'\) \{\s*void requestGoogleLogin\(confirmGoogleLogin, signInWithGoogle\);\s*return;\s*\}/,
    );
    assert.match(login, /const requestGoogleLogin = useRef\(createGoogleLoginWarningGate\(\)\)\.current;/);
    assert.equal(login.match(/requestGoogleLogin\(/g)?.length, 1);
  });

  it('warning alert: exact keys, Go back cancels, dismiss cancels, Continue proceeds', () => {
    assert.match(login, /t\(GOOGLE_LOGIN_WARNING_KEYS\.title\),\s*t\(GOOGLE_LOGIN_WARNING_KEYS\.message\)/);
    assert.match(
      login,
      /text: t\(GOOGLE_LOGIN_WARNING_KEYS\.back\),\s*style: 'cancel',\s*onPress: \(\) => resolve\(false\)/,
    );
    assert.match(login, /text: t\(GOOGLE_LOGIN_WARNING_KEYS\.continue\),\s*onPress: \(\) => resolve\(true\)/);
    assert.match(login, /onDismiss: \(\) => resolve\(false\)/);
  });

  it('Email, Facebook and LinkedIn branches are unchanged (no warning)', () => {
    const linkedin = login.slice(login.indexOf("provider === 'linkedin'"), login.indexOf("provider === 'meta'"));
    const meta = login.slice(login.indexOf("provider === 'meta'"), login.indexOf('comingSoonTitle'));
    for (const branch of [linkedin, meta]) {
      assert.doesNotMatch(branch, /requestGoogleLogin|GOOGLE_LOGIN_WARNING/);
    }
    const emailLogin = login.slice(login.indexOf('loginWithEmail('), login.indexOf('const confirmGoogleLogin'));
    assert.doesNotMatch(emailLogin, /requestGoogleLogin|GOOGLE_LOGIN_WARNING/);
  });

  it('Welcome, profile creation, Sign-in methods and reauth never show the warning', () => {
    const users = sourceFiles().filter((f) =>
      /googleLoginWarning|GOOGLE_LOGIN_WARNING_KEYS|createGoogleLoginWarningGate/.test(readShared(f)),
    );
    assert.deepEqual(users.sort(), ['authentication/google/googleLoginWarning.ts', 'screens/LoginScreen.tsx']);
    assert.match(
      readShared('screens/WelcomeScreen.tsx'),
      /if \(p === 'google'\) \{\s*void leaveWelcome\(\(\) => \{\s*void signInWithGoogle\(\);/,
    );
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
    assert.doesNotMatch(more, /AccountLinker|discardGoogleSignInSession/);
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

  it('Connect Google / Connect Facebook only when signed in, not linked and configured', () => {
    assert.match(screen, /if \(!user\) return false;/);
    assert.match(
      screen,
      /provider === 'google'\s*\?\s*!hasGoogleLinked\(user\) && isGoogleAccountLinkingConfigured\(\)\s*:\s*!hasFacebookLinked\(user\) && isNearsyFacebookAuthConfigured\(\)/,
    );
    assert.match(screen, /connect: 'settings\.signInMethods\.connectGoogle'/);
    assert.match(screen, /connect: 'settings\.signInMethods\.connectFacebook'/);
  });

  it('no disconnect option', () => {
    assert.doesNotMatch(codeOnly(screen), /disconnect|unlink|remove/i);
  });

  it('explicit per-provider confirmation; dismiss counts as cancel', () => {
    assert.match(screen, /t\(PROVIDER_COPY\[provider\]\.confirmTitle\)/);
    assert.match(screen, /confirmTitle: 'settings\.signInMethods\.confirmGoogleTitle'/);
    assert.match(screen, /confirmTitle: 'settings\.signInMethods\.confirmFacebookTitle'/);
    assert.match(screen, /onPress: \(\) => resolve\(false\)/);
    assert.match(screen, /onPress: \(\) => resolve\(true\)/);
    assert.match(screen, /onDismiss: \(\) => resolve\(false\)/);
  });

  it('one screen-wide lock across Google and Facebook; loading always released', () => {
    assert.match(screen, /const linkRunner = useRef\(createExclusiveLinkRunner<LinkProvider>\(\)\)\.current;/);
    assert.match(screen, /await linkRunner\.run\(provider, async \(\) => \{\s*setConnecting\(provider\);\s*try \{\s*return await linkers\[provider\]\(\);\s*\} finally \{\s*setConnecting\(null\);/);
    assert.match(screen, /const locked = connecting !== null;/);
    assert.match(screen, /disabled=\{locked\}/);
    assert.match(screen, /if \(outcome\.status === 'ignored'\) return;/);
  });

  it('cancel silent; success and errors by provider message keys', () => {
    assert.match(screen, /outcome\.status === 'linked' \|\| outcome\.status === 'alreadyLinked'/);
    assert.match(screen, /Alert\.alert\(t\(copy\.linkedTitle\), t\(copy\.linkedBody\)\)/);
    assert.match(
      screen,
      /if \(outcome\.status === 'failed'\) \{\s*Alert\.alert\(\s*t\(copy\.errorTitle\),\s*t\(ERROR_MESSAGE_KEY\[provider\]\(outcome\.code\)\)/,
    );
    assert.doesNotMatch(screen, /status === 'cancelled'[\s\S]{0,80}Alert/);
  });

  it('never uses the Login warning and never navigates away after linking', () => {
    assert.doesNotMatch(screen, /googleWarning|GoogleLoginWarning/);
    assert.doesNotMatch(screen, /navigation\.(reset|replace|navigate)\(/);
  });
});

describe('Delete Account untouched', () => {
  it('Delete Account does not use the linking modules and keeps its reauth rules', () => {
    const screen = readShared('screens/DeleteAccountScreen.tsx');
    assert.doesNotMatch(screen, /AccountLinking|firebaseAccountLink|accountLinkingCore|signInMethods|googleLoginWarning/);
    assert.match(screen, /resolveDeleteAccountReauthMethod\(firebaseAuth\.currentUser\) === 'facebook'/);
    assert.match(screen, /reauthWithPassword\(pw\)/);
  });
});

describe('Out-of-scope provider stays out of this change', () => {
  it('no linking file, screen or new copy mentions it', () => {
    for (const file of LINKING_FILES) {
      assert.doesNotMatch(readShared(file), OUT_OF_SCOPE_PROVIDER, file);
    }
    const copies = [
      JSON.stringify(settingsEn.signInMethods),
      JSON.stringify(authenticationTranslations.en.login.googleWarning),
      JSON.stringify(authenticationTranslations.es.login.googleWarning),
    ];
    for (const copy of copies) assert.doesNotMatch(copy, OUT_OF_SCOPE_PROVIDER);
  });
});

describe('i18n EN/ES', () => {
  const enAuth = authenticationTranslations.en;
  const esAuth = authenticationTranslations.es;

  it('Login Google warning: exact EN/ES copy', () => {
    assert.deepEqual(enAuth.login.googleWarning, {
      title: 'Use another sign-in method',
      message:
        'If you already have a Nearsy account created with email, Facebook, or another method, sign in with that method first and connect the new one from More → Sign-in methods.\n\nIf you continue directly, your previous sign-in method may no longer be available.',
      back: 'Go back',
      continue: 'Continue with Google',
    });
    assert.deepEqual(esAuth.login.googleWarning, {
      title: 'Usar otro método de inicio de sesión',
      message:
        'Si ya tienes una cuenta de Nearsy creada con correo, Facebook u otro método, inicia sesión primero con ese método y conéctalo desde Más → Métodos de inicio de sesión.\n\nSi continúas directamente, tu método anterior podría dejar de estar disponible.',
      back: 'Volver',
      continue: 'Continuar con Google',
    });
  });

  it('account-exists copy (normal Facebook login) is exact and provider-neutral', () => {
    const en = enAuth.social.facebook.errors;
    const es = esAuth.social.facebook.errors;
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
      assert.doesNotMatch(copy, /google|linkedin|password|contraseña/i);
    }
  });

  const signIn = settingsEn.signInMethods;
  const esSource = readShared('i18n/locales/es.ts');
  const esStart = esSource.indexOf('signInMethods: {');
  const esBlock = esSource.slice(esStart, esSource.indexOf('editor: {', esStart));

  it('screen texts EN/ES', () => {
    assert.equal(signIn.title, 'Sign-in methods');
    assert.equal(signIn.connected, 'Connected');
    assert.equal(signIn.notConnected, 'Not connected');
    assert.equal(signIn.connectGoogle, 'Connect Google');
    assert.equal(signIn.connectFacebook, 'Connect Facebook');
    assert.match(esBlock, /title: 'Métodos de inicio de sesión'/);
    assert.match(esBlock, /connected: 'Conectado'/);
    assert.match(esBlock, /notConnected: 'No conectado'/);
    assert.match(esBlock, /connectGoogle: 'Conectar Google'/);
    assert.match(esBlock, /connectFacebook: 'Conectar Facebook'/);
  });

  it('success copy: Google exact; Facebook preserved', () => {
    assert.equal(signIn.googleLinkedTitle, 'Google connected');
    assert.equal(signIn.googleLinkedBody, 'You can now sign in to Nearsy with Google.');
    assert.match(esBlock, /googleLinkedTitle: 'Google conectado'/);
    assert.match(esBlock, /googleLinkedBody: 'Ahora puedes iniciar sesión en Nearsy con Google\.'/);
    assert.equal(signIn.facebookLinkedTitle, 'Facebook connected');
    assert.equal(signIn.facebookLinkedBody, 'You can now sign in to this Nearsy account with Facebook.');
    assert.match(esBlock, /facebookLinkedTitle: 'Facebook conectado'/);
    assert.match(
      esBlock,
      /facebookLinkedBody: 'Ahora puedes iniciar sesión en esta cuenta de Nearsy con Facebook\.'/,
    );
  });

  it('Google already associated: neutral exact copy, used for credential and email in use', () => {
    assert.match(esBlock, /googleInUse: 'Esta cuenta de Google ya está asociada a otra cuenta de Nearsy\.'/);
    assert.equal(
      signIn.errors.googleInUse,
      'This Google account is already associated with another Nearsy account.',
    );
    assert.equal(messageKeyForGoogleLinkError('CREDENTIAL_IN_USE'), 'settings.signInMethods.errors.googleInUse');
    assert.equal(messageKeyForGoogleLinkError('EMAIL_IN_USE'), 'settings.signInMethods.errors.googleInUse');
  });

  it('every key used by the screen and both use cases exists in EN and ES', () => {
    const screen = readShared('screens/SignInMethodsScreen.tsx');
    const used = new Set(
      [...screen.matchAll(/'settings\.signInMethods\.([\w.]+)'/g)].map((m) => m[1]),
    );
    const codes: AccountLinkErrorCode[] = [
      'NOT_AUTHENTICATED',
      'USER_CHANGED',
      'NOT_CONFIGURED',
      'TOKEN_MISSING',
      'CREDENTIAL_IN_USE',
      'EMAIL_IN_USE',
      'REQUIRES_RECENT_LOGIN',
      'NETWORK_ERROR',
      'UNKNOWN',
    ];
    for (const code of codes) {
      used.add(messageKeyForFacebookLinkError(code).replace('settings.signInMethods.', ''));
      used.add(messageKeyForGoogleLinkError(code).replace('settings.signInMethods.', ''));
    }
    for (const id of ['email', 'google', 'facebook', 'linkedin']) used.add(`methods.${id}`);
    assert.ok(used.size > 20);

    for (const key of used) {
      const value = key
        .split('.')
        .reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], signIn);
      assert.equal(typeof value, 'string', `EN ${key}`);
      const leaf = key.split('.').at(-1)!;
      assert.match(esBlock, new RegExp(`\\b${leaf}:`), `ES ${key}`);
    }
  });

  it('in-use copy never enumerates other providers', () => {
    for (const copy of [signIn.errors.emailInUse, signIn.errors.credentialInUse, signIn.errors.googleInUse]) {
      assert.doesNotMatch(copy, /linkedin|password|contraseña/i);
    }
    assert.doesNotMatch(signIn.errors.emailInUse, /email/i);
    assert.doesNotMatch(signIn.errors.googleInUse, /facebook|email/i);
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

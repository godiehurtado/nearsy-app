/**
 * ENH-AUTH-LINK-01 — preventive warning on Login before a direct Google / Apple sign-in.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import enAuthentication from '../i18n/resources/authentication';
import es from '../i18n/locales/es';
import {
  DIRECT_LOGIN_WARNING_BACK_KEY,
  DIRECT_LOGIN_WARNING_CONTINUE_KEYS,
  DIRECT_LOGIN_WARNING_MESSAGE_KEY,
  DIRECT_LOGIN_WARNING_TITLE_KEY,
  shouldWarnBeforeDirectProviderLogin,
} from '../authentication/social/application/directProviderLoginWarning';

const here = dirname(fileURLToPath(import.meta.url));
const readShared = (rel: string) => readFileSync(join(here, '..', rel), 'utf8');

function lookup(locale: 'en' | 'es', key: string): unknown {
  const root: unknown = locale === 'en' ? { authentication: enAuthentication } : es;
  return key
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined,
      root,
    );
}

describe('Login preventive warning before Google / Apple', () => {
  const login = readShared('screens/LoginScreen.tsx');
  const welcome = readShared('screens/WelcomeScreen.tsx');
  const warningHook = readShared('hooks/useDirectProviderLoginWarning.ts');

  it('policy: only Login + Google / Apple on iOS', () => {
    assert.equal(shouldWarnBeforeDirectProviderLogin('login', 'google', 'ios'), true);
    assert.equal(shouldWarnBeforeDirectProviderLogin('login', 'apple', 'ios'), true);
    for (const provider of ['facebook', 'linkedin', 'email']) {
      assert.equal(shouldWarnBeforeDirectProviderLogin('login', provider, 'ios'), false, provider);
    }
    assert.equal(shouldWarnBeforeDirectProviderLogin('welcome', 'google', 'ios'), false);
    assert.equal(shouldWarnBeforeDirectProviderLogin('welcome', 'apple', 'ios'), false);
    assert.equal(shouldWarnBeforeDirectProviderLogin('login', 'google', 'android'), false);
  });

  it('Login asks before Google / Apple and runs exactly the existing sign-in on Continue', () => {
    assert.match(login, /shouldWarnBeforeDirectProviderLogin\('login', provider, Platform\.OS\)/);
    assert.match(
      login,
      /if \(!\(await confirmDirectProviderLogin\(provider\)\)\) return;\s*if \(provider === 'google'\) void signInWithGoogle\(\);\s*else void signInWithApple\(\);/,
    );
    assert.match(login, /if \(busy\) return;/);
  });

  it('Facebook, LinkedIn and email paths in Login are unchanged', () => {
    assert.match(login, /if \(provider === 'facebook'\) \{\s*void signInWithFacebook\(\);/);
    assert.match(login, /if \(provider === 'linkedin'\) \{\s*void signInWithLinkedIn\(\);/);
    assert.doesNotMatch(
      login.slice(login.indexOf('const handleLogin'), login.indexOf('const handleSocialPress')),
      /confirmDirectProviderLogin/,
    );
  });

  it('Welcome keeps the direct Google / Apple flows without the warning', () => {
    assert.doesNotMatch(welcome, /useDirectProviderLoginWarning|confirmDirectProviderLogin|providerWarning/);
    assert.match(welcome, /void signInWithGoogle\(\);/);
    assert.match(welcome, /void signInWithApple\(\);/);
  });

  it('Sign-in methods and reauthentication never show the warning', () => {
    for (const rel of [
      'screens/SignInMethodsScreen.tsx',
      'hooks/useConnectProviderFlow.ts',
      'screens/DeleteAccountScreen.tsx',
      'services/deletionReauth/reauthenticateForAccountDeletion.ts',
    ]) {
      assert.doesNotMatch(readShared(rel), /confirmDirectProviderLogin|providerWarning/, rel);
    }
  });

  it('Go back / dismiss cancel silently; a second tap never opens another dialog', () => {
    assert.match(warningHook, /if \(openRef\.current\) return Promise\.resolve\(false\);/);
    assert.match(
      warningHook,
      /text: t\(DIRECT_LOGIN_WARNING_BACK_KEY as any\),\s*style: 'cancel',\s*onPress: \(\) => settle\(false\)/,
    );
    assert.match(warningHook, /onPress: \(\) => settle\(true\)/);
    assert.match(warningHook, /onDismiss: \(\) => settle\(false\)/);
  });

  it('never looks up methods by email, reveals accounts or persists provider data', () => {
    for (const src of [
      warningHook,
      login,
      readShared('authentication/social/application/directProviderLoginWarning.ts'),
    ]) {
      assert.doesNotMatch(src, /fetchSignInMethodsForEmail|AsyncStorage|SecureStore|setDoc|updateDoc/);
    }
  });

  it('exact EN / ES copy', () => {
    const expected = {
      en: {
        title: 'Use another sign-in method',
        message:
          'If you already have a Nearsy account created with email, Facebook, or another method, sign in with that method first and connect the new one from Sign-in methods in Settings.\n\nIf you continue directly, your previous sign-in method may no longer be available.',
        back: 'Go back',
        google: 'Continue with Google',
        apple: 'Continue with Apple',
      },
      es: {
        title: 'Usar otro método de inicio de sesión',
        message:
          'Si ya tienes una cuenta de Nearsy creada con correo, Facebook u otro método, inicia sesión primero con ese método y conéctalo desde Métodos de inicio de sesión en Ajustes.\n\nSi continúas directamente, tu método anterior podría dejar de estar disponible.',
        back: 'Volver',
        google: 'Continuar con Google',
        apple: 'Continuar con Apple',
      },
    };
    for (const locale of ['en', 'es'] as const) {
      assert.equal(lookup(locale, DIRECT_LOGIN_WARNING_TITLE_KEY), expected[locale].title);
      assert.equal(lookup(locale, DIRECT_LOGIN_WARNING_MESSAGE_KEY), expected[locale].message);
      assert.equal(lookup(locale, DIRECT_LOGIN_WARNING_BACK_KEY), expected[locale].back);
      assert.equal(lookup(locale, DIRECT_LOGIN_WARNING_CONTINUE_KEYS.google), expected[locale].google);
      assert.equal(lookup(locale, DIRECT_LOGIN_WARNING_CONTINUE_KEYS.apple), expected[locale].apple);
    }
  });
});

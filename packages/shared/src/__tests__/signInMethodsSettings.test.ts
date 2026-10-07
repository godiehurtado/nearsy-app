/**
 * ENH-AUTH-LINK-01 — More → Sign-in methods entry, screen and copy.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import enSettings from '../i18n/resources/settings';
import es from '../i18n/locales/es';
import { buildSignInMethodRows } from '../authentication/social/application/signInMethodsPresentation';

const here = dirname(fileURLToPath(import.meta.url));
const readShared = (rel: string) => readFileSync(join(here, '..', rel), 'utf8');

describe('More → Sign-in methods entry', () => {
  it('registers the authenticated SignInMethods route in the More stack', () => {
    const stack = readShared('navigation/MoreStack.tsx');
    assert.match(stack, /SignInMethods: undefined;/);
    assert.match(stack, /<Stack\.Screen name="SignInMethods" component=\{SignInMethodsScreen\} \/>/);
    assert.match(stack, /<Stack\.Screen name="DeleteAccount" component=\{DeleteAccountScreen\} \/>/);
  });

  it('adds an iOS-only Account row that opens Sign-in methods', () => {
    const more = readShared('screens/MoreScreen.tsx');
    assert.match(more, /title=\{t\('settings\.signInMethods\.title'\)\}/);
    assert.match(more, /navigation\.navigate\('SignInMethods'\)/);
    assert.match(more, /Platform\.OS === 'ios' \? \(\s*<SettingsRow\s+icon="key-outline"/);
    assert.match(more, /navigation\.navigate\('DeleteAccount'\)/);
    assert.match(more, /navigation\.navigate\('BlockedPeople'\)/);
  });

  it('More hub never links accounts itself', () => {
    const more = readShared('screens/MoreScreen.tsx');
    assert.doesNotMatch(more, /linkWithCredential|useConnectProviderFlow|LinkProvider/);
  });
});

describe('Sign-in methods screen', () => {
  const screen = readShared('screens/SignInMethodsScreen.tsx');
  const hook = readShared('hooks/useConnectProviderFlow.ts');

  it('derives rows from Firebase providerData via the linking adapter', () => {
    assert.match(screen, /buildSignInMethodRows\(providerIds\)/);
    assert.match(screen, /accountLinking\.getCurrentAccount\(\)\?\.providerIds/);
    assert.match(screen, /useFocusEffect\(refresh\)/);
  });

  it('shows "Connected" for linked methods and a connect button per missing provider', () => {
    assert.match(screen, /t\('settings\.signInMethods\.linkedLabel'\)/);
    assert.match(screen, /t\('settings\.signInMethods\.notLinkedLabel'\)/);
    assert.match(screen, /google: 'settings\.signInMethods\.connectGoogle'/);
    assert.match(screen, /apple: 'settings\.signInMethods\.connectApple'/);
    assert.match(screen, /facebook: 'settings\.signInMethods\.connectFacebook'/);
    assert.match(
      screen,
      /if \(row\.connectProvider\) return renderConnectRow\(row, row\.connectProvider, isLast\);/,
    );
    assert.match(screen, /onPress=\{\(\) => void connectProvider\(provider\)\}/);
  });

  it('connected / not connected states per provider', () => {
    for (const id of ['google.com', 'apple.com', 'facebook.com'] as const) {
      const missing = buildSignInMethodRows(['password']).find((r) => r.id === id);
      assert.equal(missing?.linked, false);
      assert.ok(missing?.connectProvider);
      const present = buildSignInMethodRows(['password', id]).find((r) => r.id === id);
      assert.equal(present?.linked, true);
      assert.equal(present?.connectProvider, undefined);
    }
  });

  it('phone is never listed as a sign-in method', () => {
    const rows = buildSignInMethodRows(['phone', 'password']);
    assert.equal(rows.some((r) => (r.id as string) === 'phone'), false);
    assert.doesNotMatch(JSON.stringify(enSettings.signInMethods.providers), /phone/i);
  });

  it('offers no disconnect / unlink action', () => {
    for (const src of [screen, hook]) {
      assert.doesNotMatch(src, /unlink\s*\(|disconnect|desconectar|removeProvider/i);
    }
    const copy = JSON.stringify([enSettings.signInMethods, es.settings.signInMethods]);
    assert.doesNotMatch(copy, /disconnect|desconectar|unlink|desvincular/i);
  });

  it('every connect button is disabled while any provider is connecting', () => {
    assert.match(screen, /disabled=\{anyConnecting\}/);
    assert.match(screen, /accessibilityState=\{\{ disabled: anyConnecting, busy: connecting \}\}/);
  });

  it('hook guards double taps, confirms explicitly and always settles', () => {
    assert.match(hook, /if \(busyRef\.current\) return;/);
    assert.match(hook, /t\('settings\.signInMethods\.confirm\.title', params\)/);
    assert.match(hook, /onPress: \(\) => resolve\(false\)/);
    assert.match(hook, /onDismiss: \(\) => resolve\(false\)/);
    assert.match(hook, /shouldSuppressAccountLinkAlert\(err\.code\)/);
    assert.match(
      hook,
      /finally \{\s*busyRef\.current = false;\s*setConnectingProvider\(null\);\s*onSettled\(\);/,
    );
  });

  it('hook surfaces only translated copy, never raw error text', () => {
    assert.doesNotMatch(hook, /err\.message|error\.message|String\(err\)/);
  });
});

describe('Sign-in methods copy (EN / ES)', () => {
  it('uses the contractual entry, state and button labels', () => {
    const en = enSettings.signInMethods;
    const esCopy = es.settings.signInMethods;
    assert.equal(en.title, 'Sign-in methods');
    assert.equal(esCopy.title, 'Métodos de inicio de sesión');
    assert.equal(en.linkedLabel, 'Connected');
    assert.equal(esCopy.linkedLabel, 'Conectado');
    assert.equal(en.notLinkedLabel, 'Not connected');
    assert.equal(esCopy.notLinkedLabel, 'No conectado');
    assert.equal(en.connectGoogle, 'Connect Google');
    assert.equal(esCopy.connectGoogle, 'Conectar Google');
    assert.equal(en.connectApple, 'Connect Apple');
    assert.equal(esCopy.connectApple, 'Conectar Apple');
    assert.equal(en.connectFacebook, 'Connect Facebook');
    assert.equal(esCopy.connectFacebook, 'Conectar Facebook');
  });

  it('contractual success messages', () => {
    assert.deepEqual(enSettings.signInMethods.success.google, {
      title: 'Google connected',
      message: 'You can now sign in to Nearsy with Google.',
    });
    assert.deepEqual(enSettings.signInMethods.success.apple, {
      title: 'Apple connected',
      message: 'You can now sign in to Nearsy with Apple.',
    });
    assert.deepEqual(es.settings.signInMethods.success.google, {
      title: 'Google conectado',
      message: 'Ahora puedes iniciar sesión en Nearsy con Google.',
    });
    assert.deepEqual(es.settings.signInMethods.success.apple, {
      title: 'Apple conectado',
      message: 'Ahora puedes iniciar sesión en Nearsy con Apple.',
    });
    assert.equal(es.settings.signInMethods.success.facebook.title, 'Facebook conectado');
  });

  it('documents the LinkedIn limitation without claiming a state', () => {
    assert.match(enSettings.signInMethods.limitationNote, /LinkedIn, may not appear/);
    assert.match(es.settings.signInMethods.limitationNote, /LinkedIn, pueden no aparecer/);
    assert.equal('linkedin' in enSettings.signInMethods.providers, false);
  });

  it('conflict copy names only the provider being connected, never the other account', () => {
    for (const text of [
      enSettings.signInMethods.errors.credentialInUse,
      es.settings.signInMethods.errors.credentialInUse,
    ]) {
      assert.match(text, /\{\{provider\}\}/);
      assert.doesNotMatch(text, /google|apple|linkedin|facebook|password|contraseña|merge|fusion/i);
    }
  });
});

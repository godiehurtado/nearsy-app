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
    assert.doesNotMatch(more, /linkWithCredential|useConnectFacebookFlow|LinkFacebook/);
  });
});

describe('Sign-in methods screen', () => {
  const screen = readShared('screens/SignInMethodsScreen.tsx');
  const hook = readShared('hooks/useConnectFacebookFlow.ts');

  it('derives rows from Firebase providerData via the linking adapter', () => {
    assert.match(screen, /buildSignInMethodRows\(providerIds\)/);
    assert.match(screen, /accountLinking\.getCurrentAccount\(\)\?\.providerIds/);
    assert.match(screen, /useFocusEffect\(refresh\)/);
  });

  it('shows "Connected" for linked methods and Connect Facebook otherwise', () => {
    assert.match(screen, /t\('settings\.signInMethods\.linkedLabel'\)/);
    assert.match(screen, /t\('settings\.signInMethods\.notLinkedLabel'\)/);
    assert.match(screen, /t\('settings\.signInMethods\.connectFacebook'\)/);
    assert.match(screen, /if \(!row\.linked\) return renderConnectRow\(row, isLast\);/);
  });

  it('Facebook connected and not connected states', () => {
    const notConnected = buildSignInMethodRows(['password']).find((r) => r.id === 'facebook.com');
    assert.equal(notConnected?.linked, false);
    const connected = buildSignInMethodRows(['password', 'facebook.com']).find(
      (r) => r.id === 'facebook.com',
    );
    assert.equal(connected?.linked, true);
  });

  it('offers no disconnect / unlink action', () => {
    for (const src of [screen, hook]) {
      assert.doesNotMatch(src, /unlink\s*\(|disconnect|desconectar|removeProvider/i);
    }
    const copy = JSON.stringify([enSettings.signInMethods, es.settings.signInMethods]);
    assert.doesNotMatch(copy, /disconnect|desconectar|unlink|desvincular/i);
  });

  it('button is disabled and busy while connecting', () => {
    assert.match(screen, /disabled=\{connecting\}/);
    assert.match(screen, /accessibilityState=\{\{ disabled: connecting, busy: connecting \}\}/);
  });

  it('hook guards double taps, confirms explicitly and always settles', () => {
    assert.match(hook, /if \(busyRef\.current\) return;/);
    assert.match(hook, /t\('settings\.signInMethods\.confirm\.title'\)/);
    assert.match(hook, /onPress: \(\) => resolve\(false\)/);
    assert.match(hook, /onDismiss: \(\) => resolve\(false\)/);
    assert.match(hook, /shouldSuppressFacebookLinkAlert\(err\.code\)/);
    assert.match(hook, /finally \{\s*busyRef\.current = false;\s*setConnecting\(false\);\s*onSettled\(\);/);
  });

  it('hook surfaces only translated copy, never raw error text', () => {
    assert.doesNotMatch(hook, /err\.message|error\.message|String\(err\)/);
  });
});

describe('Sign-in methods copy (EN / ES)', () => {
  it('uses the contractual entry and button labels', () => {
    assert.equal(enSettings.signInMethods.title, 'Sign-in methods');
    assert.equal(es.settings.signInMethods.title, 'Métodos de inicio de sesión');
    assert.equal(enSettings.signInMethods.connectFacebook, 'Connect Facebook');
    assert.equal(es.settings.signInMethods.connectFacebook, 'Conectar Facebook');
  });

  it('documents the LinkedIn limitation without claiming a state', () => {
    assert.match(enSettings.signInMethods.limitationNote, /LinkedIn, may not appear/);
    assert.match(es.settings.signInMethods.limitationNote, /LinkedIn, pueden no aparecer/);
    assert.equal('linkedin' in enSettings.signInMethods.providers, false);
  });

  it('credential-in-use copy never names another provider or merges', () => {
    for (const text of [
      enSettings.signInMethods.errors.credentialInUse,
      es.settings.signInMethods.errors.credentialInUse,
    ]) {
      assert.doesNotMatch(text, /google|apple|linkedin|password|contraseña|merge|fusion/i);
    }
  });
});

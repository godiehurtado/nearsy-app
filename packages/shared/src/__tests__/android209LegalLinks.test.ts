/**
 * Privacy Policy is a real link wherever it is presented, and Terms keeps its own destination.
 * Spanish disclosure and notification copy says "Visibilidad".
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PRIVACY_POLICY_URL } from '../constants/legalLinks.ts';

const src = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path: string) => readFileSync(join(src, path), 'utf8');

/** The JSX element around a label, opening tag included. */
function elementAround(source: string, label: string): string {
  const at = source.indexOf(label);
  assert.notEqual(at, -1, label);
  return source.slice(source.lastIndexOf('<Text', at), at);
}

describe('Privacy Policy link', () => {
  it('points at the public policy, not at the Terms page', () => {
    assert.equal(PRIVACY_POLICY_URL, 'https://nearsy.app/privacy-policy');
  });

  for (const [screen, label] of [
    ['screens/WelcomeScreen.tsx', "t('authentication.login.privacyLink')"],
    ['screens/LoginScreen.tsx', "t('authentication.login.privacyLink')"],
    ['screens/RegisterScreen.tsx', "t('authentication.register.privacyLink')"],
  ] as const) {
    it(`opens the policy from ${screen}`, () => {
      const element = elementAround(read(screen), label);
      assert.match(element, /Linking\.openURL\(PRIVACY_POLICY_URL\)/);
      assert.match(element, /accessibilityRole="link"/);
    });
  }

  it('leaves the Register Terms link on its own destination', () => {
    const source = read('screens/RegisterScreen.tsx');
    assert.match(source, /const TERMS_URL = 'https:\/\/nearsy\.app\/legal';/);
    assert.match(
      elementAround(source, "t('authentication.register.termsLink')"),
      /Linking\.openURL\(TERMS_URL\)/,
    );
  });

  it('has the Register copy in both languages', () => {
    const copy = read('i18n/resources/authentication.ts');
    for (const line of [
      "privacyAnd: 'and the'",
      "privacyAnd: 'y la'",
      "privacyLink: 'Privacy Policy'",
      "privacyLink: 'Política de privacidad'",
    ]) {
      assert.ok(copy.includes(line), line);
    }
  });
});

describe('Spanish location copy', () => {
  const es = read('i18n/locales/es.ts');

  it('has no untranslated Visibility in any string', () => {
    assert.deepEqual(es.match(/'[^'\n]*\bVisibility\b[^'\n]*'/g), null);
  });

  it('keeps the internal keys', () => {
    assert.match(es, /backgroundVisibility: \{/);
    assert.match(es, /bulletVisibility:/);
  });
});

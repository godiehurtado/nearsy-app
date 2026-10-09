/**
 * IOS-208-COPY-COMPAT-01 (A) — "country of origin" copy over the persisted
 * `birthCountryCode` field (field name and data unchanged).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import enOnboarding from '../i18n/resources/onboarding';
import enProfile from '../i18n/resources/profile';
import enDiscoveryProfile from '../i18n/resources/discoveryProfile';
import es from '../i18n/locales/es';
import { buildProfileContextWritePatch } from '../profile/profileContextFields';

const here = dirname(fileURLToPath(import.meta.url));
const readShared = (rel: string) => readFileSync(join(here, '..', rel), 'utf8');

const BIRTH_WORDING = /\bborn\b|\bbirth\b|nacimiento|naciste|naci[oó]/i;

function collectStrings(node: unknown, out: string[] = []): string[] {
  if (typeof node === 'string') out.push(node);
  else if (node && typeof node === 'object') {
    for (const value of Object.values(node)) collectStrings(value, out);
  }
  return out;
}

const enIdentity = enOnboarding.profileCompletion.identity;
const esIdentity = es.onboarding.profileCompletion.identity;

describe('CRJ identity — country of origin (EN)', () => {
  it('asks where the user is from', () => {
    assert.equal(enIdentity.birthCountryLabel, 'Where are you from?');
    assert.equal(enIdentity.birthCountryPlaceholder, 'Country of origin');
  });

  it('validation speaks about country of origin', () => {
    assert.equal(
      enIdentity.birthCountryRequired,
      'Select your country of origin to continue',
    );
    assert.equal(
      enIdentity.countriesRequired,
      'Select your country of origin and residence to continue',
    );
  });
});

describe('CRJ identity — país de origen (ES)', () => {
  it('pregunta de dónde es la persona', () => {
    assert.equal(esIdentity.birthCountryLabel, '¿De dónde eres?');
    assert.equal(esIdentity.birthCountryPlaceholder, 'País de origen');
  });

  it('las validaciones hablan de país de origen', () => {
    assert.equal(
      esIdentity.birthCountryRequired,
      'Selecciona tu país de origen para continuar',
    );
    assert.equal(
      esIdentity.countriesRequired,
      'Selecciona tu país de origen y de residencia para continuar',
    );
  });
});

describe('Profile editor — country of origin', () => {
  it('EN label and placeholder', () => {
    assert.equal(enProfile.context.birthCountry, 'Country of origin');
    assert.equal(
      enProfile.context.birthCountryPlaceholder,
      'Select country of origin',
    );
  });

  it('ES label and placeholder', () => {
    assert.equal(es.profile.context.birthCountry, 'País de origen');
    assert.equal(
      es.profile.context.birthCountryPlaceholder,
      'Selecciona el país de origen',
    );
  });
});

describe('No visible birth wording around the country field', () => {
  const subtrees: Array<[string, unknown]> = [
    ['en onboarding identity', enIdentity],
    ['es onboarding identity', esIdentity],
    ['en profile context', enProfile.context],
    ['es profile context', es.profile.context],
    ['en discoveryProfile', enDiscoveryProfile],
    ['es discoveryProfile', es.discoveryProfile],
  ];

  for (const [name, subtree] of subtrees) {
    it(`${name} has no birth/born/nacimiento wording`, () => {
      for (const text of collectStrings(subtree)) {
        assert.doesNotMatch(text, BIRTH_WORDING, `${name}: "${text}"`);
      }
    });
  }

  it('discovered profile keeps the neutral "From / De" row', () => {
    assert.equal(enDiscoveryProfile.from, 'From {{flag}} {{country}}');
    assert.equal(es.discoveryProfile.from, 'De {{flag}} {{country}}');
  });
});

describe('Persisted field is unchanged', () => {
  it('profile patch still writes birthCountryCode', () => {
    const patch = buildProfileContextWritePatch({ birthCountryCode: 'co' });
    assert.equal(patch.birthCountryCode, 'CO');
  });

  it('CRJ and editor still bind birthCountryCode with the same i18n keys', () => {
    const crj = readShared('screens/ProfileCompletionScreen.tsx');
    assert.match(crj, /value=\{birthCountryCode\}/);
    assert.match(crj, /onboarding\.profileCompletion\.identity\.birthCountryLabel/);
    const editor = readShared('screens/CompleteProfileScreen.tsx');
    assert.match(editor, /birthCountry: t\('profile\.context\.birthCountry'\)/);
  });

  it('country field accessibility label derives from the visible label', () => {
    const field = readShared('components/profile/CountrySearchField.tsx');
    assert.match(field, /\(selectedName \? `\$\{label\}, \$\{selectedName\}` : label\)/);
  });
});

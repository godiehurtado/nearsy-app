/**
 * Country of origin — visible EN/ES copy, accessibility and data contract.
 *
 * Run:
 *   node --experimental-strip-types --test packages/shared/src/profileContext/__tests__/countryOfOriginCopy.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import discoveryProfileEn from '../../i18n/resources/discoveryProfile.ts';
import { onboardingTranslations } from '../../i18n/resources/onboarding.ts';
import { profileTranslations } from '../../i18n/resources/profile.ts';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8');

const identityEn = onboardingTranslations.en.profileCompletion.identity;
const identityEs = onboardingTranslations.es.profileCompletion.identity;
const profileEn = profileTranslations.en;
const profileEs = profileTranslations.es;

const OLD_EN = /country of birth|birth country|where were you born|place of birth/i;
const OLD_ES = /pa[ií]s de nacimiento|lugar de nacimiento|d[oó]nde naciste/i;

describe('CRJ — country of origin copy', () => {
  it('EN asks "Where are you from?" with matching help and validation', () => {
    assert.equal(identityEn.birthCountryLabel, 'Where are you from?');
    assert.equal(identityEn.birthCountryPlaceholder, 'Search country of origin');
    assert.equal(
      identityEn.birthCountryRequired,
      'Select your country of origin to continue',
    );
  });

  it('ES asks "¿De dónde eres?" with matching help and validation', () => {
    assert.equal(identityEs.birthCountryLabel, '¿De dónde eres?');
    assert.equal(identityEs.birthCountryPlaceholder, 'Busca tu país de origen');
    assert.equal(
      identityEs.birthCountryRequired,
      'Selecciona tu país de origen para continuar',
    );
  });

  it('residence copy is unchanged', () => {
    assert.equal(identityEn.residenceCountryLabel, 'Where do you live?');
    assert.equal(identityEs.residenceCountryLabel, '¿Dónde vives?');
  });
});

describe('Profile editor — country of origin copy', () => {
  it('EN label and search say "Country of origin"', () => {
    assert.equal(profileEn.fields.birthCountry, 'Country of origin');
    assert.equal(profileEn.placeholders.birthCountrySearch, 'Search country of origin');
  });

  it('ES label and search say "País de origen"', () => {
    assert.equal(profileEs.fields.birthCountry, 'País de origen');
    assert.equal(profileEs.placeholders.birthCountrySearch, 'Busca país de origen');
  });

  it('residence labels are unchanged', () => {
    assert.equal(profileEn.fields.residenceCountry, 'Country of residence');
    assert.equal(profileEs.fields.residenceCountry, 'País de residencia');
  });
});

describe('Discovery — origin row', () => {
  it('EN/ES read "From {{country}}" / "De {{country}}"', () => {
    assert.equal(discoveryProfileEn.context.fromCountry, 'From {{country}}');
    assert.match(read('i18n/locales/es.ts'), /fromCountry: 'De \{\{country\}\}'/);
  });

  it('origin and residence rows are announced without the flag emoji', () => {
    const card = read('components/profileExploration/DiscoveryContextCard.tsx');
    assert.match(card, /accessibilityLabel=\{fromLabel\}/);
    assert.match(card, /accessibilityLabel=\{livesInLabel\}/);
    assert.match(card, /discoveryProfile\.context\.fromCountry/);
  });
});

describe('No legacy "country of birth" wording is visible', () => {
  for (const rel of [
    'i18n/resources/onboarding.ts',
    'i18n/resources/profile.ts',
    'i18n/resources/discoveryProfile.ts',
    'i18n/locales/es.ts',
  ]) {
    it(rel, () => {
      const src = read(rel);
      assert.doesNotMatch(src, OLD_EN);
      assert.doesNotMatch(src, OLD_ES);
    });
  }
});

describe('Country selector accessibility', () => {
  const field = read('components/profileContext/CountrySelectField.tsx');

  it('search input is labelled by the field label', () => {
    assert.match(field, /accessibilityLabel=\{label\}/);
  });

  it('selected country announces the field label', () => {
    assert.match(field, /accessibilityLabel=\{`\$\{label\}: \$\{selected\.label\}`\}/);
  });

  it('clear button uses its own label, not the empty-search message', () => {
    assert.match(field, /accessibilityLabel=\{clearLabel\}/);
    assert.doesNotMatch(field, /accessibilityLabel=\{emptyLabel\}/);
  });

  it('clear labels exist in EN/ES and every call site passes one', () => {
    assert.equal(identityEn.countryClearA11y, 'Clear selected country');
    assert.equal(identityEs.countryClearA11y, 'Quitar el país seleccionado');
    assert.equal(profileEn.context.countryClearA11y, 'Clear selected country');
    assert.equal(profileEs.context.countryClearA11y, 'Quitar el país seleccionado');

    const crj = read('screens/ProfileCompletionScreen.tsx');
    assert.equal((crj.match(/<CountrySelectField/g) ?? []).length, 2);
    assert.equal(
      (crj.match(/identity\.countryClearA11y/g) ?? []).length,
      2,
    );
    const background = read('components/profile/OwnProfileBackgroundCard.tsx');
    assert.equal((background.match(/clearLabel=\{placeholders\.countryClear\}/g) ?? []).length, 2);
    assert.match(
      read('components/profile/OwnProfileDetails.tsx'),
      /countryClear: placeholders\.countryClear/,
    );
    assert.match(
      read('screens/CompleteProfileScreen.tsx'),
      /countryClear: t\('profile\.context\.countryClearA11y'\)/,
    );
  });
});

describe('Data contract is unchanged', () => {
  it('birthCountryCode keeps its name in profile and Discovery wire types', () => {
    assert.match(read('profileContext/profileContextFields.ts'), /birthCountryCode: string \| null;/);
    assert.match(read('visibility/callables/wireTypes.ts'), /birthCountryCode: string \| null;/);
    assert.match(read('visibility/callables/parse.ts'), /'birthCountryCode'/);
  });

  it('CRJ and the profile editor still bind birthCountryCode', () => {
    assert.match(read('screens/ProfileCompletionScreen.tsx'), /value=\{birthCountryCode\}/);
    assert.match(
      read('components/profile/OwnProfileBackgroundCard.tsx'),
      /value=\{values\.birthCountryCode\}/,
    );
    assert.match(read('components/profile/OwnProfileDetails.tsx'), /values=\{context\}/);
  });
});

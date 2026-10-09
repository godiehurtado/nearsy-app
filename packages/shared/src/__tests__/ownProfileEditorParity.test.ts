/**
 * My Profile editor: Profile details → Background → Profile content.
 *
 * Run:
 *   node --experimental-strip-types --test packages/shared/src/__tests__/ownProfileEditorParity.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { profileTranslations } from '../i18n/resources/profile.ts';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8');

const screen = read('screens/CompleteProfileScreen.tsx');
const details = read('components/profile/OwnProfileDetails.tsx');
const background = read('components/profile/OwnProfileBackgroundCard.tsx');
const formInput = read('components/registration/FormInput.tsx');
const countryField = read('components/profileContext/CountrySelectField.tsx');
const languageField = read('components/profileContext/LanguageMultiSelectField.tsx');
const quick = read('components/ProfileQuickActions.tsx');
const crj = read('screens/ProfileCompletionScreen.tsx');

const detailsCard = details.slice(
  details.indexOf('return ('),
  details.indexOf('<OwnProfileBackgroundCard'),
);

function styleBlock(src: string, name: string): string {
  const start = src.indexOf(`  ${name}: {`);
  assert.ok(start >= 0, `style ${name} exists`);
  return src.slice(start, src.indexOf('  },', start));
}

describe('Background is its own card', () => {
  it('EN/ES section title', () => {
    assert.equal(profileTranslations.en.sections.background, 'Background');
    assert.equal(profileTranslations.es.sections.background, 'Trasfondo');
  });

  it('the card renders its title as a header with the shared card tokens', () => {
    assert.match(
      background,
      /accessibilityRole="header"[\s\S]*?\{labels\.sectionTitle\}/,
    );
    assert.match(screen, /backgroundTitle: t\('profile\.sections\.background'\)/);
    assert.match(details, /sectionTitle: labels\.backgroundTitle/);
  });

  it('holds country of origin, country of residence and languages', () => {
    const origin = background.indexOf('label={labels.birthCountry}');
    const residence = background.indexOf('label={labels.residenceCountry}');
    const languages = background.indexOf('label={labels.languages}');
    assert.ok(origin > 0 && origin < residence && residence < languages);
    assert.match(background, /value=\{values\.birthCountryCode\}/);
    assert.match(background, /value=\{values\.residenceCountryCode\}/);
    assert.match(background, /selectedCodes=\{values\.languageCodes\}/);
    assert.equal((background.match(/<CountrySelectField/g) ?? []).length, 2);
    assert.equal((background.match(/<LanguageMultiSelectField/g) ?? []).length, 1);
  });

  it('those fields are no longer inside Profile details', () => {
    assert.doesNotMatch(
      detailsCard,
      /CountrySelectField|LanguageMultiSelectField|labels\.(birthCountry|residenceCountry|languages)/,
    );
    assert.doesNotMatch(details, /import \{ (CountrySelectField|LanguageMultiSelectField) \}/);
  });
});

describe('Profile details keeps its fields for Personal and Professional', () => {
  it('first name → last name → occupation → [company] → biography', () => {
    const order = [
      'label={labels.realName}',
      'label={labels.lastName}',
      'label={labels.occupation}',
      'label={labels.company}',
      'label={labels.biography}',
    ].map((needle) => detailsCard.indexOf(needle));
    assert.ok(order.every((i) => i > 0), 'all fields present');
    assert.deepEqual([...order].sort((a, b) => a - b), order);
  });

  it('company stays Professional-only; Personal keeps the rest', () => {
    assert.match(
      detailsCard,
      /mode === 'professional' \? \(\s*<FormInput\s+label=\{labels\.company\}/,
    );
    assert.equal((detailsCard.match(/mode === 'professional'/g) ?? []).length, 1);
    assert.match(detailsCard, /\{values\.bio\.length\}\/\{bioMaxLength\}/);
  });

  it('Background is shared by both modes (not mode-conditional)', () => {
    assert.doesNotMatch(background, /mode/);
    assert.doesNotMatch(
      details.slice(details.indexOf('<OwnProfileBackgroundCard') - 40),
      /mode === /,
    );
  });
});

describe('Field labels are caps; section titles are not', () => {
  it('form inputs render caps labels', () => {
    assert.match(styleBlock(formInput, 'label'), /textTransform: 'uppercase'/);
  });

  it('country and language fields opt in to caps labels in Background only', () => {
    for (const src of [countryField, languageField]) {
      assert.match(src, /uppercaseLabel = false/);
      assert.match(styleBlock(src, 'labelCaps'), /textTransform: 'uppercase'/);
      assert.doesNotMatch(styleBlock(src, 'label'), /textTransform/);
    }
    assert.equal((background.match(/\n\s+uppercaseLabel\r?\n/g) ?? []).length, 3);
    assert.doesNotMatch(crj, /uppercaseLabel/);
  });

  it('section titles keep their normal case', () => {
    for (const src of [details, background]) {
      assert.doesNotMatch(styleBlock(src, 'sectionTitle'), /textTransform/);
    }
    assert.doesNotMatch(quick, /textTransform/);
    for (const lang of ['en', 'es'] as const) {
      for (const title of Object.values(profileTranslations[lang].sections)) {
        assert.notEqual(title, title.toUpperCase());
      }
    }
  });

  it('i18n field labels stay in natural case', () => {
    for (const lang of ['en', 'es'] as const) {
      for (const label of Object.values(profileTranslations[lang].fields)) {
        assert.notEqual(label, label.toUpperCase(), label);
      }
    }
  });

  it('TalkBack reads the natural-case label, not the caps rendering', () => {
    for (const src of [formInput, countryField, languageField]) {
      assert.match(src, /<Text\s+accessibilityLabel=\{label\}/);
    }
  });
});

describe('Data contracts and writes are unchanged', () => {
  it('the screen wires the same state setters and save patch', () => {
    assert.match(screen, /onChangeBirthCountry=\{setBirthCountryCode\}/);
    assert.match(screen, /onChangeResidenceCountry=\{setResidenceCountryCode\}/);
    assert.match(screen, /onChangeLanguages=\{setLanguageCodes\}/);
    assert.match(screen, /birthCountryCode,\s+residenceCountryCode,\s+languageCodes,/);
    assert.match(screen, /buildOwnProfileSavePatch/);
  });

  it('the card is presentation-only', () => {
    assert.doesNotMatch(
      background,
      /firebase|firestore|updateDoc|setDoc|updateUserProfile|httpsCallable/i,
    );
    assert.match(details, /onChangeBirthCountry=\{onChangeBirthCountry\}/);
    assert.match(details, /onChangeResidenceCountry=\{onChangeResidenceCountry\}/);
    assert.match(details, /onChangeLanguages=\{onChangeLanguages\}/);
  });

  it('the editor still has no phone field; Settings phone stays read-only', () => {
    for (const src of [details, background]) {
      assert.doesNotMatch(src, /phone/i);
    }
    const more = read('screens/MoreScreen.tsx');
    assert.doesNotMatch(more, /savePhone|keyboardType="phone-pad"|buildPhoneSavePatch/);
    assert.match(more, /formatSettingsPhoneValue/);
  });

  it('no out-of-scope provider appears in the editor', () => {
    for (const src of [details, background, formInput, countryField, languageField]) {
      assert.doesNotMatch(src, /\x61pple/i);
    }
  });
});

describe('Theme, large fonts and order', () => {
  it('both cards use theme tokens for light and dark', () => {
    for (const src of [details, background]) {
      assert.match(src, /backgroundColor: palette\.surface/);
      assert.match(src, /borderColor: palette\.border/);
      assert.match(src, /cardShadow/);
      assert.match(styleBlock(src, 'card'), /borderRadius: radius\.card/);
      assert.doesNotMatch(src, /#[0-9a-fA-F]{3,8}\b/);
    }
  });

  it('Background fields keep the same spacing as Profile details', () => {
    assert.match(styleBlock(details, 'stack'), /gap: spacing\.md/);
    for (const src of [countryField, languageField]) {
      assert.match(styleBlock(src, 'wrap'), /marginBottom: spacing\.md/);
    }
    assert.doesNotMatch(background, /styles\.stack/);
  });

  it('labels and titles are never clipped with large fonts', () => {
    for (const src of [details, background, formInput]) {
      assert.doesNotMatch(src, /allowFontScaling=\{false\}|maxFontSizeMultiplier|adjustsFontSizeToFit/);
    }
    for (const src of [details, background]) {
      assert.doesNotMatch(styleBlock(src, 'card'), /(?<![a-zA-Z])height:|maxHeight|overflow/);
      assert.doesNotMatch(styleBlock(src, 'sectionTitle'), /numberOfLines/);
    }
    for (const src of [countryField, languageField]) {
      assert.doesNotMatch(styleBlock(src, 'labelCaps'), /(?<![a-zA-Z])height:/);
    }
    assert.match(screen, /paddingBottom: isDirty \? 120 \+ bottomBarInset : spacing\.xxxl/);
  });

  it('Profile details → Background → Profile content', () => {
    const detailsTitle = details.indexOf('{labels.sectionTitle}');
    const bgCard = details.indexOf('<OwnProfileBackgroundCard');
    assert.ok(detailsTitle > 0 && detailsTitle < bgCard);
    const editor = screen.indexOf('<OwnProfileDetails');
    const content = screen.indexOf('sectionTitle={t(\'profile.sections.content\')}');
    assert.ok(editor > 0 && editor < content);
  });
});

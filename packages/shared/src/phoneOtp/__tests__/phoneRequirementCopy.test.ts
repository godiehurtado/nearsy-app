/**
 * Mandatory phone — justification copy before OTP, read-only Settings.
 *
 * Run:
 *   node --experimental-strip-types --test packages/shared/src/phoneOtp/__tests__/phoneRequirementCopy.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { authenticationTranslations } from '../../i18n/resources/authentication.ts';
import { phoneOtpTranslations } from '../../i18n/resources/phoneOtp.ts';
import settingsEn from '../../i18n/resources/settings.ts';
import { resolveSettingsPhoneStatus } from '../../settings/settingsContracts.ts';
import { resolveOnboardingRoute } from '../onboardingResolver.ts';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8');

const WHY_EN =
  'We verify your phone to protect your account, prevent duplicate accounts, and keep interactions in Discovery and Nearby safer. Your number is never shown on your profile.';
const WHY_ES =
  'Verificamos tu teléfono para proteger tu cuenta, evitar cuentas duplicadas y mantener más seguras las interacciones en Discovery y Nearby. Tu número nunca se muestra en tu perfil.';

describe('OTP justification copy', () => {
  it('EN/ES match the approved text exactly', () => {
    assert.equal(phoneOtpTranslations.en.phoneStep.whyRequired, WHY_EN);
    assert.equal(phoneOtpTranslations.es.phoneStep.whyRequired, WHY_ES);
  });

  it('never claims to identify specific contacts', () => {
    for (const text of [WHY_EN, WHY_ES]) {
      assert.doesNotMatch(text, /contact|contacto|agenda|address book/i);
      assert.doesNotMatch(text, /optional|opcional/i);
    }
  });
});

describe('OTP capture screen', () => {
  const screen = read('screens/PhoneVerificationScreen.android.tsx');
  const capture = screen.slice(
    screen.indexOf("screenPhase === 'capture'"),
    screen.indexOf("screenPhase === 'confirm'"),
  );

  it('shows the justification in the capture step, before the number and Continue', () => {
    const why = capture.indexOf("t('phoneOtp.phoneStep.whyRequired')");
    assert.ok(why > 0);
    assert.ok(why < capture.indexOf('styles.phoneRow'));
    assert.ok(why < capture.indexOf("t('phoneOtp.phoneStep.continue')"));
  });

  it('is not shown only after a code is sent', () => {
    const afterCapture = screen.slice(screen.indexOf("screenPhase === 'confirm'"));
    assert.doesNotMatch(afterCapture, /phoneStep\.whyRequired/);
  });

  it('stays readable with large fonts: scrollable, never truncated', () => {
    assert.match(screen, /<ScrollView[\s\S]*?screenPhase === 'capture'/);
    const panel = capture.slice(capture.indexOf('styles.whyPanel'), capture.indexOf('styles.phoneRow'));
    assert.doesNotMatch(panel, /numberOfLines/);
    assert.doesNotMatch(panel, /adjustsFontSizeToFit|allowFontScaling=\{false\}/);
    assert.match(panel, /accessibilityLabel=\{t\('phoneOtp\.phoneStep\.whyRequired'\)\}/);
    const styles = screen.slice(screen.indexOf('whyPanel: {'), screen.indexOf('phoneRow: {'));
    assert.doesNotMatch(styles, /\bheight:|maxHeight/);
  });
});

describe('OTP remains mandatory: DOB → OTP → CRJ', () => {
  const adult = '1990-05-10';

  it('missing DOB goes to DOB first', () => {
    assert.equal(resolveOnboardingRoute({}).kind, 'needsDateOfBirth');
  });

  it('valid DOB without a verified phone goes to OTP', () => {
    assert.equal(
      resolveOnboardingRoute({ birthDate: adult }).kind,
      'needsPhoneVerification',
    );
    assert.equal(
      resolveOnboardingRoute({ birthDate: adult, phoneVerified: false }).kind,
      'needsPhoneVerification',
    );
  });

  it('only a verified phone reaches CRJ', () => {
    assert.equal(
      resolveOnboardingRoute({ birthDate: adult, phoneVerified: true }).kind,
      'needsProfileCompletion',
    );
  });

  it('the screen has no skip path', () => {
    const screen = read('screens/PhoneVerificationScreen.android.tsx');
    assert.doesNotMatch(screen, /skip|omitir/i);
  });
});

describe('Settings shows the phone read-only', () => {
  const more = read('screens/MoreScreen.tsx');
  const row = more.slice(
    more.indexOf('icon="call-outline"'),
    more.indexOf('icon="calendar-outline"'),
  );
  const es = read('i18n/locales/es.ts');
  const phoneEs = es.slice(es.indexOf('    phone: {'), es.indexOf('    birthDate: {'));

  it('EN/ES label, privacy explanation and status copy', () => {
    assert.deepEqual(settingsEn.phone, {
      title: 'Mobile number',
      hint: 'Required to protect your account. Your number is never shown on your profile.',
      notVerified: 'Not verified',
    });
    assert.match(phoneEs, /title: 'Número móvil'/);
    assert.match(
      phoneEs,
      /hint: 'Obligatorio para proteger tu cuenta\. Tu número nunca se muestra en tu perfil\.'/,
    );
    assert.match(phoneEs, /notVerified: 'No verificado'/);
    for (const text of [JSON.stringify(settingsEn.phone), phoneEs]) {
      assert.doesNotMatch(text, /optional|opcional|placeholder|saved|selectCountry/i);
    }
  });

  it('a verified phone is shown as is', () => {
    assert.deepEqual(
      resolveSettingsPhoneStatus({ phone: '+15555550100', phoneVerified: true }),
      { kind: 'verified', phone: '+15555550100' },
    );
  });

  it('a profile without a phone shows "Not verified"', () => {
    for (const phone of [null, undefined, '', '   ']) {
      assert.deepEqual(
        resolveSettingsPhoneStatus({ phone, phoneVerified: true }),
        { kind: 'unverified', phone: null },
      );
    }
    assert.match(more, /: t\('settings\.phone\.notVerified'\);/);
  });

  it('an unverified legacy phone is labelled "Not verified"', () => {
    for (const phoneVerified of [false, undefined, null]) {
      assert.deepEqual(
        resolveSettingsPhoneStatus({ phone: '+15555550100', phoneVerified }),
        { kind: 'unverified', phone: '+15555550100' },
      );
    }
    assert.match(more, /`\$\{phoneStatus\.phone\} · \$\{t\('settings\.phone\.notVerified'\)\}`/);
  });

  it('the row is not pressable and carries the explanation', () => {
    assert.match(row, /title=\{t\('settings\.phone\.title'\)\}/);
    assert.match(row, /value=\{phoneDisplay\}/);
    assert.match(row, /description=\{t\('settings\.phone\.hint'\)\}/);
    assert.match(row, /showChevron=\{false\}/);
    assert.doesNotMatch(row, /onPress|accessibilityHint/);
  });

  it('TalkBack reads title, value and explanation; large fonts wrap', () => {
    const settingsRow = read('components/settings/SettingsRow.tsx');
    assert.match(settingsRow, /\[title, value, description\]\.filter\(Boolean\)\.join\(', '\)/);
    assert.match(settingsRow, /accessibilityRole="text"\s+accessibilityLabel=\{a11yLabel\}/);
    const description = settingsRow.slice(
      settingsRow.indexOf('{description ? ('),
      settingsRow.indexOf(') : null}', settingsRow.indexOf('{description ? (')),
    );
    assert.doesNotMatch(description, /numberOfLines/);
    assert.match(more, /<ScrollView[\s\S]*?icon="call-outline"/);
  });
});

describe('Settings cannot edit, clear or replace the phone', () => {
  const more = read('screens/MoreScreen.tsx');
  const contracts = read('settings/settingsContracts.ts');
  const withoutStatusCall = more.replace(
    /resolveSettingsPhoneStatus\(\{[\s\S]*?\}\)/,
    '',
  );

  it('no phone editor, input, country picker or save handler exists', () => {
    assert.doesNotMatch(more, /editor === 'phone'|setEditor\('phone'\)|'phone' \|/);
    assert.doesNotMatch(more, /savePhone|openPhoneEditor|phoneLocal|countryModalOpen/);
    assert.doesNotMatch(more, /keyboardType="phone-pad"/);
    assert.doesNotMatch(more, /settings\.phone\.(placeholder|selectCountry|saved|required|invalid)/);
    assert.doesNotMatch(more, /splitStoredPhone|buildFullPhoneNumber|sanitizePhoneNumber/);
  });

  it('no direct write of phone or phoneVerified from Settings', () => {
    assert.doesNotMatch(withoutStatusCall, /(?<![.\w])phone(Verified|VerifiedAt)?\s*:/);
    assert.doesNotMatch(withoutStatusCall, /['"]phone(Verified|VerifiedAt)?['"]\s*:/);
    assert.doesNotMatch(more, /\.phone(Verified|VerifiedAt)?\s*=(?!=)/);
    assert.doesNotMatch(more, /setStoredPhone\((?!data\.phone \?\? null\))/);
    assert.equal((more.match(/setStoredPhone\(/g) ?? []).length, 1);
  });

  it('the settings contract has no phone save patch', () => {
    assert.doesNotMatch(contracts, /buildPhoneSavePatch|PhoneVerificationClearPatch/);
    assert.doesNotMatch(contracts, /phoneVerified\s*:\s*false|phoneVerifiedAt\s*:\s*null/);
  });

  it('no empty-value save path can exist without an editor', () => {
    assert.doesNotMatch(more, /PHONE_REQUIRED|INVALID_PHONE/);
  });
});

describe('Obsolete optional-phone copy', () => {
  it('registration alert treats the phone as required in EN/ES', () => {
    const en = authenticationTranslations.en.register.alerts.invalidPhoneMessage;
    const es = authenticationTranslations.es.register.alerts.invalidPhoneMessage;
    assert.doesNotMatch(en, /if you provide/i);
    assert.doesNotMatch(es, /si proporcionas/i);
    assert.match(en, /required/i);
    assert.match(es, /obligatorio/i);
  });
});

describe('No out-of-scope provider is rendered on Android', () => {
  const OUT_OF_SCOPE = /\x61pple/i;

  it('Settings, Delete Account and OTP screens never mention it', () => {
    for (const rel of [
      'screens/MoreScreen.tsx',
      'screens/DeleteAccountScreen.tsx',
      'screens/PhoneVerificationScreen.android.tsx',
      'components/settings/SettingsRow.tsx',
    ]) {
      assert.doesNotMatch(read(rel), OUT_OF_SCOPE, rel);
    }
  });

  it('Delete Account copy has no dead keys for it in EN/ES', () => {
    assert.doesNotMatch(JSON.stringify(settingsEn.deleteAccount), OUT_OF_SCOPE);
    const es = read('i18n/locales/es.ts');
    const deleteEs = es.slice(es.indexOf('    deleteAccount: {'), es.indexOf('    blockedPeople: {'));
    assert.doesNotMatch(deleteEs, OUT_OF_SCOPE);
  });

  it('the shared social row filters it out on Android', () => {
    assert.match(
      read('components/AuthSocialButtonRow.tsx'),
      /Platform\.OS === 'android'\s*\?\s*ALL_PROVIDERS\.filter\(\(p\) => p\.id !== '\x61pple'\)/,
    );
  });
});

/**
 * Mandatory phone — justification copy before OTP, Settings consistency.
 *
 * Run:
 *   node --experimental-strip-types --test packages/shared/src/phoneOtp/__tests__/phoneRequirementCopy.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { phoneOtpTranslations } from '../../i18n/resources/phoneOtp.ts';
import settingsEn from '../../i18n/resources/settings.ts';
import { buildPhoneSavePatch } from '../../settings/settingsContracts.ts';
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

describe('Settings never presents the phone as optional', () => {
  it('EN/ES placeholder and hint drop "optional"', () => {
    const es = read('i18n/locales/es.ts');
    const phoneEs = es.slice(es.indexOf('    phone: {'), es.indexOf('    birthDate: {'));
    for (const text of [settingsEn.phone.placeholder, settingsEn.phone.hint]) {
      assert.doesNotMatch(text, /optional/i);
    }
    assert.doesNotMatch(phoneEs, /opcional/i);
    assert.equal(settingsEn.phone.placeholder, 'Mobile number');
    assert.match(phoneEs, /placeholder: 'Número móvil'/);
    assert.match(settingsEn.phone.hint, /never shown on your profile/);
    assert.match(phoneEs, /nunca se muestra en tu perfil/);
  });

  it('required message exists in EN/ES', () => {
    assert.ok(settingsEn.phone.required);
    assert.match(read('i18n/locales/es.ts'), /required: 'Tu número de teléfono es obligatorio/);
  });

  it('an empty number cannot be saved', () => {
    for (const nextPhone of [null, '', '   ']) {
      assert.throws(
        () => buildPhoneSavePatch({ previousPhone: '+15555550100', nextPhone }),
        /PHONE_REQUIRED/,
      );
      assert.throws(
        () => buildPhoneSavePatch({ previousPhone: null, nextPhone }),
        /PHONE_REQUIRED/,
      );
    }
  });

  it('existing rules are kept for valid, invalid and unchanged numbers', () => {
    assert.deepEqual(
      buildPhoneSavePatch({ previousPhone: '+15555550100', nextPhone: '+15555550100' }),
      { phone: '+15555550100', verification: null },
    );
    assert.deepEqual(
      buildPhoneSavePatch({ previousPhone: '+15555550100', nextPhone: '+15555550123' }),
      {
        phone: '+15555550123',
        verification: { phoneVerified: false, phoneVerifiedAt: null },
      },
    );
    assert.throws(
      () => buildPhoneSavePatch({ previousPhone: null, nextPhone: '+12' }),
      /INVALID_PHONE/,
    );
  });

  it('More shows the required message instead of saving null', () => {
    const more = read('screens/MoreScreen.tsx');
    assert.match(more, /e\?\.message === 'PHONE_REQUIRED'/);
    assert.match(more, /t\('settings\.phone\.required'\)/);
  });
});

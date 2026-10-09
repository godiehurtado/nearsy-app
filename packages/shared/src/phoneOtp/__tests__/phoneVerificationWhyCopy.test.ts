/**
 * IOS-208-COPY-COMPAT-01 (B) — why the phone is required, shown on the capture
 * step before any code is sent. OTP stays mandatory; Settings never calls the
 * phone optional.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import enPhoneOtp from '../../i18n/resources/phoneOtp';
import enSettings from '../../i18n/resources/settings';
import enAuthentication from '../../i18n/resources/authentication';
import es from '../../i18n/locales/es';

const here = dirname(fileURLToPath(import.meta.url));
const readShared = (rel: string) =>
  readFileSync(join(here, '..', '..', rel), 'utf8');

const EN_WHY =
  'We verify your phone to protect your account, prevent duplicate accounts, and keep interactions in Discovery and Nearby safer. Your number is never shown on your profile.';
const ES_WHY =
  'Verificamos tu teléfono para proteger tu cuenta, evitar cuentas duplicadas y mantener más seguras las interacciones en Discovery y Nearby. Tu número nunca se muestra en tu perfil.';

const CONTACT_DETECTION = /contact|contacto|agenda|address book|find (people|friends)|encontrar (personas|amigos)/i;
const OPTIONAL = /optional|opcional/i;

function captureBlock(src: string): string {
  const start = src.indexOf("screenPhase === 'capture'");
  const end = src.indexOf("screenPhase === 'confirm'");
  assert.ok(start > 0 && end > start, 'capture block present');
  return src.slice(start, end);
}

describe('Phone capture — why we verify', () => {
  it('EN and ES copy match the approved text', () => {
    assert.equal(enPhoneOtp.phoneStep.why, EN_WHY);
    assert.equal(es.phoneOtp.phoneStep.why, ES_WHY);
  });

  it('never claims contact or specific-person detection', () => {
    assert.doesNotMatch(EN_WHY, CONTACT_DETECTION);
    assert.doesNotMatch(ES_WHY, CONTACT_DETECTION);
  });

  it('is rendered on the capture step, before Continue starts verification', () => {
    const capture = captureBlock(readShared('screens/PhoneVerificationScreen.ios.tsx'));
    const whyIdx = capture.indexOf("t('phoneOtp.phoneStep.why')");
    const inputIdx = capture.indexOf("t('phoneOtp.phoneStep.phonePlaceholder')");
    const continueIdx = capture.indexOf("t('phoneOtp.phoneStep.continue')");
    assert.ok(whyIdx > 0, 'why copy on capture');
    assert.ok(whyIdx < inputIdx, 'why copy before the phone input');
    assert.ok(whyIdx < continueIdx, 'why copy before Continue');
  });

  it('wraps freely with large fonts inside the scrollable step body', () => {
    const src = readShared('screens/PhoneVerificationScreen.ios.tsx');
    const capture = captureBlock(src);
    const whyText = capture.slice(
      capture.lastIndexOf('<Text', capture.indexOf("t('phoneOtp.phoneStep.why')")),
      capture.indexOf("t('phoneOtp.phoneStep.why')"),
    );
    assert.doesNotMatch(whyText, /numberOfLines|allowFontScaling|adjustsFontSizeToFit/);
    assert.ok(
      src.indexOf('<ScrollView') < src.indexOf("t('phoneOtp.phoneStep.why')"),
      'why copy lives inside the step ScrollView',
    );
    assert.match(src, /why: \{\s*flex: 1,/);
  });

  it('never renders the number publicly: phone stays out of Discovery wire types', () => {
    const wire = readShared('visibility/callables/wireTypes.ts');
    assert.doesNotMatch(wire, /phone/i);
  });
});

describe('Settings phone copy is consistent with mandatory OTP', () => {
  it('no optional wording on Settings or legacy register phone copy', () => {
    for (const text of [
      enSettings.phone.title,
      enSettings.phone.hint,
      es.settings.phone.title,
      es.settings.phone.hint,
      enAuthentication.register.fields.phone,
      es.authentication.register.fields.phone,
    ]) {
      assert.doesNotMatch(text, OPTIONAL, text);
    }
  });

  it('Settings hint says the number is private and makes no contact claims', () => {
    assert.match(enSettings.phone.hint, /never shown on your profile/);
    assert.match(es.settings.phone.hint, /nunca se muestra en tu perfil/);
    assert.doesNotMatch(enSettings.phone.hint, CONTACT_DETECTION);
    assert.doesNotMatch(es.settings.phone.hint, CONTACT_DETECTION);
  });
});

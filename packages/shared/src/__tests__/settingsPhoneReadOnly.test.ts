/**
 * Nearsy 2.0.8 — Settings shows the mobile number read-only.
 * The phone is mandatory and only set or replaced through backend OTP:
 * no client editor may write `phone`, clear it, or set `phoneVerified`.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import enSettings from '../i18n/resources/settings';
import es from '../i18n/locales/es';
import { resolveSettingsPhoneDisplay } from '../settings/settingsPhoneDisplay';

const here = dirname(fileURLToPath(import.meta.url));
const SHARED_SRC = join(here, '..');
const readShared = (rel: string) => readFileSync(join(SHARED_SRC, rel), 'utf8');

const EN_LABELS = {
  verified: enSettings.phone.verified,
  notVerified: enSettings.phone.notVerified,
};
const ES_LABELS = {
  verified: es.settings.phone.verified,
  notVerified: es.settings.phone.notVerified,
};

function phoneRow(src: string): string {
  const start = src.indexOf('icon="call-outline"');
  assert.ok(start > 0, 'phone row present');
  return src.slice(start, src.indexOf('/>', start));
}

/** Every `setDoc(` / `updateDoc(` call body in a source file. */
function firestoreWrites(src: string): string[] {
  const out: string[] = [];
  const re = /\b(setDoc|updateDoc)\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let depth = 1;
    let i = m.index + m[0].length;
    for (; i < src.length && depth > 0; i += 1) {
      if (src[i] === '(') depth += 1;
      else if (src[i] === ')') depth -= 1;
    }
    out.push(src.slice(m.index, i));
  }
  return out;
}

function listSources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === '__tests__' || name === 'node_modules') continue;
      out.push(...listSources(full));
    } else if (/\.(ts|tsx)$/.test(name) && !/\.android\.tsx?$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

describe('Settings phone display (pure)', () => {
  it('verified phone shows the number', () => {
    assert.deepEqual(
      resolveSettingsPhoneDisplay({
        phone: '+15551234567',
        phoneVerified: true,
        labels: EN_LABELS,
      }),
      { status: 'verified', phone: '+15551234567', value: '+15551234567' },
    );
  });

  it('missing phone shows a neutral "Not verified" / "No verificado"', () => {
    for (const phone of [null, undefined, '', '   ', 42]) {
      assert.deepEqual(
        resolveSettingsPhoneDisplay({ phone, phoneVerified: undefined, labels: EN_LABELS }),
        { status: 'unverified', phone: null, value: 'Not verified' },
      );
      assert.equal(
        resolveSettingsPhoneDisplay({ phone, phoneVerified: false, labels: ES_LABELS }).value,
        'No verificado',
      );
    }
  });

  it('historical unverified number is shown with its status', () => {
    assert.equal(
      resolveSettingsPhoneDisplay({
        phone: '+15551234567',
        phoneVerified: false,
        labels: ES_LABELS,
      }).value,
      '+15551234567 · No verificado',
    );
  });

  it('verified account without a stored number never reads as "Not verified"', () => {
    assert.deepEqual(
      resolveSettingsPhoneDisplay({ phone: null, phoneVerified: true, labels: EN_LABELS }),
      { status: 'verified', phone: null, value: 'Verified' },
    );
  });

  it('only a strict boolean true counts as verified', () => {
    for (const phoneVerified of ['true', 1, {}, null]) {
      assert.equal(
        resolveSettingsPhoneDisplay({ phone: '+15551234567', phoneVerified, labels: EN_LABELS })
          .status,
        'unverified',
      );
    }
  });
});

describe('Settings phone copy (EN/ES)', () => {
  it('label, statuses and privacy note', () => {
    assert.equal(enSettings.phone.title, 'Mobile number');
    assert.equal(es.settings.phone.title, 'Número móvil');
    assert.equal(enSettings.phone.verified, 'Verified');
    assert.equal(es.settings.phone.verified, 'Verificado');
    assert.equal(enSettings.phone.notVerified, 'Not verified');
    assert.equal(es.settings.phone.notVerified, 'No verificado');
    assert.match(enSettings.phone.hint, /protect your account.*never shown on your profile/);
    assert.match(es.settings.phone.hint, /proteger tu cuenta.*nunca se muestra en tu perfil/);
  });

  it('no editor copy remains (placeholder / save / invalid / country picker)', () => {
    for (const phone of [enSettings.phone, es.settings.phone] as Array<Record<string, string>>) {
      assert.deepEqual(Object.keys(phone).sort(), ['hint', 'notVerified', 'title', 'verified']);
    }
  });
});

describe('Settings phone row is read-only', () => {
  const more = readShared('screens/MoreScreen.tsx');

  it('row has no press handler, edit hint or chevron and carries the note', () => {
    const row = phoneRow(more);
    assert.doesNotMatch(row, /onPress/);
    assert.doesNotMatch(row, /settings\.editor\.edit/);
    assert.match(row, /showChevron=\{false\}/);
    assert.match(row, /title=\{t\('settings\.phone\.title'\)\}/);
    assert.match(row, /value=\{phoneDisplay\.value\}/);
    assert.match(row, /note=\{t\('settings\.phone\.hint'\)\}/);
  });

  it('there is no phone editor, input, country picker or save path', () => {
    assert.doesNotMatch(more, /EditorKind = [^;]*'phone'/);
    assert.doesNotMatch(more, /editor === 'phone'/);
    assert.doesNotMatch(more, /setEditor\('phone'\)/);
    assert.doesNotMatch(more, /openPhoneEditor|savePhone|phoneLocal|setStoredPhone\(patch/);
    assert.doesNotMatch(more, /keyboardType="phone-pad"/);
    assert.doesNotMatch(more, /countryModalOpen|AMERICA_COUNTRIES|selectedCountry/);
    assert.doesNotMatch(more, /buildFullPhoneNumber|sanitizePhoneNumber|splitStoredPhone/);
  });

  it('read-only rows render as accessible text, notes wrap without a line cap', () => {
    const rowSrc = readShared('components/settings/SettingsRow.tsx');
    assert.match(rowSrc, /accessibilityRole="text"/);
    assert.match(rowSrc, /\[title, value, note\]\.filter\(Boolean\)\.join\(', '\)/);
    const noteBlock = rowSrc.slice(rowSrc.indexOf('{note ? ('), rowSrc.indexOf('{note}'));
    assert.doesNotMatch(noteBlock, /numberOfLines|allowFontScaling|adjustsFontSizeToFit/);
  });
});

describe('No direct phone writes from client editors (static guard)', () => {
  const EDITOR_SURFACES = [
    'screens/MoreScreen.tsx',
    'screens/CompleteProfileScreen.tsx',
    'screens/ProfileCompletionScreen.tsx',
    'profile/ownProfileEditorState.ts',
    'profile/profileContextFields.ts',
    'settings/settingsContracts.ts',
  ];

  for (const rel of EDITOR_SURFACES) {
    it(`${rel} never writes phone / phoneVerified / phoneVerifiedAt`, () => {
      const src = readShared(rel);
      for (const call of firestoreWrites(src)) {
        assert.doesNotMatch(call, /phone/i, `${rel}: ${call.slice(0, 80)}`);
      }
      assert.doesNotMatch(
        src,
        /(?:^|[\s{,])phone(?:Verified|VerifiedAt)?\s*:\s*(?:null|false|true|patch|''|"")/m,
        'object key writing phone fields',
      );
      assert.doesNotMatch(src, /\.phone(?:Verified|VerifiedAt)?\s*=(?!=)/, 'assignment');
      assert.doesNotMatch(src, /\[['"]phone/);
    });
  }

  it('MoreScreen only reads phone / phoneVerified from the profile snapshot', () => {
    const more = readShared('screens/MoreScreen.tsx');
    const writes = firestoreWrites(more);
    assert.ok(writes.length > 0, 'other settings still write');
    assert.ok(writes.every((w) => !/phone/i.test(w)));
    assert.match(more, /setPhoneVerified\(data\.phoneVerified === true\)/);
  });

  it('phoneVerified=false is only set when a brand-new account is created', () => {
    const offenders = listSources(SHARED_SRC)
      .filter((file) => /phoneVerified\s*[:=]\s*false/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(SHARED_SRC, file).replace(/\\/g, '/'))
      .sort();
    assert.deepEqual(offenders, [
      'phoneOtp/callables/fakeClient.ts',
      'screens/RegisterScreen.tsx',
    ]);
    const register = readShared('screens/RegisterScreen.tsx');
    assert.match(
      register,
      /registerWithEmail\([\s\S]*?createUserProfile\(user\.uid, \{[\s\S]*?phoneVerified: false/,
    );
  });
});

describe('Onboarding DOB → OTP → CRJ is unchanged', () => {
  it('PhoneVerification stays registered and still hands off to ProfileCompletion', () => {
    const nav = readShared('navigation/AppNavigator.tsx');
    assert.match(nav, /name="PhoneVerification"/);
    const screen = readShared('screens/PhoneVerificationScreen.ios.tsx');
    assert.match(screen, /navigation\.replace\('ProfileCompletion'/);
    assert.match(screen, /startVerification/);
    assert.match(screen, /checkCode/);
  });

  it('resolver still gates on a server-verified phone', () => {
    const resolver = readShared('phoneOtp/onboardingResolver.ts');
    assert.match(resolver, /snapshot\.phoneVerified !== true/);
  });
});

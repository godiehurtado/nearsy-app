/**
 * Play Prominent Disclosure — build-44 defect fix.
 * Evidence 29 Oct: OS location dialog after More → Stay visible without
 * immediate preceding in-app disclosure.
 *
 * Run:
 *   node --experimental-strip-types --test packages/shared/src/__tests__/android209ProminentDisclosure.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = join(ROOT, '..', '..', '..');

function readSrc(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

describe('More Stay visible disclosure order', () => {
  it('enable path shows disclosure before any OS location request', () => {
    const more = readSrc('screens/MoreScreen.tsx');
    const enablePath = more.slice(
      more.indexOf('// Play Prominent Disclosure'),
      more.indexOf('setBgDisclosureVisible(true)') + 40,
    );
    assert.match(enablePath, /setBgDisclosureVisible\(true\)/);
    assert.doesNotMatch(enablePath, /requestForegroundPermissionsAsync/);
    assert.doesNotMatch(enablePath, /requestBackgroundPermissionsAsync/);
    assert.doesNotMatch(enablePath, /Linking\.openSettings/);
    assert.doesNotMatch(enablePath, /startGatedBackgroundLocation/);
    assert.doesNotMatch(
      enablePath,
      /backgroundGranted &&[\s\S]*foregroundGranted/,
    );
  });

  it('requests FG/BG only after disclosure Enable', () => {
    const more = readSrc('screens/MoreScreen.tsx');
    const after = more.slice(
      more.indexOf('const runBackgroundEnableAfterDisclosure'),
      more.indexOf('const handleToggleBg = async'),
    );
    assert.match(after, /Affirmative consent already happened/);
    assert.match(after, /requestForegroundPermissionsAsync/);
    const fgIdx = after.indexOf('requestForegroundPermissionsAsync');
    const consentIdx = after.indexOf('Affirmative consent already happened');
    assert.ok(consentIdx >= 0 && fgIdx > consentIdx);
    assert.match(after, /!snap\.backgroundGranted/);
  });
});

describe('Home / CRJ entry points', () => {
  it('does not call ensureForegroundPermission before post-login education', () => {
    const home = readSrc('screens/MainHomeScreen.tsx');
    const marker = 'postLoginRecoveryStartedRef.current = true';
    const start = home.indexOf(marker);
    assert.ok(start > 0);
    const recovery = home.slice(start, start + 700);
    assert.match(
      recovery,
      /offerBackgroundEducationIfNeeded\(\{ forceFull: true \}\)/,
    );
    assert.doesNotMatch(
      recovery,
      /const perm = await ensureForegroundPermission/,
    );
  });

  it('Visibility ON requires affirmative location consent before activate', () => {
    const home = readSrc('screens/MainHomeScreen.tsx');
    assert.match(home, /home\.visibility\.locationConsentTitle/);
    assert.match(home, /home\.visibility\.locationConsentContinue/);
    assert.match(
      home,
      /locationConsentContinue'\)[\s\S]{0,120}activateVisibility\(\)/,
    );
  });

  it('CRJ location step discloses collection before Enable', () => {
    const en = readSrc('i18n/resources/onboarding.ts');
    assert.match(
      en,
      /Nearsy collects your device location while you use the app/,
    );
    assert.match(en, /Location is sent securely to Nearsy/);
  });
});

describe('Background disclosure copy + Contacts', () => {
  it('BG education uses Play closed/not-in-use language EN/ES', () => {
    const en = readSrc('i18n/resources/settings.ts');
    const es = readSrc('i18n/locales/es.ts');
    assert.match(en, /collects location data/);
    assert.match(en, /even when the app is closed or not in use/);
    assert.match(es, /recopila datos de ubicación/);
    assert.match(es, /cerrada o no se use/);
  });

  it('Contacts consent precedes sync and describes TLS + HMAC', () => {
    const more = readSrc('screens/MoreScreen.tsx');
    const en = readSrc('i18n/resources/settings.ts');
    const es = readSrc('i18n/locales/es.ts');
    const appJson = readFileSync(
      join(REPO, 'apps', 'nearsy-android', 'app.json'),
      'utf8',
    );
    assert.match(more, /contactsSync\.consentTitle/);
    assert.match(more, /consentContinue[\s\S]*runContactsSyncEnable/);
    assert.match(en, /sends them over TLS to Nearsy Identity/);
    assert.match(en, /HMAC-hash/);
    assert.match(en, /consentBody:[\s\S]*Nearsy Identity/);
    assert.doesNotMatch(en, /not names or your address book/);
    assert.doesNotMatch(en, /only hashed identifiers/);
    assert.match(es, /TLS a Nearsy Identity/);
    assert.match(es, /HMAC/);
    assert.match(appJson, /sent over TLS to Nearsy Identity/);
    assert.doesNotMatch(appJson, /stores only hashed identifiers/);
  });
});

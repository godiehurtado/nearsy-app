import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildBirthDatePersistencePatch,
  buildPhoneSavePatch,
  SETTINGS_MAX_AGE,
  SETTINGS_MIN_AGE,
  validateSettingsBirthDate,
  validateVisibilityAgeRange,
} from '../settings/settingsContracts';

const here = dirname(fileURLToPath(import.meta.url));

function readShared(relativeFromSharedSrc: string): string {
  return readFileSync(join(here, '..', relativeFromSharedSrc), 'utf8');
}

describe('More Settings modernization', () => {
  it('removes TopHeader, tab-root back chevron, contacts toggle, and blocked contacts', () => {
    const screen = readShared('screens/MoreScreen.tsx');
    assert.doesNotMatch(screen, /TopHeader/);
    assert.doesNotMatch(screen, /chevron-back/);
    assert.doesNotMatch(screen, /contactsSync/);
    assert.doesNotMatch(screen, /syncContactsSafe/);
    assert.doesNotMatch(screen, /Use phone contacts/);
    assert.doesNotMatch(screen, /blockedContacts/);
    assert.doesNotMatch(screen, /Blocked contacts/);
    assert.match(screen, /useAppTheme/);
    assert.match(screen, /t\('settings\.title'\)/);
  });
});

describe('Settings DOB contract', () => {
  it('does not expose an editable birthYear control in More', () => {
    const screen = readShared('screens/MoreScreen.tsx');
    assert.doesNotMatch(screen, /Year of birth/);
    assert.doesNotMatch(screen, /setBirthYear\(/);
    assert.match(screen, /birthDate/);
    assert.match(screen, /buildBirthDatePersistencePatch/);
  });

  it('requires complete adult DOB and derives birthYear from birthDate', () => {
    const ok = validateSettingsBirthDate({
      day: 15,
      month: 6,
      year: 1990,
    });
    assert.equal(ok.ok, true);
    if (ok.ok) {
      const patch = buildBirthDatePersistencePatch({
        day: 15,
        month: 6,
        year: 1990,
      });
      assert.equal(patch.birthDate, '1990-06-15');
      assert.equal(patch.birthYear, 1990);
    }

    const young = validateSettingsBirthDate({
      day: 1,
      month: 1,
      year: new Date().getFullYear() - 10,
    });
    assert.equal(young.ok, false);

    const old = validateSettingsBirthDate({
      day: 1,
      month: 1,
      year: new Date().getFullYear() - (SETTINGS_MAX_AGE + 1),
    });
    assert.equal(old.ok, false);

    const incomplete = validateSettingsBirthDate({
      day: null,
      month: 6,
      year: 1990,
    });
    assert.equal(incomplete.ok, false);
  });

  it('uses canonical age bounds 18–99', () => {
    assert.equal(SETTINGS_MIN_AGE, 18);
    assert.equal(SETTINGS_MAX_AGE, 99);
  });
});

describe('Settings phone verification invalidation', () => {
  it('invalidates verification only when canonical phone changes', () => {
    const same = buildPhoneSavePatch({
      previousPhone: '+15551234567',
      nextPhone: '+15551234567',
    });
    assert.equal(same.verification, null);

    const changed = buildPhoneSavePatch({
      previousPhone: '+15551234567',
      nextPhone: '+15559876543',
    });
    assert.deepEqual(changed.verification, {
      phoneVerified: false,
      phoneVerifiedAt: null,
    });
  });

  it('does not add OTP behavior to More', () => {
    const screen = readShared('screens/MoreScreen.tsx');
    assert.doesNotMatch(screen, /PhoneVerification/);
    assert.doesNotMatch(screen, /Twilio/);
    assert.doesNotMatch(screen, /sendSms/i);
  });
});

describe('Settings visibility age contract', () => {
  it('validates 18–99 and preserves field names', () => {
    assert.deepEqual(validateVisibilityAgeRange('18', '99'), {
      ok: true,
      min: 18,
      max: 99,
    });
    assert.equal(validateVisibilityAgeRange('13', '40').ok, false);
    assert.equal(validateVisibilityAgeRange('40', '20').ok, false);

    const screen = readShared('screens/MoreScreen.tsx');
    assert.match(screen, /visibleToMinAge/);
    assert.match(screen, /visibleToMaxAge/);
    assert.doesNotMatch(screen, /searchPreferences/);
  });
});

describe('Settings background / language / logout / delete preservation', () => {
  it('preserves bgVisible and language contracts', () => {
    const screen = readShared('screens/MoreScreen.tsx');
    assert.match(screen, /bgVisible/);
    assert.match(screen, /startBackgroundLocation/);
    assert.match(screen, /stopBackgroundLocation/);
    assert.match(screen, /changeAppLanguage/);
    assert.match(screen, /firebaseAuth\.signOut/);
    assert.match(screen, /navigate\('DeleteAccount'\)/);
  });

  it('delete screen finalizes guest Login after success and cleans up before Auth', () => {
    const screen = readShared('screens/DeleteAccountScreen.tsx');
    assert.match(screen, /deleteAccountAndData/);
    assert.match(screen, /finalizePostAccountDeletionSession/);
    assert.match(screen, /navigationRef/);
    assert.doesNotMatch(screen, /navigateToLogin/);
    assert.doesNotMatch(screen, /TopHeader/);
    assert.match(screen, /useAppTheme/);

    const session = readShared('services/accountDeletionSession.ts');
    assert.match(session, /routes: \[\{ name: 'Login' \}\]/);

    const service = readShared('services/accountDeletion.ts');
    assert.match(service, /deleteContactHashes/);
    assert.match(service, /deleteUserStorage/);
    assert.match(service, /deleteUserDocument/);
    assert.match(service, /auth-delete/);
    const authIdx = service.indexOf("onStep?.('auth-delete')");
    const hashesIdx = service.indexOf(
      "onStep?.('cleanup-firestore-contactHashes')",
    );
    assert.ok(hashesIdx >= 0 && authIdx > hashesIdx);
  });
});

describe('Settings safety freeze', () => {
  it('does not call contacts sync or mutate blockedContacts from More', () => {
    const screen = readShared('screens/MoreScreen.tsx');
    assert.doesNotMatch(screen, /setContactsSyncEnabled/);
    assert.doesNotMatch(screen, /disableContactsSyncAndPurge/);
    assert.doesNotMatch(screen, /blockedContacts:/);
    assert.doesNotMatch(screen, /Matching/);
    assert.doesNotMatch(screen, /Vertex/);
    assert.doesNotMatch(screen, /discoverNearby/);
  });
});

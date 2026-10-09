import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

import settings from '../../i18n/resources/settings';
import es from '../../i18n/locales/es';
import {
  DELETE_METHOD_ACTION_KEY,
  DELETE_METHOD_LABEL_KEY,
  buildDeleteAccountOptions,
  buildDeletionRequest,
  canSubmitDeletion,
  isDeleteConfirmationText,
  pickSelectedMethod,
  resolveSessionGuidanceKey,
  summarizeDeletionReauthProviders,
} from '../deleteAccountPresentation';

const sharedSrc = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(sharedSrc, rel), 'utf8');

const PASSWORD = { providerId: 'password', uid: 'p1', email: 'a@b.com' };
const GOOGLE = { providerId: 'google.com', uid: 'g1' };
const APPLE = { providerId: 'apple.com', uid: 'a1' };
const FACEBOOK = { providerId: 'facebook.com', uid: 'f1' };
const kinds = (providerData: object[], uid = 'uid-1') =>
  buildDeleteAccountOptions(providerData as any, uid).methods.map((m) => m.kind);

describe('Delete Account methods — only safe methods actually linked', () => {
  it('one provider: a single method, selected by default', () => {
    const options = buildDeleteAccountOptions([GOOGLE], 'uid-1');
    assert.deepEqual(options.methods.map((m) => m.kind), ['google']);
    assert.equal(pickSelectedMethod(options, null)?.kind, 'google');
    assert.equal(options.recentSessionOnly, false);
  });

  it('password + Google', () => {
    assert.deepEqual(kinds([GOOGLE, PASSWORD]), ['password', 'google']);
  });

  it('Google + Apple', () => {
    assert.deepEqual(kinds([APPLE, GOOGLE]), ['google', 'apple']);
  });

  it('password + Google + Apple + Facebook: all four, in priority order', () => {
    assert.deepEqual(kinds([FACEBOOK, APPLE, GOOGLE, PASSWORD]), [
      'password',
      'google',
      'apple',
      'facebook',
    ]);
  });

  it('unlinked or unsupported providers are never offered', () => {
    assert.deepEqual(kinds([GOOGLE, { providerId: 'twitter.com' }, { providerId: 'phone' }]), ['google']);
    assert.deepEqual(kinds([FACEBOOK]), ['facebook']);
  });

  it('never inferred from the email', () => {
    assert.deepEqual(kinds([{ providerId: 'twitter.com', email: 'x@gmail.com' }]), []);
  });

  it('LinkedIn is never a method: LinkedIn-only uses the recent session and guidance', () => {
    const options = buildDeleteAccountOptions([], 'li_abc');
    assert.deepEqual(options.methods, []);
    assert.equal(options.recentSessionOnly, true);
    assert.equal(pickSelectedMethod(options, null), null);
    assert.equal(resolveSessionGuidanceKey(options), 'settings.deleteAccount.linkedInSignInAgain');
    assert.deepEqual(kinds([GOOGLE], 'li_abc'), ['google']);
    for (const key of Object.values(DELETE_METHOD_LABEL_KEY)) assert.doesNotMatch(key, /linkedin/i);
  });

  it('changing the selection keeps a linked choice and falls back when it disappears', () => {
    const options = buildDeleteAccountOptions([PASSWORD, GOOGLE, APPLE], 'uid-1');
    assert.equal(pickSelectedMethod(options, null)?.kind, 'password');
    assert.equal(pickSelectedMethod(options, 'apple')?.kind, 'apple');
    const afterRefresh = buildDeleteAccountOptions([PASSWORD, GOOGLE], 'uid-1');
    assert.equal(pickSelectedMethod(afterRefresh, 'apple')?.kind, 'password');
  });
});

describe('Delete Account confirmation and request', () => {
  it('requires exactly DELETE (case-sensitive, surrounding spaces forgiven)', () => {
    assert.equal(isDeleteConfirmationText('DELETE'), true);
    assert.equal(isDeleteConfirmationText('  DELETE '), true);
    for (const typed of ['delete', 'Delete', 'DELET', 'DELETE!', '', 'D E L E T E']) {
      assert.equal(isDeleteConfirmationText(typed), false, typed);
    }
  });

  it('password is required only while password is selected', () => {
    const password = { kind: 'password' as const };
    const google = { kind: 'google' as const };
    assert.equal(canSubmitDeletion({ typed: 'DELETE', method: password, password: '' }), false);
    assert.equal(canSubmitDeletion({ typed: 'DELETE', method: password, password: 'x' }), true);
    assert.equal(canSubmitDeletion({ typed: 'DELETE', method: google, password: '' }), true);
    assert.equal(canSubmitDeletion({ typed: 'delete', method: google, password: '' }), false);
    assert.equal(canSubmitDeletion({ typed: 'DELETE', method: null, password: '' }), true);
  });

  it('the selected method is the only one sent for reauthentication', () => {
    const google = { kind: 'google' as const, linkedProviderUserId: 'g1' };
    assert.deepEqual(buildDeletionRequest(google, 'ignored', false), {
      reauth: { method: google },
      reauthOnlyIfStale: true,
    });
    assert.deepEqual(buildDeletionRequest(google, '', true), {
      reauth: { method: google },
      reauthOnlyIfStale: false,
    });
    assert.deepEqual(buildDeletionRequest({ kind: 'password' }, 'secret', false), {
      reauth: { method: { kind: 'password' }, password: 'secret' },
    });
    assert.deepEqual(buildDeletionRequest(null, '', false), {});
  });

  it('safe summary contains booleans and a count only', () => {
    const summary = summarizeDeletionReauthProviders([PASSWORD, GOOGLE, FACEBOOK], 'li_abc');
    assert.deepEqual(summary, {
      passwordPresent: true,
      googlePresent: true,
      applePresent: false,
      facebookPresent: true,
      linkedinDeterministicUid: true,
      safeMethodCount: 3,
    });
    for (const value of Object.values(summary)) {
      assert.ok(typeof value === 'boolean' || typeof value === 'number');
    }
  });
});

describe('Delete Account screen composition', () => {
  const screen = read('screens/DeleteAccountScreen.tsx');

  it('selector is rendered up front from the linked methods, not after an attempt', () => {
    assert.doesNotMatch(screen, /showReauth|openReauth|renderSwitchMethods/);
    assert.match(screen, /\{selectedMethod \? \(\s*<View style=\{styles\.section\}>/);
    assert.match(screen, /\{renderMethodSelector\(\)\}/);
    assert.match(screen, /accessibilityRole="radiogroup"/);
    assert.match(screen, /accessibilityRole="radio"/);
    assert.match(screen, /accessibilityState=\{\{ checked: selected, disabled: busy \}\}/);
    assert.match(screen, /options\.methods\.map\(\(method, index\)/);
  });

  it('changing the selection never opens a provider or starts a deletion', () => {
    const select = screen.slice(screen.indexOf('const selectMethod'), screen.indexOf('const inputColors'));
    assert.doesNotMatch(select, /runDeletion|deleteAccountWithBackend|reauthenticate|Alert\./);
    assert.match(select, /setPw\(''\);\s*setSelectedMethod\(method\);/);
  });

  it('password field only for password; one destructive action for the selected method', () => {
    assert.match(screen, /\{selectedMethod\.kind === 'password' \? \(\s*<TextInput/);
    assert.match(
      screen,
      /renderDangerAction\(t\(DELETE_METHOD_ACTION_KEY\[selectedMethod\.kind\]\), canSubmit\)/,
    );
    assert.match(screen, /const request = buildDeletionRequest\(selectedMethod, pw, forceReauthRef\.current\);/);
    assert.match(screen, /const canDelete = isDeleteConfirmationText\(typed\);/);
    assert.doesNotMatch(screen, /toUpperCase\(\) === 'DELETE'/);
  });

  it('providers come from currentUser.providerData with a best-effort reload, same UID only', () => {
    assert.match(screen, /buildDeleteAccountOptions\(user\?\.providerData \?\? \[\], user\?\.uid \?\? null\)/);
    assert.match(screen, /\.reload\(\)/);
    assert.match(screen, /firebaseAuth\.currentUser\?\.uid !== user\.uid\) return;/);
    assert.doesNotMatch(screen, /\.email\b/);
  });

  it('large text: no font-scaling caps or truncation; rows keep a minimum touch height', () => {
    assert.doesNotMatch(screen, /allowFontScaling=\{false\}|maxFontSizeMultiplier|numberOfLines|adjustsFontSizeToFit/);
    assert.match(screen, /methodRow: \{\s*minHeight: 52,/);
    assert.match(screen, /methodLabel: \{\s*flex: 1,/);
    assert.match(screen, /dangerBtnText: \{[^}]*textAlign: 'center',/);
    assert.match(screen, /<ScrollView/);
  });

  it('colors come from the theme (light / dark)', () => {
    assert.match(screen, /useAppTheme\(\)/);
    assert.doesNotMatch(screen, /backgroundColor: '#(?!fff)/i);
  });
});

describe('Delete Account selector copy (EN / ES)', () => {
  const en = settings.deleteAccount as Record<string, string>;
  const esCopy = (es as unknown as { settings: { deleteAccount: Record<string, string> } })
    .settings.deleteAccount;
  const key = (k: string) => k.replace('settings.deleteAccount.', '');

  it('every method label and action exists in both languages', () => {
    for (const k of [
      ...Object.values(DELETE_METHOD_LABEL_KEY),
      ...Object.values(DELETE_METHOD_ACTION_KEY),
      'settings.deleteAccount.methodsTitle',
      'settings.deleteAccount.methodsBody',
      'settings.deleteAccount.linkedInRecentBody',
    ]) {
      assert.ok(en[key(k)]?.trim(), `EN ${k}`);
      assert.ok(esCopy[key(k)]?.trim(), `ES ${k}`);
    }
    assert.equal(esCopy.methodsTitle, 'Confirma que eres tú');
    assert.equal(esCopy.methodPassword, 'Contraseña');
    assert.equal(en.methodsTitle, 'Confirm it’s you');
  });

  it('the old "Use … instead" and per-provider body copy is gone', () => {
    for (const k of Object.keys(en)) assert.doesNotMatch(k, /^reauth(Switch|Body)/);
    for (const k of Object.keys(esCopy)) assert.doesNotMatch(k, /^reauth(Switch|Body)/);
  });
});

/**
 * Android Delete Account via the `deleteMyAccount` callable — source guards,
 * wiring and EN/ES copy.
 * Run: node --experimental-strip-types --test packages/shared/src/__tests__/androidDeleteAccountCallable.test.ts
 */
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import settingsEn from '../i18n/resources/settings.ts';
import {
  deleteAccountMessageKey,
  type DeleteAccountFailureKind,
} from '../accountDeletion/deleteAccountCore.ts';

const here = dirname(fileURLToPath(import.meta.url));
const sharedSrc = join(here, '..');
const OUT_OF_SCOPE_PROVIDER = /\x61pple/i;

function readShared(file: string): string {
  return readFileSync(join(sharedSrc, file), 'utf8').replace(/\r\n/g, '\n');
}

function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function sourceFiles(dir = sharedSrc): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === '__tests__' || name === 'node_modules') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(name)) {
      out.push(relative(sharedSrc, full).replace(/\\/g, '/'));
    }
  }
  return out;
}

const FLOW_FILES = [
  'accountDeletion/deleteAccountCore.ts',
  'accountDeletion/deleteAccount.android.ts',
  'accountDeletion/deleteAccount.ts',
  'screens/DeleteAccountScreen.tsx',
];

describe('No client-side deletion', () => {
  it('the old flow is gone', () => {
    for (const file of [
      'services/accountDeletion.android.ts',
      'services/accountDeletion.ts',
      'authentication/facebook/facebookDeleteAccount.ts',
    ]) {
      assert.equal(existsSync(join(sharedSrc, file)), false, file);
    }
  });

  it('nothing in shared code deletes the Firebase Auth user', () => {
    for (const file of sourceFiles()) {
      const src = codeOnly(readShared(file));
      assert.doesNotMatch(src, /\b(user|currentUser|authUser)\??\.delete\(/, file);
      assert.doesNotMatch(src, /\bdeleteUser\(/, file);
    }
  });

  it('the Delete Account flow never deletes Firestore or Storage data directly', () => {
    for (const file of FLOW_FILES) {
      const src = codeOnly(readShared(file));
      assert.doesNotMatch(src, /\.delete\(|\.remove\(|deleteDoc|writeBatch|\.batch\(/, file);
      assert.doesNotMatch(src, /storageWeb|firebase\/storage|\.ref\(|listAll/, file);
      assert.doesNotMatch(
        src,
        /contactHashes|discoveryProfiles|proximitySignals|pushTokens|blockedUsers|matching/,
        file,
      );
      assert.doesNotMatch(src, /firestoreService|storageService/, file);
    }
  });

  it('the screen only reads the profile for header visuals', () => {
    const screen = codeOnly(readShared('screens/DeleteAccountScreen.tsx'));
    const firestoreUses = screen.match(/firestoreDb\.[^;]*/g) ?? [];
    assert.equal(firestoreUses.length, 1);
    assert.match(firestoreUses[0], /^firestoreDb\.collection\('users'\)\.doc\(uid\)\.get\(\)/);
  });
});

describe('Callable adapter', () => {
  const core = readShared('accountDeletion/deleteAccountCore.ts');
  const android = readShared('accountDeletion/deleteAccount.android.ts');

  it('the core sends an empty payload to deleteMyAccount', () => {
    assert.match(core, /export const DELETE_MY_ACCOUNT_CALLABLE = 'deleteMyAccount';/);
    assert.match(core, /deps\.invokeCallable\(DELETE_MY_ACCOUNT_CALLABLE, \{\}\)/);
    assert.equal((codeOnly(core).match(/deps\.invokeCallable\(/g) ?? []).length, 1);
  });

  it('Android uses the effective Firebase app, us-central1 and App Check', () => {
    assert.match(android, /const REGION = 'us-central1' as const;/);
    assert.match(android, /getFunctions\(getApp\(\), REGION\)\.httpsCallable\(name, \{/);
    assert.match(android, /const result = await callable\(payload\);/);
    assert.match(android, /await user\.getIdToken\(true\);\s*await ensureAppCheckReady\(\);/);
    assert.match(android, /reason: 'APP_CHECK_REQUIRED'/);
    assert.doesNotMatch(android, /useFunctionsEmulator|connectFunctionsEmulator|https?:\/\//);
  });

  it('reauth adapters: password, fresh Google credential, Facebook, LinkedIn same UID', () => {
    assert.match(android, /password: \(\{ password \}\) => reauthWithPassword\(password \?\? ''\)/);
    assert.match(android, /await discardGoogleSignInSession\(\);\s*try \{/);
    assert.match(android, /user\.reauthenticateWithCredential\(\s*auth\.GoogleAuthProvider\.credential\(idToken\),?\s*\)/);
    assert.match(android, /facebook: \(\) => reauthenticateWithFacebook\(\)/);
    assert.match(android, /reauthenticateWithLinkedInSameUid\(\{/);
    assert.match(android, /firebaseAuth\.signInWithCustomToken\(customToken\)/);
  });

  it('cleanup reuses the contractual logout pieces after success only', () => {
    assert.match(android, /closePublicationGate: \(\) => closePublicationSession\(\)/);
    assert.match(android, /stopBackground: \(\) => stopBackgroundLocation\(\)/);
    assert.match(android, /drainInFlightPublications: \(\) => drainInFlightPublications\(\)/);
    assert.match(android, /clearSocialPrefill: \(\) => clearPendingSocialProfilePrefill\(\)/);
    assert.match(android, /logOutFacebookSession\(\);\s*await discardGoogleSignInSession\(\);/);
    assert.match(android, /forgetLastConfirmedVisibility\(deletedUid, AsyncStorage\)/);
    assert.match(core, /runContractualAndroidLogout\(deps\)/);
    const flow = core.slice(core.indexOf('export function createDeleteAccountFlow'));
    assert.ok(
      flow.indexOf('readConfirmedDeletion(data)') < flow.indexOf('deps.cleanupAfterDeletion(uid)'),
    );
  });

  it('no linking, email lookups or token persistence', () => {
    for (const file of FLOW_FILES) {
      const src = codeOnly(readShared(file));
      assert.doesNotMatch(src, /fetchSignInMethodsForEmail|linkWithCredential|linkWithPopup/, file);
      assert.doesNotMatch(src, /SecureStore|setItem\(/, file);
    }
  });

  it('logs never include tokens, emails, UIDs or passwords', () => {
    for (const file of FLOW_FILES) {
      const src = codeOnly(readShared(file));
      assert.doesNotMatch(
        src,
        /console\.\w+\([^)]*(uid|email|token|password|customToken|idToken)/i,
        file,
      );
    }
    assert.match(android, /if \(__DEV__\) console\.log\('\[deleteAccount\]', entry\);/);
  });

  it('no out-of-scope provider in the flow', () => {
    for (const file of FLOW_FILES) {
      assert.doesNotMatch(readShared(file), OUT_OF_SCOPE_PROVIDER, file);
    }
  });
});

describe('Delete Account screen', () => {
  const screen = readShared('screens/DeleteAccountScreen.tsx');

  it('uses the callable flow and no direct deletion helpers', () => {
    assert.match(screen, /from '\.\.\/accountDeletion\/deleteAccount';/);
    assert.match(screen, /await deleteMyAccountWithReauth\(\{/);
    assert.doesNotMatch(screen, /deleteAccountAndData|runFacebookDeleteAccount|services\/reauth/);
  });

  it('double tap is locked, cancel releases, loading is always released', () => {
    assert.match(screen, /if \(!canDelete \|\| attemptLockRef\.current\) return;/);
    assert.match(screen, /style: 'cancel',\s*onPress: releaseAttempt/);
    assert.match(screen, /\{ cancelable: true, onDismiss: releaseAttempt \}/);
    assert.match(screen, /\} finally \{\s*releaseAttempt\(\);\s*if \(mountedRef\.current\) \{\s*setBusyMethod\(null\);/);
  });

  it('success returns to Login; failures only show a mapped message', () => {
    assert.match(screen, /if \(outcome\.status === 'deleted'\) \{[\s\S]*?returnToLogin\(\);/);
    assert.match(screen, /routes: \[\{ name: 'Login' \}\]/);
    assert.match(screen, /Alert\.alert\(t\('settings\.deleteAccount\.title'\), t\(outcome\.messageKey as any\)\);/);
    assert.doesNotMatch(screen, /\b(e|err|error)\??\.message\b/);
  });

  it('every visible string is translated', () => {
    for (const literal of [
      'Delete account',
      'Type DELETE',
      'Delete permanently',
      'Confirm password and delete',
      'For security',
      "'Done'",
      "'Error'",
      '>Back<',
    ]) {
      assert.equal(screen.includes(literal), false, literal);
    }
    assert.doesNotMatch(screen, /placeholder="|Alert\.alert\(\s*'/);
    assert.match(screen, /t\('common\.actions\.back'\)/);
  });

  it('LinkedIn guidance offers the recent sign-in path', () => {
    assert.match(screen, /t\('settings\.deleteAccount\.linkedInGuidance'\)/);
    assert.match(screen, /'recent_sign_in',/);
  });
});

describe('Copy EN/ES', () => {
  const esSource = readShared('i18n/locales/es.ts');
  const esDeleteAccount = esSource.slice(
    esSource.indexOf('deleteAccount: {'),
    esSource.indexOf('blockedPeople: {'),
  );
  const kinds: DeleteAccountFailureKind[] = [
    'reauth_cancelled',
    'reauth_mismatch',
    'reauth_network',
    'wrong_password',
    'reauth_failed',
    'linkedin_guidance',
    'method_unavailable',
    'uid_changed',
    'stale_session',
    'app_check',
    'unauthenticated',
    'retryable',
    'partial',
    'user_not_found',
    'network',
    'unknown',
  ];
  const screenKeys = [
    'title',
    'body',
    'placeholder',
    'permanently',
    'alertTitle',
    'alertBody',
    'alertCancel',
    'alertConfirm',
    'done',
    'passwordPlaceholder',
    'reauthConfirm',
    'reauthContinueGoogle',
    'reauthContinueFacebook',
    'reauthContinueLinkedIn',
    'methodsTitle',
    'methodsBody',
    'reauthUnavailable',
    'linkedInGuidance',
    'errorUnknown',
  ];

  it('every outcome and screen key exists in EN and ES', () => {
    const leaves = new Set([
      ...kinds.map((kind) => deleteAccountMessageKey(kind).replace('settings.deleteAccount.', '')),
      ...screenKeys,
    ]);
    for (const leaf of leaves) {
      const en = (settingsEn.deleteAccount as Record<string, unknown>)[leaf];
      assert.equal(typeof en, 'string', `EN ${leaf}`);
      assert.match(esDeleteAccount, new RegExp(`\\b${leaf}:`), `ES ${leaf}`);
    }
  });

  it('LinkedIn guidance and stale session copy mention the five-minute window and recent sign-in', () => {
    assert.match(settingsEn.deleteAccount.linkedInGuidance, /sign out.*LinkedIn.*within 5 minutes/);
    assert.match(esDeleteAccount, /linkedInGuidance:\s*'[^']*cierra sesión[^']*LinkedIn[^']*5 minutos[^']*'/);
    assert.match(settingsEn.deleteAccount.errorStaleSession, /signed in recently/);
  });

  it('failure copy never claims the account was deleted', () => {
    for (const kind of kinds) {
      const leaf = deleteAccountMessageKey(kind).replace('settings.deleteAccount.', '');
      const en = (settingsEn.deleteAccount as Record<string, string>)[leaf];
      assert.doesNotMatch(en, /has been deleted/i, leaf);
    }
  });

  it('new copy stays free of the out-of-scope provider', () => {
    const leaves = ['methodsTitle', 'methodsBody', 'reauthContinueLinkedIn', 'linkedInGuidance'];
    for (const leaf of leaves) {
      assert.doesNotMatch(
        (settingsEn.deleteAccount as Record<string, string>)[leaf],
        OUT_OF_SCOPE_PROVIDER,
      );
    }
  });
});

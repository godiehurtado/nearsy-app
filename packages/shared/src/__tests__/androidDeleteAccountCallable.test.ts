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
import { clearPalette, darkPalette } from '../theme/colors.ts';
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

  it('the screen reads no Firestore data', () => {
    const screen = codeOnly(readShared('screens/DeleteAccountScreen.tsx'));
    assert.doesNotMatch(screen, /firestoreDb|firebaseConfig|collection\(/);
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

  it('reauth adapters: password, fresh Google credential, Facebook only', () => {
    assert.match(android, /password: \(\{ password \}\) => reauthWithPassword\(password \?\? ''\)/);
    assert.match(android, /await discardGoogleSignInSession\(\);\s*try \{/);
    assert.match(android, /user\.reauthenticateWithCredential\(\s*auth\.GoogleAuthProvider\.credential\(idToken\),?\s*\)/);
    assert.match(android, /facebook: \(\) => reauthenticateWithFacebook\(\)/);
    const reauthBlock = android.slice(android.indexOf('reauthenticate: {'));
    assert.doesNotMatch(reauthBlock.slice(0, reauthBlock.indexOf('},')), /linkedin/i);
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

describe('LinkedIn is never reauthenticated inline', () => {
  const FORBIDDEN: Array<[string, RegExp]> = [
    ['custom-token sign-in', /signInWithCustomToken|customToken/i],
    [
      'LinkedIn login adapter',
      /linkedinAuth|linkedinSession|linkedinAuthCoordinator|linkedinFirebaseAuth|useLinkedInSignInFlow|signInWithLinkedIn|authenticateWithLinkedIn|runLinkedIn/i,
    ],
    [
      'LinkedIn OAuth start / callback',
      /linkedInAuthStart|linkedInAuthExchange|handleLinkedInReturnUrl|linkedinDeepLinkParser|LINKEDIN_MOBILE_RETURN_URL|openAuthSession|expo-web-browser|WebBrowser|identityFunctions|oauth/i,
    ],
    [
      'user creation',
      /createUser|createUserWithEmailAndPassword|signInAnonymously|signInWithCredential/,
    ],
  ];

  for (const [label, pattern] of FORBIDDEN) {
    it(`flow files never contain ${label}`, () => {
      for (const file of FLOW_FILES) {
        assert.doesNotMatch(codeOnly(readShared(file)), pattern, `${file}: ${label}`);
      }
    });
  }

  it('LinkedIn-only accounts use the recent session; guidance never signs out', () => {
    const core = codeOnly(readShared('accountDeletion/deleteAccountCore.ts'));
    assert.match(core, /if \(request\.method === 'recent_session'\) \{\s*if \(!isLinkedInOnlyAccount\(user\)\) return failed\('method_unavailable'\);/);
    assert.match(core, /request\.method === 'recent_session' && kind === 'stale_session'[\s\S]{0,40}kind = 'linkedin_guidance'/);
    const screen = codeOnly(readShared('screens/DeleteAccountScreen.tsx'));
    assert.doesNotMatch(screen, /signOut/);
  });

  it('normal LinkedIn login is untouched', () => {
    const hook = readShared('hooks/useLinkedInSignInFlow.android.ts');
    assert.match(hook, /const result = await signInWithLinkedInBrowser\(\);/);
    const adapter = readShared('authentication/linkedin/linkedinAuth.android.ts');
    assert.match(adapter, /const cred = await firebaseAuth\.signInWithCustomToken\(customToken\);/);
    const session = readShared('authentication/linkedin/linkedinSession.ts');
    assert.match(session, /const signedIn = await performSignInOnce\(deps\.firebaseAuth, customToken\);/);
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

  it('LinkedIn-only accounts get one recent-session action and the guidance after a stale session', () => {
    assert.match(screen, /\{options\.recentSessionOnly && \(/);
    assert.match(screen, /'recent_session',/);
    assert.match(screen, /'settings\.deleteAccount\.linkedInGuidance'/);
    assert.match(screen, /'settings\.deleteAccount\.linkedInRecentBody'/);
    assert.match(screen, /if \(outcome\.kind === 'linkedin_guidance' && mountedRef\.current\) \{\s*setShowLinkedInGuidance\(true\);/);
    assert.doesNotMatch(screen, /reauthContinueLinkedIn|linkedin: '/);
  });
});

describe('Delete Account presentation (Nearsy 2.0 design)', () => {
  const screen = codeOnly(readShared('screens/DeleteAccountScreen.tsx'));

  it('drops the legacy brand header, logo and avatar', () => {
    assert.doesNotMatch(screen, /TopHeader|showAvatar|profileImage|topBar(Color|Mode|Image)/);
    assert.doesNotMatch(screen, /NearsyLogo|Logo\b|Avatar|<Image\b/);
  });

  it('uses theme tokens only, never hardcoded colors', () => {
    assert.match(screen, /const \{ palette \} = useAppTheme\(\);/);
    assert.match(screen, /from '\.\.\/theme';/);
    assert.doesNotMatch(screen, /#[0-9A-Fa-f]{3,8}\b|rgba?\(|'(white|black|red|gray|grey)'/);
    assert.match(screen, /styles\.root, \{ backgroundColor: palette\.background \}/);
  });

  it('every palette token used exists in the clear and dark themes', () => {
    const used = new Set([...screen.matchAll(/palette\.(\w+)/g)].map((m) => m[1]));
    assert.ok(used.size > 5);
    for (const token of used) {
      assert.equal(typeof (clearPalette as Record<string, unknown>)[token], 'string', `clear ${token}`);
      assert.equal(typeof (darkPalette as Record<string, unknown>)[token], 'string', `dark ${token}`);
    }
  });

  it('follows the new composition: rounded Back, large title, body, red warning, DELETE field', () => {
    const order = [
      /styles\.backBtn,/,
      /name="chevron-back"/,
      /accessibilityRole="header"\s*style=\{\[styles\.title/,
      /t\('settings\.deleteAccount\.body'\)/,
      /styles\.confirmHint, \{ color: palette\.danger \}/,
      /placeholder=\{t\('settings\.deleteAccount\.placeholder'\)\}/,
    ];
    let cursor = 0;
    for (const pattern of order) {
      const rest = screen.slice(cursor);
      const match = rest.match(pattern);
      assert.ok(match && match.index !== undefined, String(pattern));
      cursor += match.index + match[0].length;
    }
    assert.match(screen, /backBtn: \{[\s\S]*?borderRadius: radius\.md,[\s\S]*?borderWidth: 1,/);
    assert.match(screen, /title: \{\s*fontSize: fontSize\.xl,\s*fontWeight: fontWeight\.extrabold,/);
    assert.match(screen, /paddingTop: insets\.top \+ spacing\.md,/);
  });

  it('the destructive action stays disabled until DELETE is typed exactly', () => {
    assert.match(screen, /const canDelete = isDeleteConfirmationText\(typed\);/);
    assert.doesNotMatch(screen, /toUpperCase|toLowerCase|localeCompare/);
    assert.match(screen, /const active = enabled && !busy;/);
    assert.match(screen, /disabled=\{!active\}/);
    assert.match(screen, /backgroundColor: enabled \? palette\.danger : palette\.borderStrong,/);
    assert.match(screen, /\? canDelete && Boolean\(password\.trim\(\)\)\s*: canDelete,/);
    assert.match(screen, /'recent_session',\s*t\('settings\.deleteAccount\.permanently'\),\s*canDelete,/);
  });

  it('password, Google and Facebook stay selectable when several are linked', () => {
    for (const map of ['ACTION_LABEL_KEY', 'METHOD_LABEL_KEY', 'METHOD_ICON']) {
      const block = screen.match(new RegExp(`const ${map}[^=]*= \\{([\\s\\S]*?)\\};`));
      assert.ok(block, map);
      const keys = [...block[1].matchAll(/^\s*(\w+):/gm)].map((m) => m[1]);
      assert.deepEqual(keys, ['password', 'google', 'facebook'], map);
    }
    assert.match(screen, /\{options\.methods\.length > 1 && renderMethodSelector\(\)\}/);
    assert.match(screen, /\{options\.methods\.map\(\(method, index\) => \{/);
    assert.match(screen, /accessibilityRole="radio"/);
    assert.match(screen, /accessibilityState=\{\{ checked: selected, disabled: busy \}\}/);
    assert.match(screen, /\(\) => options\.methods\[0\] \?\? null,/);
    assert.match(screen, /\{selectedMethod === 'password' && \(/);
    assert.match(screen, /renderDangerAction\(\s*selectedMethod,\s*t\(ACTION_LABEL_KEY\[selectedMethod\] as any\),/);
  });

  it('switching method never runs an attempt and is blocked while busy', () => {
    const select = screen.match(/const selectMethod = [\s\S]*?\n {2}\};/);
    assert.ok(select);
    assert.match(select[0], /if \(busy \|\| method === selectedMethod\) return;/);
    assert.doesNotMatch(select[0], /confirmAndDelete|deleteMyAccountWithReauth|Alert/);
    assert.deepEqual(screen.match(/confirmAndDelete\([^)]*\)/g), ['confirmAndDelete(method)']);
  });

  it('LinkedIn has no method row, icon or OAuth entry point', () => {
    assert.doesNotMatch(screen, /logo-linkedin|methodLinkedIn|linkedin:/i);
    assert.doesNotMatch(screen, OUT_OF_SCOPE_PROVIDER);
  });

  it('long text wraps instead of being clipped', () => {
    assert.doesNotMatch(screen, /numberOfLines|adjustsFontSizeToFit|allowFontScaling=\{false\}/);
    assert.match(screen, /dangerBtn: \{[\s\S]*?minHeight: 50,[\s\S]*?paddingVertical: spacing\.md,/);
    assert.match(screen, /methodRow: \{\s*minHeight: 52,/);
    assert.match(screen, /<ScrollView/);
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
    'linkedInRecentBody',
    'confirm',
    'methodsTitle',
    'methodsBody',
    'methodPassword',
    'methodGoogle',
    'methodFacebook',
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

  it('LinkedIn guidance uses the exact approved copy', () => {
    assert.equal(
      settingsEn.deleteAccount.linkedInGuidance,
      'For security, sign out, sign back in with LinkedIn, and request account deletion within the next 5 minutes.',
    );
    assert.ok(
      esDeleteAccount.includes(
        "linkedInGuidance:\n        'Por seguridad, cierra sesión, vuelve a ingresar con LinkedIn y solicita la eliminación de tu cuenta dentro de los próximos 5 minutos.',",
      ),
    );
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
    const leaves = ['methodsTitle', 'methodsBody', 'linkedInRecentBody', 'linkedInGuidance'];
    for (const leaf of leaves) {
      assert.doesNotMatch(
        (settingsEn.deleteAccount as Record<string, string>)[leaf],
        OUT_OF_SCOPE_PROVIDER,
      );
    }
  });
});

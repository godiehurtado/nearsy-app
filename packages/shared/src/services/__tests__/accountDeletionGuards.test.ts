import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

import settings from '../../i18n/resources/settings';
import es from '../../i18n/locales/es';
import { resolveDeleteMyAccountMessageKey } from '../accountDeletionErrorPresentation';
import type { DeleteMyAccountFailureKind } from '../deleteMyAccount/contract';

const sharedSrc = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(sharedSrc, rel), 'utf8');

const DELETION_FLOW_FILES = [
  'screens/DeleteAccountScreen.tsx',
  'services/accountDeletion.ts',
  'services/accountDeletionSession.ts',
  'services/accountDeletionErrorPresentation.ts',
  'services/deleteMyAccount/contract.ts',
  'services/deleteMyAccount/deleteMyAccountAdapter.ts',
  'services/deleteMyAccount/deleteMyAccountCallableHttp.ts',
  'services/deleteMyAccount/iosDeleteMyAccountFoundation.ios.ts',
  'services/deleteMyAccount/iosDeleteMyAccountFoundation.ts',
  'services/deletionReauth/accountDeletionReauthError.ts',
  'services/deletionReauth/deletionReauthMethod.ts',
  'services/deletionReauth/index.ts',
  'services/deletionReauth/linkedInDeletionPolicy.ts',
  'services/deletionReauth/reauthenticateForAccountDeletion.ts',
];

const REMOVED_LINKEDIN_REAUTH_FILES = [
  'services/deletionReauth/linkedInDeletionReauth.ts',
  'services/deletionReauth/linkedInDeletionReauthRuntime.ts',
];

/** Only App Check and environment resolution may be shared with the LinkedIn A3 folder. */
const ALLOWED_LINKEDIN_A3_IMPORT = /linkedinA3\/(appCheck|environment)\//;

function importSpecifiers(src: string): string[] {
  const specs: string[] = [];
  const re = /(?:from\s+|require\(\s*|import\(\s*)['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(src))) specs.push(match[1]);
  return specs;
}

describe('Delete Account never deletes from the client', () => {
  for (const rel of DELETION_FLOW_FILES) {
    it(`${rel}: no Auth delete, Firestore or Storage deletion`, () => {
      const src = read(rel);
      assert.doesNotMatch(src, /\.delete\(\)|deleteUser\(|deleteDoc\(|deleteObject\(|recursiveDelete/);
      assert.doesNotMatch(src, /writeBatch|listAll\(|batch\.delete/);
      assert.doesNotMatch(src, /from 'firebase\/firestore'|from 'firebase\/storage'/);
      assert.doesNotMatch(src, /require\('firebase\/(firestore|storage)'\)/);
      assert.doesNotMatch(src, /contactHashes|discoveryProfiles|proximitySignals/);
    });
  }

  it('the old client-side deletion runtime is gone', () => {
    const service = read('services/accountDeletion.ts');
    assert.doesNotMatch(service, /deleteAccountAndData|deleteContactHashes|deleteUserStorage|deleteUserDocument/);
    assert.match(service, /deleteAccountWithBackend/);
    const screen = read('screens/DeleteAccountScreen.tsx');
    assert.doesNotMatch(screen, /deleteAccountAndData/);
    assert.match(screen, /deleteAccountWithBackend/);
  });
});

describe('Delete Account never starts LinkedIn or creates an identity', () => {
  for (const rel of DELETION_FLOW_FILES) {
    it(`${rel}: no custom-token sign-in, LinkedIn OAuth, A3 callback or identity creation`, () => {
      const src = read(rel);
      assert.doesNotMatch(src, /signInWithCustomToken|customToken/i);
      assert.doesNotMatch(
        src,
        /authenticateWithLinkedIn|runLinkedInA3BrowserAuthFlow|createLinkedInA3|linkedInA3CallableClient/,
      );
      assert.doesNotMatch(src, /linkedinAuthStart|linkedinAuthExchange|linkedin\.com\/oauth/i);
      assert.doesNotMatch(src, /expo-web-browser|openAuthSessionAsync|WebBrowser\./);
      assert.doesNotMatch(src, /durableResume|appRootResume|durableTransactionStore/);
      assert.doesNotMatch(src, /resolveOrCreateUser|createUser\(|createUserWith/);
      assert.doesNotMatch(src, /signInWithCredential\(|linkWithCredential\(/);
      for (const spec of importSpecifiers(src)) {
        if (/linkedinA3/.test(spec)) {
          assert.match(spec, ALLOWED_LINKEDIN_A3_IMPORT, `${rel} imports ${spec}`);
        }
      }
    });
  }

  it('the inline LinkedIn reauthentication modules no longer exist', () => {
    for (const rel of REMOVED_LINKEDIN_REAUTH_FILES) {
      assert.equal(fs.existsSync(path.join(sharedSrc, rel)), false, rel);
    }
  });

  it('LinkedIn is never offered as an inline reauthentication button', () => {
    const screen = read('screens/DeleteAccountScreen.tsx');
    assert.doesNotMatch(screen, /linkedin:\s*'settings\.deleteAccount/);
    assert.doesNotMatch(screen, /reauth(Body|Continue|Switch)LinkedIn/);
    const method = read('services/deletionReauth/deletionReauthMethod.ts');
    assert.doesNotMatch(method, /kind:\s*'linkedin'/);
  });
});

describe('Delete Account never logs tokens or PII', () => {
  for (const rel of DELETION_FLOW_FILES) {
    it(`${rel}: no console output`, () => {
      assert.doesNotMatch(read(rel), /console\.(log|warn|error|info|debug)/);
    });
  }

  it('alerts show translated keys only, never Firebase/backend messages', () => {
    const screen = read('screens/DeleteAccountScreen.tsx');
    assert.doesNotMatch(screen, /\.message\b/);
    assert.match(screen, /resolveDeletionFailureMessageKey\(\s*result,/);
    assert.match(screen, /Alert\.alert\(t\('common\.error'\), t\(messageKey\)\);/);
  });
});

describe('Delete Account copy (EN / ES)', () => {
  const en = settings.deleteAccount as Record<string, string>;
  const esCopy = (es as unknown as { settings: { deleteAccount: Record<string, string> } })
    .settings.deleteAccount;

  const kinds: DeleteMyAccountFailureKind[] = [
    'RECENT_LOGIN_REQUIRED',
    'APP_CHECK',
    'UNAUTHENTICATED',
    'IDENTITY_CHANGED',
    'IN_PROGRESS',
    'DELETION_RETRYABLE',
    'DELETION_FAILED',
    'NETWORK_UNCERTAIN',
    'UNKNOWN',
  ];

  it('every callable failure maps to a distinct-enough key present in EN and ES', () => {
    for (const kind of kinds) {
      const key = resolveDeleteMyAccountMessageKey(kind).replace('settings.deleteAccount.', '');
      assert.ok(en[key]?.trim(), `EN ${key}`);
      assert.ok(esCopy[key]?.trim(), `ES ${key}`);
      assert.notEqual(en[key], esCopy[key], `ES ${key} is translated`);
    }
  });

  it('LinkedIn guidance and method-switch copy exists in both languages', () => {
    for (const key of [
      'linkedInSignInAgain',
      'reauthSwitchPassword',
      'reauthSwitchGoogle',
      'reauthSwitchApple',
      'reauthSwitchFacebook',
    ]) {
      assert.ok(en[key]?.trim(), `EN ${key}`);
      assert.ok(esCopy[key]?.trim(), `ES ${key}`);
    }
    for (const key of ['reauthBodyLinkedIn', 'reauthContinueLinkedIn', 'reauthSwitchLinkedIn']) {
      assert.equal(en[key], undefined, `EN ${key} removed`);
      assert.equal(esCopy[key], undefined, `ES ${key} removed`);
    }
    assert.equal(
      en.linkedInSignInAgain,
      'For security, sign out, sign back in with LinkedIn, and request account deletion within the next 5 minutes.',
    );
    assert.equal(
      esCopy.linkedInSignInAgain,
      'Por seguridad, cierra sesión, vuelve a ingresar con LinkedIn y solicita la eliminación de tu cuenta dentro de los próximos 5 minutos.',
    );
  });

  it('uncertain outcomes never claim the account was deleted', () => {
    assert.match(en.networkUncertain, /^We couldn’t confirm whether/);
    assert.match(esCopy.networkUncertain, /^No pudimos confirmar si/);
    for (const copy of [en, esCopy]) {
      for (const key of ['sessionNotRecent', 'appCheckFailed']) {
        assert.match(copy[key], /not deleted|no fue eliminada/);
      }
    }
  });

  it('EN and ES deleteAccount key sets match', () => {
    assert.deepEqual(Object.keys(en).sort(), Object.keys(esCopy).sort());
  });
});

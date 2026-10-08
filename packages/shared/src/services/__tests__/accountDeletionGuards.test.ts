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
  'services/deletionReauth/linkedInDeletionReauth.ts',
  'services/deletionReauth/linkedInDeletionReauthRuntime.ts',
];

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

describe('Delete Account never logs tokens or PII', () => {
  for (const rel of DELETION_FLOW_FILES) {
    it(`${rel}: no console output`, () => {
      assert.doesNotMatch(read(rel), /console\.(log|warn|error|info|debug)/);
    });
  }

  it('alerts show translated keys only, never Firebase/backend messages', () => {
    const screen = read('screens/DeleteAccountScreen.tsx');
    assert.doesNotMatch(screen, /\.message\b/);
    assert.match(screen, /Alert\.alert\(t\('common\.error'\), t\(result\.messageKey\)\);/);
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

  it('LinkedIn and method-switch copy exists in both languages', () => {
    for (const key of [
      'linkedInSignInAgain',
      'reauthBodyLinkedIn',
      'reauthContinueLinkedIn',
      'reauthSwitchPassword',
      'reauthSwitchGoogle',
      'reauthSwitchApple',
      'reauthSwitchFacebook',
      'reauthSwitchLinkedIn',
    ]) {
      assert.ok(en[key]?.trim(), `EN ${key}`);
      assert.ok(esCopy[key]?.trim(), `ES ${key}`);
    }
    assert.match(en.linkedInSignInAgain, /sign out, sign back in with LinkedIn, and delete your account within 5 minutes/);
    assert.match(esCopy.linkedInSignInAgain, /cierra sesión, vuelve a entrar con LinkedIn y elimina tu cuenta dentro de los 5 minutos/);
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

/**
 * iOS 2.0.7 — contractual copy for Facebook `auth/account-exists-with-different-credential`.
 * Fakes only: no real tokens, UIDs, emails or network access.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, it } from 'node:test';
import type { UserCredential } from 'firebase/auth';

import { createFirebaseJsAuthenticationAdapter } from '../infrastructure/firebase/firebaseJsAuthenticationAdapter.ios';
import { createAuthenticateWithFacebook } from '../application/authenticateWithFacebook';
import { createSocialProviderRegistry } from '../application/providerRegistry';
import type { SocialAuthenticationProviderAdapter } from '../application/socialAuthenticationPort';
import type { ProviderAuthenticationResult } from '../domain/providerAuthenticationResult';
import {
  FACEBOOK_ACCOUNT_EXISTS_MESSAGE_KEY,
  FACEBOOK_ACCOUNT_EXISTS_TITLE_KEY,
  FIREBASE_ACCOUNT_EXISTS_CODE,
  SIGN_IN_ERROR_TITLE_KEY,
  resolveFacebookSignInAlert,
  resolveFacebookSignInAlertMessageKey,
  shouldSuppressFacebookSignInAlert,
} from '../application/facebookSignInUiPolicy';
import {
  messageKeyForCode,
  SocialAuthError,
  type SocialAuthenticationErrorCode,
} from '../domain/socialAuthenticationError';
import {
  clearPendingSocialProfilePrefill,
  peekPendingSocialProfilePrefill,
} from '../application/socialProfilePrefillStore';
import enAuthentication from '../../../i18n/resources/authentication';
import es from '../../../i18n/locales/es';

const here = dirname(fileURLToPath(import.meta.url));
const readSharedSource = (rel: string) => readFileSync(join(here, '..', '..', '..', rel), 'utf8');

const RAW_NONCE = 'rawNonceForTestsOnly0000000000AB';

const EN_TITLE = 'Account already exists';
const EN_MESSAGE =
  'A Nearsy account already exists with this email. Sign in using the method you originally used.';
const ES_TITLE = 'Cuenta existente';
const ES_MESSAGE =
  'Ya existe una cuenta de Nearsy asociada a este correo. Inicia sesión utilizando el método que usaste originalmente.';

/** Resolve `authentication.x.y` against the EN resources / ES locale. */
function lookup(locale: 'en' | 'es', key: string): unknown {
  const root: unknown = locale === 'en' ? { authentication: enAuthentication } : es;
  return key.split('.').reduce<unknown>(
    (node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined),
    root,
  );
}

function providerStub(result: ProviderAuthenticationResult) {
  const adapter: SocialAuthenticationProviderAdapter & { clearCalls: number } = {
    provider: 'facebook',
    clearCalls: 0,
    async isAvailable() {
      return true;
    },
    async configure() {},
    async authenticate() {
      return result;
    },
    async clearProviderSession() {
      adapter.clearCalls += 1;
    },
  };
  return adapter;
}

function firebaseRejecting(code: string) {
  const calls = { signIn: 0, credentials: [] as unknown[] };
  const port = createFirebaseJsAuthenticationAdapter({
    OAuthProvider: class {
      constructor(readonly providerId: string) {}
      credential(params: { idToken?: string; rawNonce?: string }) {
        const cred = { providerId: this.providerId, idToken: params.idToken, nonce: params.rawNonce };
        calls.credentials.push(cred);
        return cred;
      }
    },
    FacebookAuthProvider: { credential: (accessToken: string) => ({ providerId: 'facebook.com', accessToken }) },
    async signInWithCredential(): Promise<UserCredential> {
      calls.signIn += 1;
      throw Object.assign(new Error(`Firebase: Error (${code}).`), { code, name: 'FirebaseError' });
    },
    auth: {},
  });
  return { port, calls };
}

const OIDC_RESULT: ProviderAuthenticationResult = {
  provider: 'facebook',
  providerUserId: 'fb-user-1',
  idToken: 'oidc-jwt',
  rawNonce: RAW_NONCE,
  email: 'ada@example.test',
  displayName: 'Ada Lovelace',
};

async function failedAttempt(code: string) {
  const provider = providerStub(OIDC_RESULT);
  const { port, calls } = firebaseRejecting(code);
  let profileReads = 0;
  const authenticate = createAuthenticateWithFacebook({
    registry: createSocialProviderRegistry({ facebook: provider }),
    firebaseAuth: port,
    getUserProfile: async () => {
      profileReads += 1;
      return null;
    },
    isProfileComplete: async () => false,
  });
  let caught: unknown;
  try {
    await authenticate();
  } catch (err) {
    caught = err;
  }
  assert.ok(caught instanceof SocialAuthError, 'expected a typed SocialAuthError');
  return { error: caught, provider, calls, profileReads, authenticate };
}

describe('Facebook account-exists-with-different-credential', () => {
  beforeEach(() => clearPendingSocialProfilePrefill());

  it('maps the exact Firebase code to the contractual EN/ES title and message', async () => {
    const { error } = await failedAttempt(FIREBASE_ACCOUNT_EXISTS_CODE);
    assert.equal(error.social.code, 'ACCOUNT_CONFLICT');
    assert.equal(error.social.diagnosticCode, FIREBASE_ACCOUNT_EXISTS_CODE);

    const alert = resolveFacebookSignInAlert(error.social);
    assert.deepEqual(alert, {
      titleKey: FACEBOOK_ACCOUNT_EXISTS_TITLE_KEY,
      messageKey: FACEBOOK_ACCOUNT_EXISTS_MESSAGE_KEY,
    });
    assert.equal(lookup('en', alert.titleKey), EN_TITLE);
    assert.equal(lookup('en', alert.messageKey), EN_MESSAGE);
    assert.equal(lookup('es', alert.titleKey), ES_TITLE);
    assert.equal(lookup('es', alert.messageKey), ES_MESSAGE);
    assert.notEqual(alert.messageKey, 'authentication.social.facebook.failed');
  });

  it('copy never reveals which provider the existing account uses', () => {
    for (const text of [EN_TITLE, EN_MESSAGE, ES_TITLE, ES_MESSAGE]) {
      assert.doesNotMatch(text, /google|apple|linkedin|facebook|password|contraseña|otp/i);
    }
  });

  it('no navigation, no user, no profile/prefill writes and no linking', async () => {
    const { calls, profileReads } = await failedAttempt(FIREBASE_ACCOUNT_EXISTS_CODE);
    assert.equal(calls.signIn, 1);
    assert.equal(profileReads, 0);
    assert.equal(peekPendingSocialProfilePrefill(), null);

    const hook = readSharedSource('hooks/useFacebookSignInFlow.ts');
    const catchIdx = hook.indexOf('} catch (err) {');
    assert.ok(catchIdx > 0);
    assert.ok(hook.indexOf('applyPostAuthNavigation(navigation') < catchIdx);
    assert.equal(hook.slice(catchIdx).includes('applyPostAuthNavigation'), false);
    assert.equal(hook.slice(catchIdx).includes('navigation.'), false);

    for (const rel of [
      'hooks/useFacebookSignInFlow.ts',
      'authentication/social/application/facebookSignInUiPolicy.ts',
      'authentication/social/application/authenticateWithFacebook.ts',
      'authentication/social/infrastructure/firebase/firebaseJsAuthenticationAdapter.ios.ts',
    ]) {
      const src = readSharedSource(rel);
      assert.doesNotMatch(
        src,
        /linkWithCredential|linkWithPopup|fetchSignInMethodsForEmail|createUserWith|setDoc|updateDoc|AsyncStorage|SecureStore/,
        rel,
      );
    }
  });

  it('clears the native Facebook session exactly as before', async () => {
    const { provider } = await failedAttempt(FIREBASE_ACCOUNT_EXISTS_CODE);
    assert.equal(provider.clearCalls, 1);
  });

  it('keeps Limited Login OIDC credential with the original raw nonce', async () => {
    const { calls } = await failedAttempt(FIREBASE_ACCOUNT_EXISTS_CODE);
    assert.deepEqual(calls.credentials, [
      { providerId: 'facebook.com', idToken: 'oidc-jwt', nonce: RAW_NONCE },
    ]);
  });

  it('a later attempt is not blocked (in-progress guard released)', async () => {
    const { authenticate } = await failedAttempt(FIREBASE_ACCOUNT_EXISTS_CODE);
    await assert.rejects(
      () => authenticate(),
      (err: unknown) => err instanceof SocialAuthError && err.social.code === 'ACCOUNT_CONFLICT',
    );
  });
});

describe('Other Facebook errors keep the current alert', () => {
  it('Firebase codes other than account-exists keep login-error title and existing copy', async () => {
    for (const code of [
      'auth/invalid-credential',
      'auth/network-request-failed',
      'auth/internal-error',
      'auth/credential-already-in-use',
    ]) {
      const { error, provider } = await failedAttempt(code);
      assert.notEqual(error.social.code, 'ACCOUNT_CONFLICT', code);
      assert.deepEqual(
        resolveFacebookSignInAlert(error.social),
        { titleKey: SIGN_IN_ERROR_TITLE_KEY, messageKey: resolveFacebookSignInAlertMessageKey(error.social) },
        code,
      );
      assert.equal(provider.clearCalls, 1, code);
    }
  });

  it('every non-silent code keeps the previous title + message mapping', () => {
    const codes: SocialAuthenticationErrorCode[] = [
      'PROVIDER_UNAVAILABLE',
      'CONFIGURATION_ERROR',
      'NETWORK_ERROR',
      'TOKEN_MISSING',
      'TOKEN_INVALID',
      'FIREBASE_ERROR',
      'ACCOUNT_CONFLICT',
      'UNKNOWN',
    ];
    for (const code of codes) {
      const social = { code, messageKey: messageKeyForCode(code), diagnosticCode: 'OTHER' };
      assert.deepEqual(resolveFacebookSignInAlert(social), {
        titleKey: SIGN_IN_ERROR_TITLE_KEY,
        messageKey: resolveFacebookSignInAlertMessageKey(social),
      });
    }
    assert.equal(lookup('en', SIGN_IN_ERROR_TITLE_KEY), 'Login Error');
  });

  it('cancel and double tap stay silent', () => {
    assert.equal(shouldSuppressFacebookSignInAlert('CANCELLED'), true);
    assert.equal(shouldSuppressFacebookSignInAlert('IN_PROGRESS'), true);
    const hook = readSharedSource('hooks/useFacebookSignInFlow.ts');
    assert.match(hook, /if \(submitting\) return/);
    assert.match(hook, /if \(shouldSuppressFacebookSignInAlert\(err\.social\.code\)\) \{\s*return;/);
    assert.match(hook, /resolveFacebookSignInAlert\(err\.social\)/);
  });

  it('Welcome and Login both use the shared Facebook hook', () => {
    for (const rel of ['screens/LoginScreen.tsx', 'screens/WelcomeScreen.tsx']) {
      assert.match(readSharedSource(rel), /useFacebookSignInFlow/, rel);
    }
  });
});

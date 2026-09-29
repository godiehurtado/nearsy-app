/**
 * ENH-AUTH-FB-01 — Facebook Login on iOS.
 * Fakes only: no real tokens, UIDs, emails or network access.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, it } from 'node:test';
import type { UserCredential } from 'firebase/auth';

import {
  createFacebookProviderAdapter,
  FACEBOOK_LOGIN_PERMISSIONS,
  type FacebookSdkClient,
} from '../infrastructure/facebook/facebookProviderAdapter';
import { createFacebookProviderAdapter as createAndroidFacebookAdapter } from '../infrastructure/facebook/facebookProviderAdapter.android';
import {
  createFirebaseJsAuthenticationAdapter,
  mapFirebaseSocialError,
} from '../infrastructure/firebase/firebaseJsAuthenticationAdapter.ios';
import { createAuthenticateWithFacebook } from '../application/authenticateWithFacebook';
import { createSocialProviderRegistry } from '../application/providerRegistry';
import type { SocialAuthenticationProviderAdapter } from '../application/socialAuthenticationPort';
import type { ProviderAuthenticationResult } from '../domain/providerAuthenticationResult';
import {
  FACEBOOK_SIGN_IN_FAILED_MESSAGE_KEY,
  resolveFacebookSignInAlertMessageKey,
  shouldSuppressFacebookSignInAlert,
} from '../application/facebookSignInUiPolicy';
import {
  createSocialAuthError,
  messageKeyForCode,
  sanitizeSocialErrorForLog,
  SocialAuthError,
} from '../domain/socialAuthenticationError';
import type {
  FirebaseAuthenticationPort,
  FirebaseAuthenticationSession,
  FirebaseSocialCredentialInput,
} from '../infrastructure/firebase/firebaseAuthenticationPort';
import {
  clearPendingSocialProfilePrefill,
  peekPendingSocialProfilePrefill,
} from '../application/socialProfilePrefillStore';
import { resolvePostAuthNavigationTarget } from '../../../phoneOtp/onboardingResolver';
import en from '../../../i18n/resources/authentication';
import enSettings from '../../../i18n/resources/settings';
import es from '../../../i18n/locales/es';

const here = dirname(fileURLToPath(import.meta.url));

function readSharedSource(relativeFromSharedSrc: string): string {
  return readFileSync(join(here, '..', '..', '..', relativeFromSharedSrc), 'utf8');
}

const FAKE_APP_ID = '1234567890';
const RAW_NONCE = 'rawNonceForTestsOnly0000000000AB';
const HASHED_NONCE = `sha256(${RAW_NONCE})`;

const fakeCrypto = {
  CryptoDigestAlgorithm: { SHA256: 'SHA256' },
  async digestStringAsync(_algorithm: unknown, data: string) {
    return `sha256(${data})`;
  },
  async getRandomBytesAsync(count: number) {
    return new Uint8Array(count).map((_, i) => i % 62);
  },
};

type FakeSdkOptions = {
  cancelled?: boolean;
  accessToken?: string | null;
  authenticationToken?: string | null;
  authenticationNonce?: string;
  profile?: Record<string, string | null> | null;
  granted?: string[];
  declined?: string[];
  loginError?: unknown;
  logOutThrows?: boolean;
};

function createFakeSdk(options: FakeSdkOptions = {}) {
  const calls = {
    initializeSDK: 0,
    logOut: 0,
    login: [] as Array<{ permissions: string[]; tracking?: string; nonce?: string }>,
  };
  const sdk: FacebookSdkClient = {
    Settings: {
      initializeSDK() {
        calls.initializeSDK += 1;
      },
    },
    LoginManager: {
      async logInWithPermissions(permissions, tracking, nonce) {
        calls.login.push({ permissions, tracking, nonce });
        if (options.loginError) throw options.loginError;
        return {
          isCancelled: Boolean(options.cancelled),
          grantedPermissions: options.granted ?? ['public_profile', 'email'],
          declinedPermissions: options.declined ?? [],
        };
      },
      logOut() {
        calls.logOut += 1;
        if (options.logOutThrows) throw new Error('no session');
      },
    },
    AccessToken: {
      async getCurrentAccessToken() {
        return options.accessToken === null
          ? null
          : { accessToken: options.accessToken ?? 'fb-access-token', userID: 'fb-user-1' };
      },
    },
    AuthenticationToken: {
      async getAuthenticationTokenIOS() {
        return options.authenticationToken
          ? {
              authenticationToken: options.authenticationToken,
              nonce: options.authenticationNonce ?? HASHED_NONCE,
            }
          : null;
      },
    },
    Profile: {
      async getCurrentProfile() {
        if (options.profile === null) return null;
        return (
          options.profile ?? {
            userID: 'fb-user-1',
            name: 'Ada Lovelace',
            firstName: 'Ada',
            lastName: 'Lovelace',
            imageURL: 'https://example.test/ada.jpg',
            email: 'ada@example.test',
          }
        );
      },
    },
  };
  return { sdk, calls };
}

function createAdapter(sdk: FacebookSdkClient, appId: string | undefined = FAKE_APP_ID) {
  return createFacebookProviderAdapter({
    sdk,
    crypto: fakeCrypto,
    createRawNonce: () => RAW_NONCE,
    resolveAppId: () => appId,
    platformOS: 'ios',
  });
}

function fakeUserCredential(uid: string, email: string | null): UserCredential {
  return {
    user: { uid, email, providerData: [{ providerId: 'facebook.com' }] },
  } as unknown as UserCredential;
}

function providerStub(
  result: ProviderAuthenticationResult | (() => Promise<ProviderAuthenticationResult>),
): SocialAuthenticationProviderAdapter & { clearCalls: number } {
  const adapter = {
    provider: 'facebook' as const,
    clearCalls: 0,
    async isAvailable() {
      return true;
    },
    async configure() {},
    async authenticate() {
      return typeof result === 'function' ? result() : result;
    },
    async clearProviderSession() {
      adapter.clearCalls += 1;
    },
  };
  return adapter;
}

function firebaseStub(
  impl?: (input: FirebaseSocialCredentialInput) => Promise<FirebaseAuthenticationSession>,
): FirebaseAuthenticationPort & { inputs: FirebaseSocialCredentialInput[] } {
  const port = {
    inputs: [] as FirebaseSocialCredentialInput[],
    async signInWithSocialCredential(input: FirebaseSocialCredentialInput) {
      port.inputs.push(input);
      if (impl) return impl(input);
      return {
        uid: 'firebase-uid-1',
        email: 'ada@example.test',
        isNewUser: false,
        linkedProviderIds: ['facebook.com'],
      };
    },
  };
  return port;
}

const CLASSIC_RESULT: ProviderAuthenticationResult = {
  provider: 'facebook',
  providerUserId: 'fb-user-1',
  accessToken: 'fb-access-token',
  email: 'ada@example.test',
  displayName: 'Ada Lovelace',
  givenName: 'Ada',
  familyName: 'Lovelace',
  photoUrl: 'https://example.test/ada.jpg',
  locale: 'en_US',
  grantedScopes: ['public_profile', 'email'],
};

describe('Facebook button on Welcome and Login', () => {
  it('renders the Facebook tile and wires both surfaces to the shared hook', () => {
    const row = readSharedSource('components/AuthSocialButtonRow.tsx');
    const login = readSharedSource('screens/LoginScreen.tsx');
    const welcome = readSharedSource('screens/WelcomeScreen.tsx');

    assert.match(row, /\{ id: 'facebook', icon: 'logo-facebook' \}/);
    assert.doesNotMatch(row, /'meta'/);
    for (const source of [login, welcome]) {
      assert.match(source, /useFacebookSignInFlow/);
      assert.match(source, /signInWithFacebook\(\)/);
      assert.match(source, /facebook: t\('authentication\.login\.social\.facebook'\)/);
      assert.match(source, /facebook: t\('authentication\.social\.facebook\.continue'\)/);
      assert.match(source, /facebookSubmitting\s+\? 'facebook'/);
    }
    assert.match(login, /provider === 'facebook'/);
    assert.match(welcome, /p === 'facebook'/);
    assert.match(login, /linkedInSubmitting \|\|\s+facebookSubmitting/);
    assert.match(welcome, /linkedInSubmitting \|\| facebookSubmitting/);
  });

  it('hook prevents double tap, stays silent on cancel and uses contractual routing', () => {
    const hook = readSharedSource('hooks/useFacebookSignInFlow.ts');
    assert.match(hook, /if \(submitting\) return/);
    assert.match(hook, /shouldSuppressFacebookSignInAlert\(err\.social\.code\)/);
    assert.match(hook, /applyPostAuthNavigation\(navigation/);
    assert.match(hook, /finally \{\s*\n\s*setSubmitting\(false\)/);
    assert.doesNotMatch(hook, /console\.log\([^)]*err\)/);
  });
});

describe('Facebook provider adapter', () => {
  it('SDK login → classic Access Token with only public_profile + email', async () => {
    const { sdk, calls } = createFakeSdk();
    const adapter = createAdapter(sdk);

    const result = await adapter.authenticate({ provider: 'facebook', interactive: true });

    assert.deepEqual([...FACEBOOK_LOGIN_PERMISSIONS], ['public_profile', 'email']);
    assert.equal(calls.login.length, 1);
    assert.deepEqual(calls.login[0]?.permissions, ['public_profile', 'email']);
    assert.equal(calls.login[0]?.tracking, 'enabled');
    assert.equal(calls.login[0]?.nonce, HASHED_NONCE);
    assert.equal(calls.initializeSDK, 1);
    assert.equal(calls.logOut, 1, 'stale Facebook session cleared before login');
    assert.equal(result.accessToken, 'fb-access-token');
    assert.equal(result.idToken, undefined);
    assert.equal(result.providerUserId, 'fb-user-1');
    assert.equal(result.displayName, 'Ada Lovelace');
    assert.equal(result.photoUrl, 'https://example.test/ada.jpg');
    assert.equal(result.email, 'ada@example.test');
  });

  it('without ATT falls back to Limited Login OIDC token + raw nonce', async () => {
    const { sdk } = createFakeSdk({ accessToken: null, authenticationToken: 'oidc-jwt' });
    const result = await createAdapter(sdk).authenticate({
      provider: 'facebook',
      interactive: true,
    });
    assert.equal(result.accessToken, undefined);
    assert.equal(result.idToken, 'oidc-jwt');
    assert.equal(result.rawNonce, RAW_NONCE);

    const mismatch = createFakeSdk({
      accessToken: null,
      authenticationToken: 'oidc-jwt',
      authenticationNonce: 'other-nonce',
    });
    await assert.rejects(
      () => createAdapter(mismatch.sdk).authenticate({ provider: 'facebook', interactive: true }),
      (err: unknown) => err instanceof SocialAuthError && err.social.code === 'TOKEN_INVALID',
    );
  });

  it('cancel maps to CANCELLED', async () => {
    const { sdk } = createFakeSdk({ cancelled: true });
    await assert.rejects(
      () => createAdapter(sdk).authenticate({ provider: 'facebook', interactive: true }),
      (err: unknown) =>
        err instanceof SocialAuthError &&
        err.social.code === 'CANCELLED' &&
        err.social.provider === 'facebook',
    );
  });

  it('missing token is a controlled TOKEN_MISSING error', async () => {
    const { sdk } = createFakeSdk({ accessToken: null, authenticationToken: null });
    await assert.rejects(
      () => createAdapter(sdk).authenticate({ provider: 'facebook', interactive: true }),
      (err: unknown) =>
        err instanceof SocialAuthError &&
        err.social.code === 'TOKEN_MISSING' &&
        err.social.diagnosticCode === 'FACEBOOK_TOKEN_MISSING',
    );
  });

  it('missing App ID config is a controlled CONFIGURATION_ERROR and unavailable', async () => {
    const { sdk, calls } = createFakeSdk();
    const adapter = createAdapter(sdk, '');
    assert.equal(await adapter.isAvailable(), false);
    await assert.rejects(
      () => adapter.authenticate({ provider: 'facebook', interactive: true }),
      (err: unknown) =>
        err instanceof SocialAuthError && err.social.code === 'CONFIGURATION_ERROR',
    );
    assert.equal(calls.login.length, 0);
  });

  it('SDK network errors map to NETWORK_ERROR without leaking payloads', async () => {
    const { sdk } = createFakeSdk({
      loginError: {
        code: 'FacebookSDK',
        message: 'Login Failed',
        domain: 'NSURLErrorDomain',
        userInfo: { NSLocalizedDescription: 'token=secret-value' },
      },
    });
    try {
      await createAdapter(sdk).authenticate({ provider: 'facebook', interactive: true });
      assert.fail('expected throw');
    } catch (err) {
      assert.ok(err instanceof SocialAuthError);
      assert.equal(err.social.code, 'NETWORK_ERROR');
      assert.equal(JSON.stringify(sanitizeSocialErrorForLog(err.social)).includes('secret-value'), false);
    }
  });

  it('declined email yields no email and still succeeds', async () => {
    const { sdk } = createFakeSdk({
      granted: ['public_profile'],
      declined: ['email'],
      profile: { userID: 'fb-user-1', name: 'Ada', imageURL: null, email: 'ada@example.test' },
    });
    const result = await createAdapter(sdk).authenticate({
      provider: 'facebook',
      interactive: true,
    });
    assert.equal(result.email, undefined);
    assert.equal(result.accessToken, 'fb-access-token');
  });

  it('clearProviderSession is idempotent and never throws', async () => {
    const { sdk, calls } = createFakeSdk({ logOutThrows: true });
    const adapter = createAdapter(sdk);
    await adapter.clearProviderSession?.();
    await adapter.clearProviderSession?.();
    assert.equal(calls.logOut, 2);
  });

  it('Android stub never loads the SDK and is unavailable', async () => {
    const adapter = createAndroidFacebookAdapter();
    assert.equal(await adapter.isAvailable(), false);
    await adapter.clearProviderSession?.();
  });
});

describe('Firebase Facebook credential', () => {
  it('uses FacebookAuthProvider.credential(accessToken) for classic login', async () => {
    const seen: unknown[] = [];
    const adapter = createFirebaseJsAuthenticationAdapter({
      FacebookAuthProvider: {
        credential(accessToken) {
          seen.push({ kind: 'facebook', accessToken });
          return { type: 'fb-cred' };
        },
      },
      async signInWithCredential(_auth, credential) {
        seen.push(credential);
        return fakeUserCredential('fb-uid', null);
      },
      auth: {},
    });
    const session = await adapter.signInWithSocialCredential({
      provider: 'facebook',
      accessToken: 'fb-access-token',
    });
    assert.deepEqual(seen, [{ kind: 'facebook', accessToken: 'fb-access-token' }, { type: 'fb-cred' }]);
    assert.equal(session.uid, 'fb-uid');
    assert.equal(session.email, undefined);
  });

  it('uses OAuthProvider(facebook.com) with idToken + rawNonce for Limited Login', async () => {
    const seen: unknown[] = [];
    class MockOAuthProvider {
      constructor(public providerId: string) {
        seen.push(providerId);
      }
      credential(params: { idToken?: string; rawNonce?: string }) {
        seen.push(params);
        return { type: 'oidc-cred' };
      }
    }
    const adapter = createFirebaseJsAuthenticationAdapter({
      OAuthProvider: MockOAuthProvider as any,
      async signInWithCredential() {
        return fakeUserCredential('fb-uid', 'ada@example.test');
      },
      auth: {},
    });
    await adapter.signInWithSocialCredential({
      provider: 'facebook',
      idToken: 'oidc-jwt',
      rawNonce: RAW_NONCE,
    });
    assert.deepEqual(seen, ['facebook.com', { idToken: 'oidc-jwt', rawNonce: RAW_NONCE }]);

    await assert.rejects(
      () => adapter.signInWithSocialCredential({ provider: 'facebook' }),
      (err: unknown) => err instanceof SocialAuthError && err.social.code === 'TOKEN_MISSING',
    );
  });

  it('account-exists-with-different-credential → ACCOUNT_CONFLICT, no auto-linking', async () => {
    let signInCalls = 0;
    const adapter = createFirebaseJsAuthenticationAdapter({
      FacebookAuthProvider: { credential: () => ({}) },
      async signInWithCredential() {
        signInCalls += 1;
        const err = new Error('exists') as Error & { code: string };
        err.code = 'auth/account-exists-with-different-credential';
        throw err;
      },
      auth: {},
    });
    await assert.rejects(
      () => adapter.signInWithSocialCredential({ provider: 'facebook', accessToken: 'tok' }),
      (err: unknown) =>
        err instanceof SocialAuthError &&
        err.social.code === 'ACCOUNT_CONFLICT' &&
        err.social.provider === 'facebook' &&
        err.social.messageKey === messageKeyForCode('ACCOUNT_CONFLICT'),
    );
    assert.equal(signInCalls, 1);
    const firebaseAdapterSource = readSharedSource(
      'authentication/social/infrastructure/firebase/firebaseJsAuthenticationAdapter.ios.ts',
    );
    assert.doesNotMatch(firebaseAdapterSource, /linkWithCredential|fetchSignInMethodsForEmail/);
  });

  it('other Firebase errors map to friendly FIREBASE_ERROR / NETWORK_ERROR', () => {
    assert.throws(
      () => mapFirebaseSocialError('facebook', { code: 'auth/internal-error' }),
      (err: unknown) => err instanceof SocialAuthError && err.social.code === 'FIREBASE_ERROR',
    );
    assert.throws(
      () => mapFirebaseSocialError('facebook', { code: 'auth/network-request-failed' }),
      (err: unknown) => err instanceof SocialAuthError && err.social.code === 'NETWORK_ERROR',
    );
  });
});

describe('authenticateWithFacebook journey', () => {
  beforeEach(() => {
    clearPendingSocialProfilePrefill();
  });

  it('existing complete user → MainTabs without prefill', async () => {
    const firebaseAuth = firebaseStub();
    const authenticate = createAuthenticateWithFacebook({
      registry: createSocialProviderRegistry({ facebook: providerStub(CLASSIC_RESULT) }),
      firebaseAuth,
      getUserProfile: async () => ({ profileSetupCompleted: true }),
      isProfileComplete: async () => true,
    });
    const result = await authenticate();
    assert.equal(result.profileRoute, 'MainTabs');
    assert.equal(result.socialProfile, undefined);
    assert.equal(peekPendingSocialProfilePrefill(), null);
    assert.deepEqual(firebaseAuth.inputs, [
      { provider: 'facebook', accessToken: 'fb-access-token' },
    ]);
  });

  it('new user → CompleteProfile with limited prefill, routed to DOB → OTP → CRJ', async () => {
    const authenticate = createAuthenticateWithFacebook({
      registry: createSocialProviderRegistry({ facebook: providerStub(CLASSIC_RESULT) }),
      firebaseAuth: firebaseStub(),
      getUserProfile: async () => null,
      isProfileComplete: async () => false,
    });
    const result = await authenticate();
    assert.equal(result.profileRoute, 'CompleteProfile');

    const pending = peekPendingSocialProfilePrefill();
    assert.equal(pending?.uid, 'firebase-uid-1');
    assert.deepEqual(Object.keys(pending?.socialProfile ?? {}).sort(), [
      'displayName',
      'email',
      'familyName',
      'givenName',
      'photoUrl',
      'provider',
      'providerUserId',
    ]);
    assert.equal(pending?.socialProfile.provider, 'facebook');
    assert.equal('locale' in (pending?.socialProfile ?? {}), false);

    assert.equal(resolvePostAuthNavigationTarget(null), 'OnboardingBirthDate');
    assert.equal(
      resolvePostAuthNavigationTarget({ birthDate: '1990-01-01' }),
      'PhoneVerification',
    );
    assert.equal(
      resolvePostAuthNavigationTarget({ birthDate: '1990-01-01', phoneVerified: true }),
      'ProfileCompletion',
    );
  });

  it('incomplete existing user → CompleteProfile keeping prefill', async () => {
    const authenticate = createAuthenticateWithFacebook({
      registry: createSocialProviderRegistry({ facebook: providerStub(CLASSIC_RESULT) }),
      firebaseAuth: firebaseStub(),
      getUserProfile: async () => ({ birthDate: '1990-01-01' }),
      isProfileComplete: async () => false,
    });
    const result = await authenticate();
    assert.equal(result.profileRoute, 'CompleteProfile');
    assert.equal(result.socialProfile?.displayName, 'Ada Lovelace');
  });

  it('missing email is not required', async () => {
    const { email: _omit, ...noEmail } = CLASSIC_RESULT;
    const authenticate = createAuthenticateWithFacebook({
      registry: createSocialProviderRegistry({ facebook: providerStub(noEmail) }),
      firebaseAuth: firebaseStub(async () => ({
        uid: 'firebase-uid-2',
        isNewUser: true,
        linkedProviderIds: ['facebook.com'],
      })),
      getUserProfile: async () => null,
      isProfileComplete: async () => false,
    });
    const result = await authenticate();
    assert.equal(result.profileRoute, 'CompleteProfile');
    assert.equal(result.email, undefined);
    assert.equal(result.socialProfile?.email, undefined);
  });

  it('Limited Login tokens reach Firebase as idToken + rawNonce', async () => {
    const firebaseAuth = firebaseStub();
    const authenticate = createAuthenticateWithFacebook({
      registry: createSocialProviderRegistry({
        facebook: providerStub({
          provider: 'facebook',
          providerUserId: 'fb-user-1',
          idToken: 'oidc-jwt',
          rawNonce: RAW_NONCE,
        }),
      }),
      firebaseAuth,
      getUserProfile: async () => null,
      isProfileComplete: async () => false,
    });
    await authenticate();
    assert.deepEqual(firebaseAuth.inputs, [
      { provider: 'facebook', idToken: 'oidc-jwt', rawNonce: RAW_NONCE },
    ]);
  });

  it('Firebase error clears the Facebook session and propagates the typed error', async () => {
    const provider = providerStub(CLASSIC_RESULT);
    const authenticate = createAuthenticateWithFacebook({
      registry: createSocialProviderRegistry({ facebook: provider }),
      firebaseAuth: firebaseStub(async () => {
        throw createSocialAuthError({
          code: 'ACCOUNT_CONFLICT',
          provider: 'facebook',
          recoverable: true,
          messageKey: messageKeyForCode('ACCOUNT_CONFLICT'),
        });
      }),
      getUserProfile: async () => {
        throw new Error('must not read profile');
      },
      isProfileComplete: async () => false,
    });
    await assert.rejects(
      () => authenticate(),
      (err: unknown) => err instanceof SocialAuthError && err.social.code === 'ACCOUNT_CONFLICT',
    );
    assert.equal(provider.clearCalls, 1);
    assert.equal(peekPendingSocialProfilePrefill(), null);
  });

  it('missing provider token never calls Firebase', async () => {
    const firebaseAuth = firebaseStub();
    const authenticate = createAuthenticateWithFacebook({
      registry: createSocialProviderRegistry({
        facebook: providerStub({ provider: 'facebook', providerUserId: 'fb-user-1' }),
      }),
      firebaseAuth,
      getUserProfile: async () => null,
      isProfileComplete: async () => false,
    });
    await assert.rejects(
      () => authenticate(),
      (err: unknown) => err instanceof SocialAuthError && err.social.code === 'TOKEN_MISSING',
    );
    assert.equal(firebaseAuth.inputs.length, 0);
  });

  it('concurrent taps are rejected with IN_PROGRESS', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const authenticate = createAuthenticateWithFacebook({
      registry: createSocialProviderRegistry({
        facebook: providerStub(async () => {
          await gate;
          return CLASSIC_RESULT;
        }),
      }),
      firebaseAuth: firebaseStub(),
      getUserProfile: async () => ({}),
      isProfileComplete: async () => true,
    });
    const first = authenticate();
    await assert.rejects(
      () => authenticate(),
      (err: unknown) => err instanceof SocialAuthError && err.social.code === 'IN_PROGRESS',
    );
    release();
    await first;
  });
});

describe('Facebook UI policy and copy', () => {
  it('cancel/in-progress silent; conflict and network keep shared copy; rest uses Facebook copy', () => {
    assert.equal(shouldSuppressFacebookSignInAlert('CANCELLED'), true);
    assert.equal(shouldSuppressFacebookSignInAlert('IN_PROGRESS'), true);
    assert.equal(shouldSuppressFacebookSignInAlert('ACCOUNT_CONFLICT'), false);
    const key = (code: Parameters<typeof messageKeyForCode>[0]) =>
      resolveFacebookSignInAlertMessageKey({ code, messageKey: messageKeyForCode(code) });
    assert.equal(key('ACCOUNT_CONFLICT'), 'authentication.social.errors.accountConflict');
    assert.equal(key('NETWORK_ERROR'), 'authentication.social.errors.network');
    assert.equal(key('FIREBASE_ERROR'), FACEBOOK_SIGN_IN_FAILED_MESSAGE_KEY);
    assert.equal(key('TOKEN_MISSING'), FACEBOOK_SIGN_IN_FAILED_MESSAGE_KEY);
    assert.equal(key('UNKNOWN'), FACEBOOK_SIGN_IN_FAILED_MESSAGE_KEY);
  });

  it('EN / ES copy matches the contract', () => {
    assert.equal(en.login.social.facebook, 'Facebook');
    assert.equal(en.social.facebook.continue, 'Continue with Facebook');
    assert.equal(en.social.facebook.cancelled, 'Facebook sign-in was canceled.');
    assert.equal(
      en.social.facebook.failed,
      "We couldn't sign you in with Facebook. Please try again.",
    );
    const esAuth = es.authentication;
    assert.equal(esAuth.social.facebook.continue, 'Continuar con Facebook');
    assert.equal(
      esAuth.social.facebook.cancelled,
      'Se canceló el inicio de sesión con Facebook.',
    );
    assert.equal(
      esAuth.social.facebook.failed,
      'No pudimos iniciar sesión con Facebook. Inténtalo nuevamente.',
    );
    assert.equal(enSettings.deleteAccount.reauthContinueFacebook, 'Continue with Facebook and delete');
    assert.equal(es.settings.deleteAccount.reauthContinueFacebook, 'Continuar con Facebook y eliminar');
  });
});

describe('Facebook logout', () => {
  it('More logout clears Firebase then Facebook, keeping contractual order', () => {
    const more = readSharedSource('screens/MoreScreen.tsx');
    const logout = more.slice(more.indexOf('const handleLogout'));
    const signOutIdx = logout.indexOf('firebaseAuth.signOut()');
    const fbIdx = logout.indexOf('clearFacebookProviderSession()');
    const navIdx = logout.indexOf("routes: [{ name: 'Login' }]");
    assert.ok(signOutIdx > 0 && fbIdx > signOutIdx && navIdx > fbIdx);

    const deleteScreen = readSharedSource('screens/DeleteAccountScreen.tsx');
    assert.match(deleteScreen, /clearFacebookProviderSession,/);
  });
});

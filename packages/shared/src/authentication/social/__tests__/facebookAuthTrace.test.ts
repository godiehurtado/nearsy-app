/**
 * ENH-AUTH-FB-01 — __DEV__-only Facebook stage trace must stay redacted.
 * Fakes only: no real tokens, UIDs, emails or network access.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, it } from 'node:test';
import type { UserCredential } from 'firebase/auth';

import {
  __setFacebookAuthTraceForTests,
  beginFacebookAuthTrace,
  flushFacebookAuthTrace,
  getFacebookAuthTrace,
  inspectFacebookProfileForTrace,
  inspectFirebaseFacebookCredentialForTrace,
  inspectLimitedLoginTokenForTrace,
  redactTraceString,
  sanitizeTraceDetail,
  summarizeFacebookAuthTrace,
  traceFacebookAuth,
} from '../application/facebookAuthTrace';
import {
  createFacebookProviderAdapter,
  type FacebookSdkClient,
} from '../infrastructure/facebook/facebookProviderAdapter';
import { createFirebaseJsAuthenticationAdapter } from '../infrastructure/firebase/firebaseJsAuthenticationAdapter.ios';
import { createAuthenticateWithFacebook } from '../application/authenticateWithFacebook';
import { createSocialProviderRegistry } from '../application/providerRegistry';
import { clearPendingSocialProfilePrefill } from '../application/socialProfilePrefillStore';

const here = dirname(fileURLToPath(import.meta.url));

const APP_ID = '1234567890';
const RAW_NONCE = 'rawNonceForTestsOnly0000000000AB';
const HASHED_NONCE = 'a'.repeat(64);
const EMAIL = 'ada@example.test';
const NAME = 'Ada Lovelace';
const FIREBASE_UID = 'firebaseUidForTests0001';
const FB_USER_ID = 'fbUserIdForTests000001';

function b64url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function fakeIdToken(overrides: Record<string, unknown> = {}): string {
  return [
    b64url({ alg: 'RS256', kid: 'fake' }),
    b64url({
      iss: 'https://www.facebook.com',
      aud: APP_ID,
      sub: FB_USER_ID,
      exp: Math.floor(Date.now() / 1000) + 3600,
      nonce: HASHED_NONCE,
      email: EMAIL,
      name: NAME,
      ...overrides,
    }),
    'fakeSignatureSegmentForTestsOnly000000',
  ].join('.');
}

const SECRETS = [RAW_NONCE, HASHED_NONCE, EMAIL, NAME, FIREBASE_UID, FB_USER_ID, APP_ID];

function captureTrace() {
  const lines: string[] = [];
  __setFacebookAuthTraceForTests({
    enabled: true,
    sink: (label, payload) => lines.push(`${label} ${JSON.stringify(payload)}`),
  });
  return lines;
}

function assertNoSecrets(output: string, idToken: string) {
  for (const secret of [...SECRETS, idToken, idToken.split('.')[1]!]) {
    assert.equal(output.includes(secret), false, 'trace leaked a sensitive value');
  }
}

const RESIDUAL_ACCESS_TOKEN = 'residualLimitedLoginAccessTokenForTests0001';

type FakeProfile = Awaited<ReturnType<FacebookSdkClient['Profile']['getCurrentProfile']>>;

function limitedLoginSdk(
  idToken: string,
  residualAccessToken?: string,
  profile: FakeProfile = {
    userID: FB_USER_ID,
    name: NAME,
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: EMAIL,
  },
): FacebookSdkClient {
  let lastNonce: string | undefined;
  return {
    Settings: { initializeSDK() {} },
    LoginManager: {
      async logInWithPermissions(_permissions, _tracking, nonce) {
        lastNonce = nonce;
        return { isCancelled: false, grantedPermissions: ['public_profile', 'email'], declinedPermissions: [] };
      },
      logOut() {},
    },
    AccessToken: {
      async getCurrentAccessToken() {
        return residualAccessToken ? { accessToken: residualAccessToken, userID: FB_USER_ID } : null;
      },
    },
    AuthenticationToken: {
      async getAuthenticationTokenIOS() {
        return { authenticationToken: idToken, nonce: lastNonce };
      },
    },
    Profile: {
      async getCurrentProfile() {
        return profile;
      },
    },
  };
}

function adapter(sdk: FacebookSdkClient) {
  return createFacebookProviderAdapter({
    sdk,
    crypto: {
      CryptoDigestAlgorithm: { SHA256: 'SHA256' },
      async digestStringAsync() {
        return HASHED_NONCE;
      },
      async getRandomBytesAsync(count: number) {
        return new Uint8Array(count);
      },
    },
    createRawNonce: () => RAW_NONCE,
    resolveAppId: () => APP_ID,
    platformOS: 'ios',
  });
}

function firebase(signIn: () => Promise<UserCredential>) {
  return createFirebaseJsAuthenticationAdapter({
    OAuthProvider: class {
      constructor(private readonly id: string) {}
      credential(params: { idToken?: string; rawNonce?: string }) {
        return { providerId: this.id, signInMethod: this.id, idToken: params.idToken, nonce: params.rawNonce };
      }
    } as never,
    signInWithCredential: signIn,
    auth: { app: { options: { projectId: 'nearsy-dev' } }, currentUser: null },
  });
}

afterEach(() => {
  __setFacebookAuthTraceForTests({});
  clearPendingSocialProfilePrefill();
});

describe('Facebook auth trace redaction', () => {
  it('scrubs JWTs, emails, long token-like runs and digit runs but keeps error codes', () => {
    const scrubbed = redactTraceString(
      `Firebase: ${fakeIdToken()} for ${EMAIL} nonce ${HASHED_NONCE} uid ${APP_ID} (auth/account-exists-with-different-credential) FACEBOOK_NONCE_GENERATION_FAILED`,
    );
    assertNoSecrets(scrubbed, fakeIdToken());
    assert.match(scrubbed, /auth\/account-exists-with-different-credential/);
    assert.match(scrubbed, /FACEBOOK_NONCE_GENERATION_FAILED/);
  });

  it('drops non-allowlisted string details and keeps booleans / numbers', () => {
    const clean = sanitizeTraceDetail({
      idToken: fakeIdToken(),
      email: EMAIL,
      uid: FIREBASE_UID,
      nonce: RAW_NONCE,
      errorCode: 'auth/invalid-credential',
      present: true,
      count: 2,
    });
    assert.deepEqual(clean, { errorCode: 'auth/invalid-credential', present: true, count: 2 });
  });

  it('is a no-op outside __DEV__', () => {
    const lines: string[] = [];
    __setFacebookAuthTraceForTests({ enabled: false, sink: (label) => lines.push(label) });
    beginFacebookAuthTrace();
    traceFacebookAuth('native_login_started');
    flushFacebookAuthTrace('ui_error');
    assert.equal(lines.length, 0);
    assert.equal(summarizeFacebookAuthTrace(), undefined);
  });

  it('token inspection returns booleans only, never claim values', () => {
    const idToken = fakeIdToken();
    const detail = inspectLimitedLoginTokenForTrace(idToken, { appId: APP_ID, hashedNonce: HASHED_NONCE });
    assert.deepEqual(detail, {
      tokenDecodable: true,
      issuerKnown: true,
      issuer: 'https://www.facebook.com',
      audMatchesAppId: true,
      notExpired: true,
      nonceClaimPresent: true,
      nonceClaimMatchesHash: true,
      subClaimPresent: true,
      nameClaimPresent: true,
      givenNameClaimPresent: false,
      familyNameClaimPresent: false,
      pictureClaimPresent: false,
      emailClaimKeyPresent: true,
      emailClaimPresent: true,
    });
    assertNoSecrets(JSON.stringify(detail), idToken);
    const mismatch = inspectLimitedLoginTokenForTrace(fakeIdToken({ nonce: 'other' }), {
      appId: APP_ID,
      hashedNonce: HASHED_NONCE,
    });
    assert.equal(mismatch.nonceClaimMatchesHash, false);
    assert.deepEqual(inspectLimitedLoginTokenForTrace('not-a-jwt', { hashedNonce: HASHED_NONCE }), {
      tokenDecodable: false,
      tokenParts: 1,
    });
  });
});

describe('Facebook auth trace stages (Limited Login)', () => {
  it('records every stage up to the profile gate without leaking values', async () => {
    const lines = captureTrace();
    const idToken = fakeIdToken();
    const authenticate = createAuthenticateWithFacebook({
      registry: createSocialProviderRegistry({ facebook: adapter(limitedLoginSdk(idToken)) }),
      firebaseAuth: firebase(async () =>
        ({ user: { uid: FIREBASE_UID, email: EMAIL, providerData: [{ providerId: 'facebook.com' }] } }) as never,
      ),
      getUserProfile: async () => null,
      isProfileComplete: async () => false,
    });

    beginFacebookAuthTrace();
    await authenticate();
    flushFacebookAuthTrace('test');

    const stages = getFacebookAuthTrace().map((event) => event.stage);
    assert.deepEqual(stages, [
      'attempt_started',
      'native_login_started',
      'native_login_completed',
      'access_token_present',
      'authentication_token_present',
      'nonce_present',
      'nonce_match',
      'token_claims_checked',
      'profile_checked',
      'firebase_credential_created',
      'firebase_sign_in_started',
      'firebase_sign_in_success',
      'profile_gate_started',
      'profile_gate_success',
    ]);
    const byStage = Object.fromEntries(getFacebookAuthTrace().map((e) => [e.stage, e.detail]));
    assert.deepEqual(byStage.nonce_match, { sdkNonceMatchesHash: true, rawNonceDiffersFromHash: true });
    assert.equal(byStage.token_claims_checked?.nonceClaimMatchesHash, true);
    assert.deepEqual(byStage.firebase_credential_created, {
      tokenKind: 'oidc_id_token',
      providerId: 'facebook.com',
      signInMethod: 'facebook.com',
      credentialHasIdToken: true,
      credentialHasAccessToken: false,
      credentialNonceIsRawNonce: true,
    });
    assert.deepEqual(byStage.firebase_sign_in_started, { projectId: 'nearsy-dev' });
    assertNoSecrets(lines.join('\n'), idToken);
  });

  it('with a residual AccessToken still sends the OIDC credential and leaks nothing', async () => {
    const lines = captureTrace();
    const idToken = fakeIdToken();
    const authenticate = createAuthenticateWithFacebook({
      registry: createSocialProviderRegistry({
        facebook: adapter(limitedLoginSdk(idToken, RESIDUAL_ACCESS_TOKEN)),
      }),
      firebaseAuth: firebase(async () =>
        ({ user: { uid: FIREBASE_UID, email: EMAIL, providerData: [{ providerId: 'facebook.com' }] } }) as never,
      ),
      getUserProfile: async () => null,
      isProfileComplete: async () => false,
    });

    beginFacebookAuthTrace();
    await authenticate();
    flushFacebookAuthTrace('test');

    const byStage = Object.fromEntries(getFacebookAuthTrace().map((e) => [e.stage, e.detail]));
    assert.deepEqual(byStage.access_token_present, { value: true });
    assert.equal(byStage.token_claims_checked?.nonceClaimMatchesHash, true);
    assert.equal(byStage.firebase_credential_created?.tokenKind, 'oidc_id_token');
    assert.equal(byStage.firebase_credential_created?.credentialHasAccessToken, false);
    assert.equal(byStage.firebase_credential_created?.credentialNonceIsRawNonce, true);
    const output = lines.join('\n');
    assertNoSecrets(output, idToken);
    assert.equal(output.includes(RESIDUAL_ACCESS_TOKEN), false);
  });

  it('surfaces the exact Firebase error code, sanitized, and a DEV alert summary', async () => {
    const lines = captureTrace();
    const idToken = fakeIdToken();
    const authenticate = createAuthenticateWithFacebook({
      registry: createSocialProviderRegistry({ facebook: adapter(limitedLoginSdk(idToken)) }),
      firebaseAuth: firebase(async () => {
        throw Object.assign(
          new Error(`Firebase: Invalid Idp Response for ${EMAIL} ${idToken} (auth/invalid-credential).`),
          { code: 'auth/invalid-credential', name: 'FirebaseError' },
        );
      }),
      getUserProfile: async () => null,
      isProfileComplete: async () => false,
    });

    beginFacebookAuthTrace();
    await assert.rejects(() => authenticate());
    traceFacebookAuth('ui_error', { socialCode: 'TOKEN_INVALID', diagnosticCode: 'auth/invalid-credential' });

    const error = getFacebookAuthTrace().find((e) => e.stage === 'firebase_sign_in_error');
    assert.equal(error?.detail?.errorCode, 'auth/invalid-credential');
    assert.equal(error?.detail?.errorName, 'FirebaseError');
    assert.equal(error?.detail?.currentUserPresent, false);
    assert.match(summarizeFacebookAuthTrace() ?? '', /stage=ui_error code=auth\/invalid-credential/);
    assertNoSecrets(lines.join('\n'), idToken);
  });

  it('hook traces non-social errors and only adds the DEV alert suffix via the trace', () => {
    const hook = readFileSync(join(here, '..', '..', '..', 'hooks', 'useFacebookSignInFlow.ts'), 'utf8');
    assert.match(hook, /beginFacebookAuthTrace\(\)/);
    assert.match(hook, /socialCode: 'NON_SOCIAL_ERROR'/);
    assert.match(hook, /const devSuffix = summarizeFacebookAuthTrace\(\)/);
    assert.match(hook, /if \(__DEV__\) setTimeout\(\(\) => flushFacebookAuthTrace/);
  });
});

describe('Facebook email diagnostics (token / SDK profile / Firebase)', () => {
  it('distinguishes an absent email claim from an empty one, booleans only', () => {
    const withoutEmail = fakeIdToken({ email: undefined, picture: 'https://example.test/p.jpg' });
    const absent = inspectLimitedLoginTokenForTrace(withoutEmail, { appId: APP_ID, hashedNonce: HASHED_NONCE });
    assert.equal(absent.emailClaimKeyPresent, false);
    assert.equal(absent.emailClaimPresent, false);
    assert.equal(absent.subClaimPresent, true);
    assert.equal(absent.nameClaimPresent, true);
    assert.equal(absent.pictureClaimPresent, true);

    const empty = inspectLimitedLoginTokenForTrace(fakeIdToken({ email: '' }), {
      appId: APP_ID,
      hashedNonce: HASHED_NONCE,
    });
    assert.equal(empty.emailClaimKeyPresent, true);
    assert.equal(empty.emailClaimPresent, false);
    assertNoSecrets(JSON.stringify([absent, empty]), withoutEmail);
  });

  it('profile built from this attempt token matches sub/email and is fresh', () => {
    const idToken = fakeIdToken();
    const loginStartedAtMs = Date.now();
    const detail = inspectFacebookProfileForTrace(
      {
        userID: FB_USER_ID,
        name: NAME,
        imageURL: 'https://example.test/p.jpg',
        email: EMAIL,
        refreshDate: new Date(loginStartedAtMs + 500),
        permissions: ['public_profile', 'email'],
      },
      { idToken, loginStartedAtMs },
    );
    assert.deepEqual(detail, {
      profilePresent: true,
      profileUserIdPresent: true,
      profileNamePresent: true,
      profileImagePresent: true,
      profileEmailPresent: true,
      profilePermissionsIncludeEmail: true,
      profileRefreshDatePresent: true,
      profileRefreshedThisAttempt: true,
      profileUserIdMatchesTokenSub: true,
      profileEmailMatchesTokenEmail: true,
    });
    assertNoSecrets(JSON.stringify(detail), idToken);
  });

  it('flags a residual / stale profile and a missing profile', () => {
    const idToken = fakeIdToken();
    const loginStartedAtMs = Date.now();
    const residual = inspectFacebookProfileForTrace(
      { userID: 'otherFbUserForTests00001', name: NAME, refreshDate: loginStartedAtMs - 60_000 },
      { idToken, loginStartedAtMs },
    );
    assert.equal(residual.profileRefreshedThisAttempt, false);
    assert.equal(residual.profileUserIdMatchesTokenSub, false);
    assert.equal(residual.profileEmailPresent, false);
    assert.equal(residual.profileEmailMatchesTokenEmail, false);

    const missing = inspectFacebookProfileForTrace(null, { idToken, loginStartedAtMs });
    assert.equal(missing.profilePresent, false);
    assert.equal(missing.profileEmailPresent, false);
  });

  it('reports where Firebase kept (or lost) the Facebook email', () => {
    const detail = inspectFirebaseFacebookCredentialForTrace(
      {
        user: {
          email: null,
          emailVerified: false,
          providerData: [{ providerId: 'facebook.com', email: null }],
        },
      },
      { isNewUser: true, providerId: 'facebook.com', profile: { name: NAME, picture: { data: {} } } },
    );
    assert.deepEqual(detail, {
      userEmailPresent: false,
      userEmailVerified: false,
      providerDataCount: 1,
      facebookProviderPresent: true,
      facebookProviderEmailPresent: false,
      additionalUserInfoAvailable: true,
      additionalUserInfoProviderIsFacebook: true,
      additionalProfilePresent: true,
      additionalProfileEmailPresent: false,
      additionalProfileNamePresent: true,
      additionalProfilePicturePresent: true,
      isNewUser: true,
    });
    assert.equal(JSON.stringify(detail).includes(NAME), false);
  });

  it('full attempt without email: every layer reports absence and nothing leaks', async () => {
    const lines = captureTrace();
    const idToken = fakeIdToken({ email: undefined, picture: 'https://example.test/p.jpg' });
    const authenticate = createAuthenticateWithFacebook({
      registry: createSocialProviderRegistry({
        facebook: adapter(
          limitedLoginSdk(idToken, undefined, {
            userID: FB_USER_ID,
            name: NAME,
            imageURL: 'https://example.test/p.jpg',
            email: null,
            refreshDate: new Date(Date.now() + 10),
          }),
        ),
      }),
      firebaseAuth: firebase(async () =>
        ({
          user: {
            uid: FIREBASE_UID,
            email: null,
            emailVerified: false,
            isAnonymous: false,
            providerData: [{ providerId: 'facebook.com', email: null }],
          },
          providerId: 'facebook.com',
          operationType: 'signIn',
          _tokenResponse: {
            providerId: 'facebook.com',
            isNewUser: true,
            rawUserInfo: JSON.stringify({ name: NAME, id: FB_USER_ID }),
          },
        }) as never,
      ),
      getUserProfile: async () => null,
      isProfileComplete: async () => false,
    });

    beginFacebookAuthTrace();
    const result = await authenticate();
    flushFacebookAuthTrace('success');

    assert.equal(result.email, undefined);
    assert.equal(result.session.isNewUser, true);
    const byStage = Object.fromEntries(getFacebookAuthTrace().map((e) => [e.stage, e.detail]));
    assert.equal(byStage.token_claims_checked?.emailClaimPresent, false);
    assert.equal(byStage.token_claims_checked?.subClaimPresent, true);
    assert.equal(byStage.token_claims_checked?.pictureClaimPresent, true);
    assert.equal(byStage.profile_checked?.profilePresent, true);
    assert.equal(byStage.profile_checked?.profileEmailPresent, false);
    assert.equal(byStage.profile_checked?.profileUserIdMatchesTokenSub, true);
    assert.equal(byStage.profile_checked?.profileRefreshedThisAttempt, true);
    assert.equal(byStage.profile_checked?.profileRefreshApiExposed, false);
    assert.equal(byStage.profile_checked?.providerResultEmailPresent, false);
    assert.equal(byStage.firebase_sign_in_success?.userEmailPresent, false);
    assert.equal(byStage.firebase_sign_in_success?.facebookProviderEmailPresent, false);
    assert.equal(byStage.firebase_sign_in_success?.additionalUserInfoAvailable, true);
    assert.equal(byStage.firebase_sign_in_success?.additionalProfileEmailPresent, false);
    assert.equal(byStage.firebase_sign_in_success?.isNewUser, true);
    assert.deepEqual(byStage.profile_gate_started, { isNewUser: true });

    const output = lines.join('\n');
    assertNoSecrets(output, idToken);
    assert.equal(output.includes('example.test/p.jpg'), false);
    assert.match(output, /\[facebookAuthTrace:summary\]/);
  });

  it('hook flushes one summary on success too (and re-emits after the sheet)', () => {
    const hook = readFileSync(join(here, '..', '..', '..', 'hooks', 'useFacebookSignInFlow.ts'), 'utf8');
    assert.match(hook, /flushFacebookAuthTrace\('success'\)/);
    assert.match(hook, /setTimeout\(\(\) => flushFacebookAuthTrace\('success_delayed'\), 2000\)/);
  });

  it('diagnostics never call Graph API, enable tracking or use the AccessToken as identity', () => {
    const adapterSource = readFileSync(
      join(here, '..', 'infrastructure', 'facebook', 'facebookProviderAdapter.ios.ts'),
      'utf8',
    );
    assert.doesNotMatch(adapterSource, /GraphRequest/);
    assert.doesNotMatch(adapterSource, /'enabled'\s*,\s*hashedNonce/);
    assert.match(adapterSource, /'limited',\s*hashedNonce/);
    assert.doesNotMatch(adapterSource, /requestTrackingPermissions|AppTrackingTransparency/);
  });
});

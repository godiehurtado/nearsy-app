/**
 * ENH-AUTH-LINK-01 — explicit "Connect Facebook" for the signed-in user.
 * Fakes only: no real tokens, UIDs, emails or network access.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import type { AuthCredential } from 'firebase/auth';

import {
  createFacebookProviderAdapter,
  type FacebookSdkClient,
} from '../infrastructure/facebook/facebookProviderAdapter';
import { createFirebaseJsAccountLinkingAdapter } from '../infrastructure/firebase/firebaseJsAccountLinkingAdapter';
import type {
  FirebaseAccountLinkingPort,
  FirebaseFacebookOidcLinkInput,
  LinkedAccountSnapshot,
} from '../infrastructure/firebase/firebaseAccountLinkingPort';
import {
  createLinkFacebookToCurrentUser,
  FACEBOOK_PROVIDER_ID,
} from '../application/linkFacebookToCurrentUser';
import { createSocialProviderRegistry } from '../application/providerRegistry';
import type { SocialAuthenticationProviderAdapter } from '../application/socialAuthenticationPort';
import type { ProviderAuthenticationResult } from '../domain/providerAuthenticationResult';
import { createSocialAuthError, messageKeyForCode } from '../domain/socialAuthenticationError';
import {
  FACEBOOK_LINK_ERROR_TITLE_KEY,
  FACEBOOK_LINK_RECENT_LOGIN_TITLE_KEY,
  FacebookLinkError,
  mapFirebaseLinkError,
  resolveFacebookLinkAlert,
  shouldSuppressFacebookLinkAlert,
  type FacebookLinkErrorCode,
} from '../domain/facebookLinkError';
import { buildSignInMethodRows } from '../application/signInMethodsPresentation';
import enSettings from '../../../i18n/resources/settings';
import es from '../../../i18n/locales/es';

const here = dirname(fileURLToPath(import.meta.url));
const readSharedSource = (rel: string) =>
  readFileSync(join(here, '..', '..', '..', rel), 'utf8');

const UID = 'uid-test-owner';
const RAW_NONCE = 'rawNonceForTestsOnly0000000000AB';

const OIDC_NO_EMAIL: ProviderAuthenticationResult = {
  provider: 'facebook',
  providerUserId: 'fb-user-1',
  idToken: 'oidc-jwt',
  rawNonce: RAW_NONCE,
};

function firebaseError(code: string) {
  return Object.assign(new Error(`Firebase: internal detail (${code}).`), {
    code,
    name: 'FirebaseError',
  });
}

function providerStub(
  behavior: ProviderAuthenticationResult | (() => Promise<ProviderAuthenticationResult>),
) {
  const stats = { configure: 0, authenticate: 0, clear: 0 };
  const adapter: SocialAuthenticationProviderAdapter = {
    provider: 'facebook',
    async isAvailable() {
      return true;
    },
    async configure() {
      stats.configure += 1;
    },
    async authenticate() {
      stats.authenticate += 1;
      return typeof behavior === 'function' ? behavior() : behavior;
    },
    async clearProviderSession() {
      stats.clear += 1;
    },
  };
  return { adapter, stats };
}

type FakeLinkingOptions = {
  account?: LinkedAccountSnapshot | null;
  linkError?: unknown;
  linkedUid?: string;
  reloadAccount?: LinkedAccountSnapshot | null;
};

function fakeLinking(options: FakeLinkingOptions = {}) {
  let account: LinkedAccountSnapshot | null =
    options.account === undefined ? { uid: UID, providerIds: ['password'] } : options.account;
  const calls = { link: [] as FirebaseFacebookOidcLinkInput[], reload: 0 };
  const port: FirebaseAccountLinkingPort = {
    getCurrentAccount: () => account,
    async linkFacebookOidcCredential(input) {
      calls.link.push(input);
      if (options.linkError) throw options.linkError;
      account = {
        uid: options.linkedUid ?? account!.uid,
        providerIds: [...account!.providerIds, FACEBOOK_PROVIDER_ID],
      };
      return account;
    },
    async reloadCurrentAccount() {
      calls.reload += 1;
      return options.reloadAccount !== undefined ? options.reloadAccount : account;
    },
  };
  return { port, calls, snapshot: () => account };
}

function setup(
  behavior: ProviderAuthenticationResult | (() => Promise<ProviderAuthenticationResult>) = OIDC_NO_EMAIL,
  linking: FakeLinkingOptions = {},
) {
  const provider = providerStub(behavior);
  const firebase = fakeLinking(linking);
  const link = createLinkFacebookToCurrentUser({
    registry: createSocialProviderRegistry({ facebook: provider.adapter }),
    accountLinking: firebase.port,
  });
  let confirmations = 0;
  const confirmYes = async () => {
    confirmations += 1;
    return true;
  };
  return { link, provider, firebase, confirmYes, confirmations: () => confirmations };
}

async function expectLinkError(promise: Promise<unknown>): Promise<FacebookLinkError> {
  try {
    await promise;
  } catch (err) {
    assert.ok(err instanceof FacebookLinkError, 'expected FacebookLinkError');
    return err;
  }
  assert.fail('expected the link attempt to fail');
}

function lookup(locale: 'en' | 'es', key: string): unknown {
  const root: unknown = locale === 'en' ? { settings: enSettings } : es;
  return key
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined,
      root,
    );
}

describe('linkFacebookToCurrentUser — happy path', () => {
  it('confirms, uses Limited Login OIDC + raw nonce and links to the same UID', async () => {
    const { link, provider, firebase, confirmYes, confirmations } = setup();
    const outcome = await link({ confirm: confirmYes });

    assert.equal(outcome.status, 'linked');
    assert.deepEqual([...outcome.providerIds], ['password', FACEBOOK_PROVIDER_ID]);
    assert.equal(confirmations(), 1);
    assert.equal(provider.stats.authenticate, 1);
    assert.deepEqual(firebase.calls.link, [
      { expectedUid: UID, idToken: 'oidc-jwt', rawNonce: RAW_NONCE },
    ]);
    assert.equal(firebase.snapshot()?.uid, UID);
    assert.equal(firebase.calls.reload, 1);
    assert.equal(provider.stats.clear, 1, 'temporary native session is cleared');
  });

  it('works when Facebook shares no email', async () => {
    const { link, firebase, confirmYes } = setup({ ...OIDC_NO_EMAIL, email: undefined });
    const outcome = await link({ confirm: confirmYes });
    assert.equal(outcome.status, 'linked');
    assert.equal(firebase.calls.link.length, 1);
  });

  it('preserves every provider already on the account', async () => {
    const { link, confirmYes } = setup(OIDC_NO_EMAIL, {
      account: { uid: UID, providerIds: ['password', 'google.com', 'apple.com'] },
    });
    const outcome = await link({ confirm: confirmYes });
    assert.deepEqual(
      [...outcome.providerIds],
      ['password', 'google.com', 'apple.com', FACEBOOK_PROVIDER_ID],
    );
  });

  it('is a no-op success when Facebook is already on the current user', async () => {
    const { link, provider, firebase, confirmYes, confirmations } = setup(OIDC_NO_EMAIL, {
      account: { uid: UID, providerIds: ['password', FACEBOOK_PROVIDER_ID] },
    });
    const outcome = await link({ confirm: confirmYes });
    assert.equal(outcome.status, 'already_linked');
    assert.equal(confirmations(), 0);
    assert.equal(provider.stats.authenticate, 0);
    assert.equal(firebase.calls.link.length, 0);
  });
});

describe('linkFacebookToCurrentUser — guards', () => {
  it('requires a signed-in user before confirming or opening Facebook', async () => {
    const { link, provider, confirmYes, confirmations } = setup(OIDC_NO_EMAIL, { account: null });
    const err = await expectLinkError(link({ confirm: confirmYes }));
    assert.equal(err.code, 'NOT_AUTHENTICATED');
    assert.equal(confirmations(), 0);
    assert.equal(provider.stats.configure, 0);
    assert.equal(provider.stats.clear, 0);
  });

  it('declined confirmation cancels silently without touching Facebook', async () => {
    const { link, provider, firebase } = setup();
    const err = await expectLinkError(link({ confirm: async () => false }));
    assert.equal(err.code, 'CANCELLED');
    assert.equal(shouldSuppressFacebookLinkAlert(err.code), true);
    assert.equal(provider.stats.configure, 0);
    assert.equal(firebase.calls.link.length, 0);
  });

  it('Facebook sheet cancellation is silent, unchanged and clears the native session', async () => {
    const { link, provider, firebase, confirmYes } = setup(async () => {
      throw createSocialAuthError({
        code: 'CANCELLED',
        provider: 'facebook',
        recoverable: true,
        messageKey: messageKeyForCode('CANCELLED'),
        diagnosticCode: 'FACEBOOK_LOGIN_CANCELLED',
      });
    });
    const err = await expectLinkError(link({ confirm: confirmYes }));
    assert.equal(err.code, 'CANCELLED');
    assert.equal(shouldSuppressFacebookLinkAlert(err.code), true);
    assert.equal(firebase.calls.link.length, 0);
    assert.deepEqual(firebase.snapshot(), { uid: UID, providerIds: ['password'] });
    assert.equal(provider.stats.clear, 1);
  });

  it('double tap runs a single attempt and the guard is released afterwards', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { link, provider, firebase, confirmYes } = setup(async () => {
      await gate;
      return OIDC_NO_EMAIL;
    });

    const first = link({ confirm: confirmYes });
    const second = await expectLinkError(link({ confirm: confirmYes }));
    assert.equal(second.code, 'IN_PROGRESS');
    assert.equal(shouldSuppressFacebookLinkAlert(second.code), true);
    release();
    await first;
    assert.equal(provider.stats.authenticate, 1);
    assert.equal(firebase.calls.link.length, 1);

    const retry = await link({ confirm: confirmYes });
    assert.equal(retry.status, 'already_linked');
  });

  it('rejects a classic AccessToken-only result (no OIDC) without linking', async () => {
    const { link, provider, firebase, confirmYes } = setup({
      provider: 'facebook',
      providerUserId: 'fb-user-1',
      accessToken: 'classic-access-token',
    });
    const err = await expectLinkError(link({ confirm: confirmYes }));
    assert.equal(err.code, 'TOKEN_MISSING');
    assert.equal(err.diagnosticCode, 'FACEBOOK_OIDC_TOKEN_REQUIRED');
    assert.equal(firebase.calls.link.length, 0);
    assert.equal(provider.stats.clear, 1);
  });

  it('missing token or raw nonce is handled explicitly', async () => {
    for (const result of [
      { provider: 'facebook', providerUserId: 'x' },
      { provider: 'facebook', providerUserId: 'x', idToken: 'oidc-jwt' },
    ] as ProviderAuthenticationResult[]) {
      const { link, firebase, confirmYes } = setup(result);
      const err = await expectLinkError(link({ confirm: confirmYes }));
      assert.equal(err.code, 'TOKEN_MISSING');
      assert.equal(firebase.calls.link.length, 0);
    }
  });

  it('nonce mismatch from the Facebook adapter maps to TOKEN_INVALID', async () => {
    const { link, firebase, confirmYes } = setup(async () => {
      throw createSocialAuthError({
        code: 'TOKEN_INVALID',
        provider: 'facebook',
        recoverable: false,
        messageKey: messageKeyForCode('TOKEN_INVALID'),
        diagnosticCode: 'FACEBOOK_NONCE_MISMATCH',
      });
    });
    const err = await expectLinkError(link({ confirm: confirmYes }));
    assert.equal(err.code, 'TOKEN_INVALID');
    assert.equal(err.diagnosticCode, 'FACEBOOK_NONCE_MISMATCH');
    assert.equal(firebase.calls.link.length, 0);
  });

  it('fails closed when the UID differs after linking', async () => {
    const { link, confirmYes } = setup(OIDC_NO_EMAIL, { linkedUid: 'uid-someone-else' });
    const err = await expectLinkError(link({ confirm: confirmYes }));
    assert.equal(err.code, 'IDENTITY_CHANGED');
  });

  it('fails closed when the session is gone after reload', async () => {
    const { link, confirmYes } = setup(OIDC_NO_EMAIL, { reloadAccount: null });
    const err = await expectLinkError(link({ confirm: confirmYes }));
    assert.equal(err.code, 'IDENTITY_CHANGED');
  });
});

describe('linkFacebookToCurrentUser — Firebase errors', () => {
  async function failWith(code: string, linking: FakeLinkingOptions = {}) {
    const ctx = setup(OIDC_NO_EMAIL, { linkError: firebaseError(code), ...linking });
    const result = await ctx.link({ confirm: ctx.confirmYes }).then(
      (outcome) => ({ outcome, error: undefined as FacebookLinkError | undefined }),
      (error: FacebookLinkError) => ({ outcome: undefined, error }),
    );
    return { ...ctx, ...result };
  }

  it('provider-already-linked is success only when Facebook is on the current user', async () => {
    const ok = await failWith('auth/provider-already-linked', {
      reloadAccount: { uid: UID, providerIds: ['password', FACEBOOK_PROVIDER_ID] },
    });
    assert.equal(ok.outcome?.status, 'already_linked');

    const notOurs = await failWith('auth/provider-already-linked');
    assert.equal(notOurs.error?.code, 'UNKNOWN');
  });

  it('credential-already-in-use: no merge, no move, account untouched', async () => {
    const { error, firebase, provider } = await failWith('auth/credential-already-in-use');
    assert.equal(error?.code, 'CREDENTIAL_IN_USE');
    assert.equal(error?.messageKey, 'settings.signInMethods.errors.credentialInUse');
    assert.deepEqual(firebase.snapshot(), { uid: UID, providerIds: ['password'] });
    assert.equal(provider.stats.clear, 1);
  });

  it('email-already-in-use uses the same non-enumerating message', async () => {
    const { error } = await failWith('auth/email-already-in-use');
    assert.equal(error?.code, 'CREDENTIAL_IN_USE');
    assert.equal(error?.messageKey, 'settings.signInMethods.errors.credentialInUse');
  });

  it('requires-recent-login shows sign-out / sign-in guidance', async () => {
    const { error } = await failWith('auth/requires-recent-login');
    assert.equal(error?.code, 'RECENT_LOGIN_REQUIRED');
    assert.deepEqual(resolveFacebookLinkAlert(error!), {
      titleKey: FACEBOOK_LINK_RECENT_LOGIN_TITLE_KEY,
      messageKey: 'settings.signInMethods.errors.recentLogin',
    });
  });

  it('unknown errors never surface Firebase internals and allow retry', async () => {
    const ctx = await failWith('auth/internal-error');
    assert.equal(ctx.error?.code, 'UNKNOWN');
    assert.equal(ctx.error?.messageKey, 'settings.signInMethods.errors.unknown');
    assert.doesNotMatch(ctx.error?.message ?? '', /internal detail/);
    assert.equal(resolveFacebookLinkAlert(ctx.error!).titleKey, FACEBOOK_LINK_ERROR_TITLE_KEY);
    assert.deepEqual(ctx.firebase.snapshot(), { uid: UID, providerIds: ['password'] });
    assert.equal(ctx.provider.stats.clear, 1);

    await expectLinkError(ctx.link({ confirm: ctx.confirmYes }));
    assert.equal(ctx.provider.stats.authenticate, 2, 'guard released, retry possible');
  });

  it('maps every documented Firebase code', () => {
    const cases: Array<[string, FacebookLinkErrorCode]> = [
      ['auth/credential-already-in-use', 'CREDENTIAL_IN_USE'],
      ['auth/email-already-in-use', 'CREDENTIAL_IN_USE'],
      ['auth/requires-recent-login', 'RECENT_LOGIN_REQUIRED'],
      ['auth/network-request-failed', 'NETWORK_ERROR'],
      ['auth/invalid-credential', 'TOKEN_INVALID'],
      ['auth/missing-or-invalid-nonce', 'TOKEN_INVALID'],
      ['auth/user-token-expired', 'NOT_AUTHENTICATED'],
      ['auth/something-new', 'UNKNOWN'],
    ];
    for (const [code, expected] of cases) {
      assert.equal(mapFirebaseLinkError(firebaseError(code)).code, expected, code);
    }
    assert.equal(mapFirebaseLinkError(new Error('boom')).code, 'UNKNOWN');
  });

  it('every link error message key exists in EN and ES', () => {
    const codes: FacebookLinkErrorCode[] = [
      'NOT_AUTHENTICATED',
      'PROVIDER_UNAVAILABLE',
      'TOKEN_MISSING',
      'TOKEN_INVALID',
      'CREDENTIAL_IN_USE',
      'RECENT_LOGIN_REQUIRED',
      'NETWORK_ERROR',
      'IDENTITY_CHANGED',
      'UNKNOWN',
    ];
    const keys = [
      FACEBOOK_LINK_ERROR_TITLE_KEY,
      FACEBOOK_LINK_RECENT_LOGIN_TITLE_KEY,
      ...codes.map((code) => new FacebookLinkError(code, 'test').messageKey),
    ];
    for (const key of keys) {
      for (const locale of ['en', 'es'] as const) {
        const text = lookup(locale, key);
        assert.equal(typeof text, 'string', `${locale}:${key}`);
        assert.doesNotMatch(text as string, /auth\/|firebase|nonce|token/i);
      }
    }
  });
});

describe('Firebase JS account linking adapter', () => {
  function runtime(currentUser: { uid: string; providerData: Array<{ providerId: string }> } | null) {
    const calls = {
      credentials: [] as Array<{ providerId: string; idToken: string; rawNonce: string }>,
      linkedUser: [] as unknown[],
      reload: 0,
    };
    const user = currentUser
      ? {
          ...currentUser,
          async reload() {
            calls.reload += 1;
          },
        }
      : null;
    const auth = { currentUser: user as never };
    const adapter = createFirebaseJsAccountLinkingAdapter({
      OAuthProvider: class {
        constructor(readonly providerId: string) {}
        credential(params: { idToken: string; rawNonce: string }) {
          const cred = { providerId: this.providerId, ...params };
          calls.credentials.push(cred);
          return cred as unknown as AuthCredential;
        }
      },
      async linkWithCredential(target) {
        calls.linkedUser.push(target);
        return {
          user: {
            uid: target.uid,
            providerData: [...target.providerData, { providerId: 'facebook.com' }],
          } as never,
        };
      },
      auth,
    });
    return { adapter, calls, auth, user };
  }

  it('links an OAuthProvider(facebook.com) OIDC credential to currentUser', async () => {
    const { adapter, calls, user } = runtime({ uid: UID, providerData: [{ providerId: 'password' }] });
    const snapshot = await adapter.linkFacebookOidcCredential({
      expectedUid: UID,
      idToken: 'oidc-jwt',
      rawNonce: RAW_NONCE,
    });
    assert.deepEqual(calls.credentials, [
      { providerId: 'facebook.com', idToken: 'oidc-jwt', rawNonce: RAW_NONCE },
    ]);
    assert.equal(calls.linkedUser[0], user);
    assert.deepEqual(snapshot, { uid: UID, providerIds: ['password', 'facebook.com'] });
  });

  it('refuses to link when there is no user or the UID changed', async () => {
    const none = runtime(null);
    const noUser = await expectLinkError(
      none.adapter.linkFacebookOidcCredential({ expectedUid: UID, idToken: 't', rawNonce: 'n' }),
    );
    assert.equal(noUser.code, 'NOT_AUTHENTICATED');
    assert.equal(none.calls.linkedUser.length, 0);

    const other = runtime({ uid: 'uid-other', providerData: [] });
    const changed = await expectLinkError(
      other.adapter.linkFacebookOidcCredential({ expectedUid: UID, idToken: 't', rawNonce: 'n' }),
    );
    assert.equal(changed.code, 'IDENTITY_CHANGED');
    assert.equal(other.calls.linkedUser.length, 0);
  });

  it('reads providers from providerData and reloads the current user', async () => {
    const { adapter, calls } = runtime({
      uid: UID,
      providerData: [{ providerId: 'password' }, { providerId: 'google.com' }],
    });
    assert.deepEqual(adapter.getCurrentAccount(), {
      uid: UID,
      providerIds: ['password', 'google.com'],
    });
    await adapter.reloadCurrentAccount();
    assert.equal(calls.reload, 1);
  });
});

describe('Connect Facebook end-to-end with the real Limited Login adapter', () => {
  const fakeCrypto = {
    CryptoDigestAlgorithm: { SHA256: 'SHA256' },
    async digestStringAsync(_algorithm: unknown, data: string) {
      return `sha256(${data})`;
    },
    async getRandomBytesAsync(count: number) {
      return new Uint8Array(count).map((_, i) => i % 62);
    },
  };

  function sdkWithoutEmail(options: { nonceOverride?: string; loginError?: unknown } = {}) {
    const calls = { logOut: 0, login: [] as Array<{ tracking?: string; nonce?: string }> };
    const sdk: FacebookSdkClient = {
      Settings: { initializeSDK() {} },
      LoginManager: {
        async logInWithPermissions(_permissions, tracking, nonce) {
          calls.login.push({ tracking, nonce });
          if (options.loginError) throw options.loginError;
          return {
            isCancelled: false,
            grantedPermissions: ['public_profile'],
            declinedPermissions: ['email'],
          };
        },
        logOut() {
          calls.logOut += 1;
        },
      },
      AccessToken: {
        async getCurrentAccessToken() {
          return null;
        },
      },
      AuthenticationToken: {
        async getAuthenticationTokenIOS() {
          return {
            authenticationToken: 'oidc-jwt',
            nonce: options.nonceOverride ?? calls.login.at(-1)?.nonce ?? '',
          };
        },
      },
      Profile: {
        async getCurrentProfile() {
          return { userID: 'fb-user-1', name: 'Ada', firstName: 'Ada', lastName: null };
        },
      },
    };
    return { sdk, calls };
  }

  function wire(sdk: FacebookSdkClient) {
    const facebook = createFacebookProviderAdapter({
      sdk,
      crypto: fakeCrypto,
      createRawNonce: () => RAW_NONCE,
      resolveAppId: () => '1234567890',
      platformOS: 'ios',
    });
    const firebase = fakeLinking();
    const link = createLinkFacebookToCurrentUser({
      registry: createSocialProviderRegistry({ facebook }),
      accountLinking: firebase.port,
    });
    return { link, firebase };
  }

  it('hashes the nonce for Facebook and links with the matching raw nonce (no email)', async () => {
    const { sdk, calls } = sdkWithoutEmail();
    const { link, firebase } = wire(sdk);
    const outcome = await link({ confirm: async () => true });

    assert.equal(outcome.status, 'linked');
    assert.equal(calls.login[0]?.tracking, 'limited');
    assert.equal(calls.login[0]?.nonce, `sha256(${RAW_NONCE})`);
    assert.deepEqual(firebase.calls.link, [
      { expectedUid: UID, idToken: 'oidc-jwt', rawNonce: RAW_NONCE },
    ]);
    assert.ok(calls.logOut >= 1, 'native Facebook session cleared');
  });

  it('nonce mismatch never reaches Firebase and clears the native session', async () => {
    const { sdk, calls } = sdkWithoutEmail({ nonceOverride: 'sha256(other)' });
    const { link, firebase } = wire(sdk);
    const err = await expectLinkError(link({ confirm: async () => true }));
    assert.equal(err.code, 'TOKEN_INVALID');
    assert.equal(firebase.calls.link.length, 0);
    assert.ok(calls.logOut >= 1);
  });
});

describe('Sign-in methods presentation', () => {
  it('lists only Firebase-exposed linked methods, then Facebook', () => {
    assert.deepEqual(buildSignInMethodRows(['password']), [
      { id: 'password', linked: true, labelKey: 'settings.signInMethods.providers.password' },
      { id: 'facebook.com', linked: false, labelKey: 'settings.signInMethods.providers.facebook' },
    ]);
    assert.deepEqual(
      buildSignInMethodRows(['facebook.com', 'apple.com', 'google.com']).map((r) => [r.id, r.linked]),
      [
        ['google.com', true],
        ['apple.com', true],
        ['facebook.com', true],
      ],
    );
  });

  it('never invents LinkedIn, phone or custom-token methods', () => {
    const rows = buildSignInMethodRows(['custom', 'phone', 'oidc.linkedin', 'linkedin.com']);
    assert.deepEqual(rows.map((r) => r.id), ['facebook.com']);
    assert.equal(rows[0]?.linked, false);
  });
});

describe('Connect Facebook — static safety contract', () => {
  const linkingSources = [
    'authentication/social/application/linkFacebookToCurrentUser.ts',
    'authentication/social/infrastructure/firebase/firebaseJsAccountLinkingAdapter.ts',
    'authentication/social/domain/facebookLinkError.ts',
    'hooks/useConnectFacebookFlow.ts',
    'screens/SignInMethodsScreen.tsx',
  ];

  it('never signs in, creates, merges, unlinks, looks up by email or persists', () => {
    for (const rel of linkingSources) {
      const src = readSharedSource(rel);
      assert.doesNotMatch(
        src,
        /signInWithCredential\s*\(|signInWithCustomToken|fetchSignInMethodsForEmail|createUserWith|\bunlink\s*\(|deleteUser|setDoc|updateDoc|AsyncStorage|SecureStore|graph\.facebook|requestTrackingPermissions|ATTrackingManager/,
        rel,
      );
    }
  });

  it('never logs tokens, nonces, emails or UIDs', () => {
    for (const rel of linkingSources) {
      const src = readSharedSource(rel);
      for (const line of src.split('\n').filter((l) => /console\.(log|warn|error|info)/.test(l))) {
        assert.doesNotMatch(line, /idToken|rawNonce|nonce|token|email|uid/i, `${rel}: ${line.trim()}`);
      }
    }
  });

  it('Login / Welcome and the sign-in flow never link accounts', () => {
    for (const rel of [
      'hooks/useFacebookSignInFlow.ts',
      'screens/LoginScreen.tsx',
      'screens/WelcomeScreen.tsx',
      'authentication/social/application/authenticateWithFacebook.ts',
      'authentication/social/infrastructure/firebase/firebaseJsAuthenticationAdapter.ios.ts',
    ]) {
      const src = readSharedSource(rel);
      assert.doesNotMatch(
        src,
        /linkWithCredential|LinkFacebook|useConnectFacebookFlow|AccountLinking/,
        rel,
      );
    }
  });

  it('UI reaches Firebase only through the linking orchestrator / adapter', () => {
    for (const rel of ['hooks/useConnectFacebookFlow.ts', 'screens/SignInMethodsScreen.tsx']) {
      const src = readSharedSource(rel);
      assert.doesNotMatch(src, /from 'firebase\/auth'|linkWithCredential|config\/firebaseConfig/, rel);
    }
  });

  it('only the linking adapter calls linkWithCredential', () => {
    const adapter = readSharedSource(
      'authentication/social/infrastructure/firebase/firebaseJsAccountLinkingAdapter.ts',
    );
    assert.match(adapter, /linkWithCredential/);
    assert.match(adapter, /new FacebookOAuth\('facebook\.com'\)\.credential\(\{/);
    assert.doesNotMatch(adapter, /FacebookAuthProvider/);
  });
});

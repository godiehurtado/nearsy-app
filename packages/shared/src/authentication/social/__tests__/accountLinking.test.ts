/**
 * ENH-AUTH-LINK-01 — explicit "Connect Google / Apple / Facebook" for the
 * signed-in user. Fakes only: no real tokens, UIDs, emails or network access.
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
import {
  createAppleProviderAdapter,
  type AppleAuthenticationClient,
} from '../infrastructure/apple/appleProviderAdapter';
import { createFirebaseJsAccountLinkingAdapter } from '../infrastructure/firebase/firebaseJsAccountLinkingAdapter';
import type {
  FirebaseAccountLinkingPort,
  FirebaseProviderLinkInput,
  LinkedAccountSnapshot,
} from '../infrastructure/firebase/firebaseAccountLinkingPort';
import {
  createLinkProviderToCurrentUser,
  toLinkCredential,
} from '../application/linkProviderToCurrentUser';
import { createSocialProviderRegistry } from '../application/providerRegistry';
import type { SocialAuthenticationProviderAdapter } from '../application/socialAuthenticationPort';
import type { ProviderAuthenticationResult } from '../domain/providerAuthenticationResult';
import { createSocialAuthError, messageKeyForCode } from '../domain/socialAuthenticationError';
import {
  ACCOUNT_LINK_ERROR_TITLE_KEY,
  ACCOUNT_LINK_RECENT_LOGIN_TITLE_KEY,
  AccountLinkError,
  LINKABLE_PROVIDER_IDS,
  LINKABLE_PROVIDERS,
  mapFirebaseLinkError,
  resolveAccountLinkAlert,
  shouldSuppressAccountLinkAlert,
  type AccountLinkErrorCode,
  type LinkableProvider,
} from '../domain/accountLinkError';
import { buildSignInMethodRows } from '../application/signInMethodsPresentation';
import enSettings from '../../../i18n/resources/settings';
import es from '../../../i18n/locales/es';

const here = dirname(fileURLToPath(import.meta.url));
const readSharedSource = (rel: string) =>
  readFileSync(join(here, '..', '..', '..', rel), 'utf8');

const UID = 'uid-test-owner';
const RAW_NONCE = 'rawNonceForTestsOnly0000000000AB';

/** Fresh provider results without email or name (must still link). */
const RESULTS: Record<LinkableProvider, ProviderAuthenticationResult> = {
  google: { provider: 'google', providerUserId: 'g-user-1', idToken: 'google-id-token' },
  apple: {
    provider: 'apple',
    providerUserId: 'apple-user-1',
    idToken: 'apple-identity-token',
    rawNonce: RAW_NONCE,
  },
  facebook: {
    provider: 'facebook',
    providerUserId: 'fb-user-1',
    idToken: 'oidc-jwt',
    rawNonce: RAW_NONCE,
  },
};

function firebaseError(code: string) {
  return Object.assign(new Error(`Firebase: internal detail (${code}).`), {
    code,
    name: 'FirebaseError',
  });
}

function providerStub(
  provider: LinkableProvider,
  behavior: ProviderAuthenticationResult | (() => Promise<ProviderAuthenticationResult>),
  options: { withClear?: boolean } = {},
) {
  const stats = { configure: 0, authenticate: 0, clear: 0 };
  const adapter: SocialAuthenticationProviderAdapter = {
    provider,
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
    ...(options.withClear === false
      ? {}
      : {
          async clearProviderSession() {
            stats.clear += 1;
          },
        }),
  };
  return { adapter, stats };
}

type FakeLinkingOptions = {
  account?: LinkedAccountSnapshot | null;
  linkError?: unknown;
  linkedUid?: string;
  reloadAccount?: LinkedAccountSnapshot | null;
  /** Simulates Firebase returning without the provider in providerData. */
  dropProviderOnLink?: boolean;
};

function fakeLinking(options: FakeLinkingOptions = {}) {
  let account: LinkedAccountSnapshot | null =
    options.account === undefined ? { uid: UID, providerIds: ['password'] } : options.account;
  const calls = { link: [] as FirebaseProviderLinkInput[], reload: 0, signIn: 0, createUser: 0 };
  const port: FirebaseAccountLinkingPort = {
    getCurrentAccount: () => account,
    async linkProviderCredential(input) {
      calls.link.push(input);
      if (options.linkError) throw options.linkError;
      const added = options.dropProviderOnLink
        ? []
        : [LINKABLE_PROVIDER_IDS[input.credential.provider]];
      account = {
        uid: options.linkedUid ?? account!.uid,
        providerIds: [...account!.providerIds, ...added],
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
  provider: LinkableProvider,
  behavior: ProviderAuthenticationResult | (() => Promise<ProviderAuthenticationResult>) = RESULTS[provider],
  linking: FakeLinkingOptions = {},
) {
  const stubs = {
    google: providerStub('google', provider === 'google' ? behavior : RESULTS.google),
    apple: providerStub('apple', provider === 'apple' ? behavior : RESULTS.apple, {
      withClear: false,
    }),
    facebook: providerStub('facebook', provider === 'facebook' ? behavior : RESULTS.facebook),
  };
  const firebase = fakeLinking(linking);
  const link = createLinkProviderToCurrentUser({
    registry: createSocialProviderRegistry({
      google: stubs.google.adapter,
      apple: stubs.apple.adapter,
      facebook: stubs.facebook.adapter,
    }),
    accountLinking: firebase.port,
  });
  let confirmations = 0;
  const confirmYes = async () => {
    confirmations += 1;
    return true;
  };
  return {
    link,
    provider: stubs[provider],
    stubs,
    firebase,
    confirmYes,
    confirmations: () => confirmations,
  };
}

async function expectLinkError(promise: Promise<unknown>): Promise<AccountLinkError> {
  try {
    await promise;
  } catch (err) {
    assert.ok(err instanceof AccountLinkError, 'expected AccountLinkError');
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

const cancelledError = (provider: LinkableProvider) =>
  createSocialAuthError({
    code: 'CANCELLED',
    provider,
    recoverable: true,
    messageKey: messageKeyForCode('CANCELLED'),
    diagnosticCode: 'USER_CANCELLED',
  });

describe('linkProviderToCurrentUser — happy path (Google, Apple, Facebook)', () => {
  for (const provider of LINKABLE_PROVIDERS) {
    it(`${provider}: confirms, links a fresh credential and keeps the same UID`, async () => {
      const ctx = setup(provider);
      const outcome = await ctx.link(provider, { confirm: ctx.confirmYes });

      assert.equal(outcome.status, 'linked');
      assert.equal(outcome.provider, provider);
      assert.deepEqual([...outcome.providerIds], ['password', LINKABLE_PROVIDER_IDS[provider]]);
      assert.equal(ctx.confirmations(), 1);
      assert.equal(ctx.provider.stats.authenticate, 1);
      assert.equal(ctx.firebase.calls.link.length, 1);
      assert.equal(ctx.firebase.calls.link[0]?.expectedUid, UID);
      assert.equal(ctx.firebase.calls.link[0]?.credential.provider, provider);
      assert.equal(ctx.firebase.snapshot()?.uid, UID);
      assert.equal(ctx.firebase.calls.reload, 1);
      assert.equal(ctx.firebase.calls.signIn, 0);
      assert.equal(ctx.firebase.calls.createUser, 0);
    });

    it(`${provider}: links without email or name from the provider`, async () => {
      const ctx = setup(provider, { ...RESULTS[provider], email: undefined, displayName: undefined });
      const outcome = await ctx.link(provider, { confirm: ctx.confirmYes });
      assert.equal(outcome.status, 'linked');
    });

    it(`${provider}: already on the current user is a no-op success`, async () => {
      const ctx = setup(provider, RESULTS[provider], {
        account: { uid: UID, providerIds: ['password', LINKABLE_PROVIDER_IDS[provider]] },
      });
      const outcome = await ctx.link(provider, { confirm: ctx.confirmYes });
      assert.equal(outcome.status, 'already_linked');
      assert.equal(ctx.confirmations(), 0);
      assert.equal(ctx.provider.stats.authenticate, 0);
      assert.equal(ctx.firebase.calls.link.length, 0);
    });
  }

  it('builds provider-specific in-memory credentials', () => {
    assert.deepEqual(toLinkCredential('google', { ...RESULTS.google, accessToken: 'g-access' }), {
      provider: 'google',
      idToken: 'google-id-token',
      accessToken: 'g-access',
    });
    assert.deepEqual(toLinkCredential('apple', RESULTS.apple), {
      provider: 'apple',
      idToken: 'apple-identity-token',
      rawNonce: RAW_NONCE,
    });
    assert.deepEqual(toLinkCredential('facebook', RESULTS.facebook), {
      provider: 'facebook',
      idToken: 'oidc-jwt',
      rawNonce: RAW_NONCE,
    });
  });

  it('native session cleanup: Facebook always; Google only after failure', async () => {
    const fb = setup('facebook');
    await fb.link('facebook', { confirm: fb.confirmYes });
    assert.equal(fb.provider.stats.clear, 1);

    const google = setup('google');
    await google.link('google', { confirm: google.confirmYes });
    assert.equal(google.provider.stats.clear, 0, 'no global Google sign-out on success');

    const googleFail = setup('google', RESULTS.google, {
      linkError: firebaseError('auth/internal-error'),
    });
    await expectLinkError(googleFail.link('google', { confirm: googleFail.confirmYes }));
    assert.equal(googleFail.provider.stats.clear, 1);
  });
});

describe('linkProviderToCurrentUser — functional scenarios', () => {
  const scenarios: Array<[string, string[], LinkableProvider, string[]]> = [
    ['Email → Google', ['password'], 'google', ['password', 'google.com']],
    ['Email → Apple', ['password'], 'apple', ['password', 'apple.com']],
    ['Facebook → Google', ['facebook.com'], 'google', ['facebook.com', 'google.com']],
    ['Facebook → Apple', ['facebook.com'], 'apple', ['facebook.com', 'apple.com']],
    ['Google → Facebook', ['google.com'], 'facebook', ['google.com', 'facebook.com']],
    ['Apple → Facebook', ['apple.com'], 'facebook', ['apple.com', 'facebook.com']],
  ];

  for (const [name, before, provider, after] of scenarios) {
    it(`${name}: keeps every previous provider and the same UID`, async () => {
      const ctx = setup(provider, RESULTS[provider], { account: { uid: UID, providerIds: before } });
      const outcome = await ctx.link(provider, { confirm: ctx.confirmYes });
      assert.deepEqual([...outcome.providerIds], after);
      assert.equal(ctx.firebase.snapshot()?.uid, UID);
    });
  }

  it('Google + Apple already associated are both shown as connected', () => {
    const rows = buildSignInMethodRows(['google.com', 'apple.com']);
    assert.deepEqual(
      rows.map((r) => [r.id, r.linked, r.connectProvider ?? null]),
      [
        ['google.com', true, null],
        ['apple.com', true, null],
        ['facebook.com', false, 'facebook'],
      ],
    );
  });
});

describe('linkProviderToCurrentUser — guards', () => {
  for (const provider of LINKABLE_PROVIDERS) {
    it(`${provider}: requires a signed-in user before confirming or opening the provider`, async () => {
      const ctx = setup(provider, RESULTS[provider], { account: null });
      const err = await expectLinkError(ctx.link(provider, { confirm: ctx.confirmYes }));
      assert.equal(err.code, 'NOT_AUTHENTICATED');
      assert.equal(ctx.confirmations(), 0);
      assert.equal(ctx.provider.stats.configure, 0);
    });

    it(`${provider}: declined confirmation cancels silently without opening the provider`, async () => {
      const ctx = setup(provider);
      const err = await expectLinkError(ctx.link(provider, { confirm: async () => false }));
      assert.equal(err.code, 'CANCELLED');
      assert.equal(shouldSuppressAccountLinkAlert(err.code), true);
      assert.equal(ctx.provider.stats.configure, 0);
      assert.equal(ctx.firebase.calls.link.length, 0);
    });

    it(`${provider}: provider sheet cancellation is silent, unchanged and retryable`, async () => {
      let cancel = true;
      const ctx = setup(provider, async () => {
        if (cancel) throw cancelledError(provider);
        return RESULTS[provider];
      });
      const err = await expectLinkError(ctx.link(provider, { confirm: ctx.confirmYes }));
      assert.equal(err.code, 'CANCELLED');
      assert.equal(shouldSuppressAccountLinkAlert(err.code), true);
      assert.equal(ctx.firebase.calls.link.length, 0);
      assert.deepEqual(ctx.firebase.snapshot(), { uid: UID, providerIds: ['password'] });

      cancel = false;
      const retry = await ctx.link(provider, { confirm: ctx.confirmYes });
      assert.equal(retry.status, 'linked');
    });

    it(`${provider}: UID changed before linking aborts without linking`, async () => {
      const ctx = setup(provider, RESULTS[provider], {
        linkError: new AccountLinkError('IDENTITY_CHANGED', provider, 'UID_CHANGED_BEFORE_LINK'),
      });
      const err = await expectLinkError(ctx.link(provider, { confirm: ctx.confirmYes }));
      assert.equal(err.code, 'IDENTITY_CHANGED');
      assert.deepEqual(ctx.firebase.snapshot(), { uid: UID, providerIds: ['password'] });
    });
  }

  it('double tap runs a single attempt and blocks other providers meanwhile', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const ctx = setup('google', async () => {
      await gate;
      return RESULTS.google;
    });

    const first = ctx.link('google', { confirm: ctx.confirmYes });
    const again = await expectLinkError(ctx.link('google', { confirm: ctx.confirmYes }));
    const other = await expectLinkError(ctx.link('apple', { confirm: ctx.confirmYes }));
    assert.equal(again.code, 'IN_PROGRESS');
    assert.equal(other.code, 'IN_PROGRESS');
    assert.equal(shouldSuppressAccountLinkAlert(again.code), true);
    release();
    await first;
    assert.equal(ctx.stubs.google.stats.authenticate, 1);
    assert.equal(ctx.stubs.apple.stats.authenticate, 0);
    assert.equal(ctx.confirmations(), 1);

    const apple = await ctx.link('apple', { confirm: ctx.confirmYes });
    assert.equal(apple.status, 'linked', 'guard released after the first attempt');
  });

  it('fails closed when the UID differs after linking', async () => {
    const ctx = setup('google', RESULTS.google, { linkedUid: 'uid-someone-else' });
    const err = await expectLinkError(ctx.link('google', { confirm: ctx.confirmYes }));
    assert.equal(err.code, 'IDENTITY_CHANGED');
  });

  it('fails closed when the session is gone after reload', async () => {
    const ctx = setup('apple', RESULTS.apple, { reloadAccount: null });
    const err = await expectLinkError(ctx.link('apple', { confirm: ctx.confirmYes }));
    assert.equal(err.code, 'IDENTITY_CHANGED');
  });

  it('requires the expected providerId in providerData after reload', async () => {
    const ctx = setup('google', RESULTS.google, { dropProviderOnLink: true });
    const err = await expectLinkError(ctx.link('google', { confirm: ctx.confirmYes }));
    assert.equal(err.code, 'UNKNOWN');
    assert.equal(err.diagnosticCode, 'PROVIDER_MISSING_AFTER_RELOAD');
  });

  it('missing token / nonce is handled explicitly per provider', async () => {
    const cases: Array<[LinkableProvider, ProviderAuthenticationResult, AccountLinkErrorCode]> = [
      ['google', { provider: 'google', providerUserId: 'x' }, 'TOKEN_MISSING'],
      ['apple', { provider: 'apple', providerUserId: 'x', rawNonce: RAW_NONCE }, 'TOKEN_MISSING'],
      ['apple', { provider: 'apple', providerUserId: 'x', idToken: 't' }, 'TOKEN_INVALID'],
      ['facebook', { provider: 'facebook', providerUserId: 'x' }, 'TOKEN_MISSING'],
      ['facebook', { provider: 'facebook', providerUserId: 'x', idToken: 't' }, 'TOKEN_MISSING'],
      [
        'facebook',
        { provider: 'facebook', providerUserId: 'x', accessToken: 'classic' },
        'TOKEN_MISSING',
      ],
    ];
    for (const [provider, result, code] of cases) {
      const ctx = setup(provider, result);
      const err = await expectLinkError(ctx.link(provider, { confirm: ctx.confirmYes }));
      assert.equal(err.code, code, `${provider}:${JSON.stringify(Object.keys(result))}`);
      assert.equal(ctx.firebase.calls.link.length, 0);
    }
  });

  it('invalid nonce / token from the provider maps to TOKEN_INVALID', async () => {
    const ctx = setup('facebook', async () => {
      throw createSocialAuthError({
        code: 'TOKEN_INVALID',
        provider: 'facebook',
        recoverable: false,
        messageKey: messageKeyForCode('TOKEN_INVALID'),
        diagnosticCode: 'FACEBOOK_NONCE_MISMATCH',
      });
    });
    const err = await expectLinkError(ctx.link('facebook', { confirm: ctx.confirmYes }));
    assert.equal(err.code, 'TOKEN_INVALID');
    assert.equal(err.diagnosticCode, 'FACEBOOK_NONCE_MISMATCH');
    assert.equal(ctx.firebase.calls.link.length, 0);
  });
});

describe('linkProviderToCurrentUser — Firebase errors', () => {
  async function failWith(
    provider: LinkableProvider,
    code: string,
    linking: FakeLinkingOptions = {},
  ) {
    const ctx = setup(provider, RESULTS[provider], { linkError: firebaseError(code), ...linking });
    const result = await ctx.link(provider, { confirm: ctx.confirmYes }).then(
      (outcome) => ({ outcome, error: undefined as AccountLinkError | undefined }),
      (error: AccountLinkError) => ({ outcome: undefined, error }),
    );
    return { ...ctx, ...result };
  }

  for (const provider of LINKABLE_PROVIDERS) {
    const providerId = LINKABLE_PROVIDER_IDS[provider];

    it(`${provider}: provider-already-linked is success only when on the current user`, async () => {
      const ok = await failWith(provider, 'auth/provider-already-linked', {
        reloadAccount: { uid: UID, providerIds: ['password', providerId] },
      });
      assert.equal(ok.outcome?.status, 'already_linked');

      const notOurs = await failWith(provider, 'auth/provider-already-linked');
      assert.equal(notOurs.error?.code, 'UNKNOWN');
    });

    for (const code of ['auth/credential-already-in-use', 'auth/email-already-in-use']) {
      it(`${provider}: ${code} → neutral message, nothing merged or moved`, async () => {
        const { error, firebase } = await failWith(provider, code);
        assert.equal(error?.code, 'CREDENTIAL_IN_USE');
        assert.equal(error?.messageKey, 'settings.signInMethods.errors.credentialInUse');
        assert.deepEqual(firebase.snapshot(), { uid: UID, providerIds: ['password'] });
      });
    }

    it(`${provider}: requires-recent-login shows sign-out / sign-in guidance`, async () => {
      const { error } = await failWith(provider, 'auth/requires-recent-login');
      assert.equal(error?.code, 'RECENT_LOGIN_REQUIRED');
      const alert = resolveAccountLinkAlert(error!);
      assert.equal(alert.titleKey, ACCOUNT_LINK_RECENT_LOGIN_TITLE_KEY);
      assert.equal(alert.messageKey, 'settings.signInMethods.errors.recentLogin');
    });

    it(`${provider}: invalid credential / nonce from Firebase → controlled message`, async () => {
      for (const code of ['auth/invalid-credential', 'auth/missing-or-invalid-nonce']) {
        const { error } = await failWith(provider, code);
        assert.equal(error?.code, 'TOKEN_INVALID');
        assert.equal(error?.messageKey, 'settings.signInMethods.errors.verificationFailed');
      }
    });

    it(`${provider}: unknown errors never surface Firebase internals and allow retry`, async () => {
      const ctx = await failWith(provider, 'auth/internal-error');
      assert.equal(ctx.error?.code, 'UNKNOWN');
      assert.equal(ctx.error?.messageKey, 'settings.signInMethods.errors.unknown');
      assert.doesNotMatch(ctx.error?.message ?? '', /internal detail/);
      assert.equal(resolveAccountLinkAlert(ctx.error!).titleKey, ACCOUNT_LINK_ERROR_TITLE_KEY);
      assert.deepEqual(ctx.firebase.snapshot(), { uid: UID, providerIds: ['password'] });

      await expectLinkError(ctx.link(provider, { confirm: ctx.confirmYes }));
      assert.equal(ctx.provider.stats.authenticate, 2, 'guard released, retry possible');
    });
  }

  it('alert params carry only the provider brand name', () => {
    const alert = resolveAccountLinkAlert(
      new AccountLinkError('CREDENTIAL_IN_USE', 'apple', 'auth/credential-already-in-use'),
    );
    assert.deepEqual(alert.params, { provider: 'Apple' });
  });

  it('maps every documented Firebase code', () => {
    const cases: Array<[string, AccountLinkErrorCode]> = [
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
      assert.equal(mapFirebaseLinkError('google', firebaseError(code)).code, expected, code);
    }
    assert.equal(mapFirebaseLinkError('apple', new Error('boom')).code, 'UNKNOWN');
  });

  it('every link message key exists in EN and ES and never leaks internals', () => {
    const codes: AccountLinkErrorCode[] = [
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
      ACCOUNT_LINK_ERROR_TITLE_KEY,
      ACCOUNT_LINK_RECENT_LOGIN_TITLE_KEY,
      ...codes.map((code) => new AccountLinkError(code, 'google', 'test').messageKey),
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
      credentials: [] as Array<Record<string, unknown>>,
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
    const adapter = createFirebaseJsAccountLinkingAdapter({
      OAuthProvider: class {
        constructor(readonly providerId: string) {}
        credential(params: { idToken: string; rawNonce: string }) {
          const cred = { providerId: this.providerId, ...params };
          calls.credentials.push(cred);
          return cred as unknown as AuthCredential;
        }
      },
      GoogleAuthProvider: {
        credential(idToken: string, accessToken?: string | null) {
          const cred = { providerId: 'google.com', idToken, accessToken };
          calls.credentials.push(cred);
          return cred as unknown as AuthCredential;
        },
      },
      async linkWithCredential(target, credential) {
        calls.linkedUser.push(target);
        const providerId = (credential as unknown as { providerId: string }).providerId;
        return {
          user: {
            uid: target.uid,
            providerData: [...target.providerData, { providerId }],
          } as never,
        };
      },
      auth: { currentUser: user as never },
    });
    return { adapter, calls, user };
  }

  it('Google: GoogleAuthProvider.credential linked to currentUser', async () => {
    const { adapter, calls, user } = runtime({ uid: UID, providerData: [{ providerId: 'password' }] });
    const snapshot = await adapter.linkProviderCredential({
      expectedUid: UID,
      credential: { provider: 'google', idToken: 'google-id-token' },
    });
    assert.deepEqual(calls.credentials, [
      { providerId: 'google.com', idToken: 'google-id-token', accessToken: null },
    ]);
    assert.equal(calls.linkedUser[0], user);
    assert.deepEqual(snapshot, { uid: UID, providerIds: ['password', 'google.com'] });
  });

  it('Apple: OAuthProvider(apple.com) with identity token + raw nonce', async () => {
    const { adapter, calls } = runtime({ uid: UID, providerData: [{ providerId: 'password' }] });
    const snapshot = await adapter.linkProviderCredential({
      expectedUid: UID,
      credential: { provider: 'apple', idToken: 'apple-identity-token', rawNonce: RAW_NONCE },
    });
    assert.deepEqual(calls.credentials, [
      { providerId: 'apple.com', idToken: 'apple-identity-token', rawNonce: RAW_NONCE },
    ]);
    assert.deepEqual(snapshot.providerIds, ['password', 'apple.com']);
  });

  it('Facebook: OAuthProvider(facebook.com) OIDC credential', async () => {
    const { adapter, calls } = runtime({ uid: UID, providerData: [{ providerId: 'google.com' }] });
    await adapter.linkProviderCredential({
      expectedUid: UID,
      credential: { provider: 'facebook', idToken: 'oidc-jwt', rawNonce: RAW_NONCE },
    });
    assert.deepEqual(calls.credentials, [
      { providerId: 'facebook.com', idToken: 'oidc-jwt', rawNonce: RAW_NONCE },
    ]);
  });

  it('refuses to link when there is no user or the UID changed', async () => {
    const none = runtime(null);
    const noUser = await expectLinkError(
      none.adapter.linkProviderCredential({
        expectedUid: UID,
        credential: { provider: 'google', idToken: 't' },
      }),
    );
    assert.equal(noUser.code, 'NOT_AUTHENTICATED');
    assert.equal(none.calls.linkedUser.length, 0);

    const other = runtime({ uid: 'uid-other', providerData: [] });
    const changed = await expectLinkError(
      other.adapter.linkProviderCredential({
        expectedUid: UID,
        credential: { provider: 'apple', idToken: 't', rawNonce: 'n' },
      }),
    );
    assert.equal(changed.code, 'IDENTITY_CHANGED');
    assert.equal(changed.provider, 'apple');
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

describe('End-to-end with the real Apple and Facebook provider adapters', () => {
  const fakeCrypto = {
    CryptoDigestAlgorithm: { SHA256: 'SHA256' },
    async digestStringAsync(_algorithm: unknown, data: string) {
      return `sha256(${data})`;
    },
    async getRandomBytesAsync(count: number) {
      return new Uint8Array(count).map((_, i) => i % 62);
    },
  };

  it('Apple: fresh hashed nonce per attempt, raw nonce linked, no name/email needed', async () => {
    const requests: Array<{ nonce: string }> = [];
    const appleAuth: AppleAuthenticationClient = {
      async isAvailableAsync() {
        return true;
      },
      async signInAsync(options) {
        requests.push({ nonce: options.nonce });
        return { user: 'apple-user-1', identityToken: 'apple-identity-token', email: null, fullName: null };
      },
      AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
    };
    let counter = 0;
    const apple = createAppleProviderAdapter({
      appleAuth,
      crypto: fakeCrypto,
      createRawNonce: () => `rawNonceAttempt${++counter}`,
      platformOS: 'ios',
    });
    const firebase = fakeLinking();
    const link = createLinkProviderToCurrentUser({
      registry: createSocialProviderRegistry({ apple }),
      accountLinking: firebase.port,
    });

    const outcome = await link('apple', { confirm: async () => true });
    assert.equal(outcome.status, 'linked');
    assert.equal(requests[0]?.nonce, 'sha256(rawNonceAttempt1)');
    assert.deepEqual(firebase.calls.link[0]?.credential, {
      provider: 'apple',
      idToken: 'apple-identity-token',
      rawNonce: 'rawNonceAttempt1',
    });

    const fresh = fakeLinking();
    const linkAgain = createLinkProviderToCurrentUser({
      registry: createSocialProviderRegistry({ apple }),
      accountLinking: fresh.port,
    });
    await linkAgain('apple', { confirm: async () => true });
    assert.equal(requests[1]?.nonce, 'sha256(rawNonceAttempt2)', 'nonce never reused');
  });

  function facebookSdk(options: { nonceOverride?: string } = {}) {
    const calls = { logOut: 0, login: [] as Array<{ tracking?: string; nonce?: string }> };
    const sdk: FacebookSdkClient = {
      Settings: { initializeSDK() {} },
      LoginManager: {
        async logInWithPermissions(_permissions, tracking, nonce) {
          calls.login.push({ tracking, nonce });
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

  function wireFacebook(sdk: FacebookSdkClient) {
    const facebook = createFacebookProviderAdapter({
      sdk,
      crypto: fakeCrypto,
      createRawNonce: () => RAW_NONCE,
      resolveAppId: () => '1234567890',
      platformOS: 'ios',
    });
    const firebase = fakeLinking();
    const link = createLinkProviderToCurrentUser({
      registry: createSocialProviderRegistry({ facebook }),
      accountLinking: firebase.port,
    });
    return { link, firebase };
  }

  it('Facebook: Limited Login hashed nonce, raw nonce linked (no email)', async () => {
    const { sdk, calls } = facebookSdk();
    const { link, firebase } = wireFacebook(sdk);
    const outcome = await link('facebook', { confirm: async () => true });

    assert.equal(outcome.status, 'linked');
    assert.equal(calls.login[0]?.tracking, 'limited');
    assert.equal(calls.login[0]?.nonce, `sha256(${RAW_NONCE})`);
    assert.deepEqual(firebase.calls.link[0]?.credential, {
      provider: 'facebook',
      idToken: 'oidc-jwt',
      rawNonce: RAW_NONCE,
    });
    assert.ok(calls.logOut >= 1, 'native Facebook session cleared');
  });

  it('Facebook: nonce mismatch never reaches Firebase and clears the native session', async () => {
    const { sdk, calls } = facebookSdk({ nonceOverride: 'sha256(other)' });
    const { link, firebase } = wireFacebook(sdk);
    const err = await expectLinkError(link('facebook', { confirm: async () => true }));
    assert.equal(err.code, 'TOKEN_INVALID');
    assert.equal(firebase.calls.link.length, 0);
    assert.ok(calls.logOut >= 1);
  });
});

describe('Sign-in methods presentation', () => {
  it('all four linked methods show as connected, with nothing to connect', () => {
    const rows = buildSignInMethodRows(['password', 'google.com', 'apple.com', 'facebook.com']);
    assert.deepEqual(
      rows.map((r) => [r.id, r.linked, r.connectProvider ?? null]),
      [
        ['password', true, null],
        ['google.com', true, null],
        ['apple.com', true, null],
        ['facebook.com', true, null],
      ],
    );
  });

  it('missing Google / Apple / Facebook show their connect action; email is never connectable', () => {
    assert.deepEqual(
      buildSignInMethodRows(['password']).map((r) => [r.id, r.linked, r.connectProvider ?? null]),
      [
        ['password', true, null],
        ['google.com', false, 'google'],
        ['apple.com', false, 'apple'],
        ['facebook.com', false, 'facebook'],
      ],
    );
    assert.equal(
      buildSignInMethodRows(['google.com']).some((r) => r.id === 'password'),
      false,
    );
  });

  it('never invents LinkedIn, phone or custom-token methods', () => {
    const rows = buildSignInMethodRows(['custom', 'phone', 'oidc.linkedin', 'linkedin.com']);
    assert.deepEqual(rows.map((r) => r.id), ['google.com', 'apple.com', 'facebook.com']);
    assert.ok(rows.every((r) => !r.linked));
  });
});

describe('Account linking — static safety contract', () => {
  const linkingSources = [
    'authentication/social/application/linkProviderToCurrentUser.ts',
    'authentication/social/infrastructure/firebase/firebaseJsAccountLinkingAdapter.ts',
    'authentication/social/domain/accountLinkError.ts',
    'hooks/useConnectProviderFlow.ts',
    'screens/SignInMethodsScreen.tsx',
  ];

  it('never signs in, creates, merges, unlinks, looks up by email or persists', () => {
    for (const rel of linkingSources) {
      const src = readSharedSource(rel);
      assert.doesNotMatch(
        src,
        /signInWithCredential|signInWithCustomToken|fetchSignInMethodsForEmail|createUserWith|\bunlink\s*\(|deleteUser|setDoc|updateDoc|writeBatch|runTransaction|uploadBytes|deleteObject|AsyncStorage|SecureStore|graph\.facebook|requestTrackingPermissions|ATTrackingManager/,
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

  it('Login / Welcome and the sign-in flows never link accounts', () => {
    for (const rel of [
      'hooks/useGoogleSignInFlow.ts',
      'hooks/useAppleSignInFlow.ts',
      'hooks/useFacebookSignInFlow.ts',
      'screens/LoginScreen.tsx',
      'screens/WelcomeScreen.tsx',
      'authentication/social/application/authenticateWithGoogle.ts',
      'authentication/social/application/authenticateWithApple.ts',
      'authentication/social/application/authenticateWithFacebook.ts',
      'authentication/social/infrastructure/firebase/firebaseJsAuthenticationAdapter.ios.ts',
    ]) {
      const src = readSharedSource(rel);
      assert.doesNotMatch(
        src,
        /linkWithCredential|LinkProvider|useConnectProviderFlow|AccountLinking/,
        rel,
      );
    }
    const signInAdapter = readSharedSource(
      'authentication/social/infrastructure/firebase/firebaseJsAuthenticationAdapter.ios.ts',
    );
    assert.match(signInAdapter, /signInWithCredential/);
  });

  it('UI reaches Firebase only through the linking orchestrator / adapter', () => {
    for (const rel of ['hooks/useConnectProviderFlow.ts', 'screens/SignInMethodsScreen.tsx']) {
      const src = readSharedSource(rel);
      assert.doesNotMatch(src, /from 'firebase\/auth'|linkWithCredential|config\/firebaseConfig/, rel);
    }
  });

  it('only the linking adapter calls linkWithCredential, for the three providers', () => {
    const adapter = readSharedSource(
      'authentication/social/infrastructure/firebase/firebaseJsAccountLinkingAdapter.ts',
    );
    assert.match(adapter, /linkWithCredential/);
    assert.match(adapter, /Google\.credential\(input\.idToken, input\.accessToken \?\? null\)/);
    assert.match(adapter, /new OAuth\('apple\.com'\)\.credential\(\{/);
    assert.match(adapter, /new OAuth\('facebook\.com'\)\.credential\(\{/);
    assert.doesNotMatch(adapter, /FacebookAuthProvider/);
  });

  it('logout and Delete Account do not use the linking flow', () => {
    for (const rel of [
      'screens/MoreScreen.tsx',
      'screens/DeleteAccountScreen.tsx',
      'services/deletionReauth/reauthenticateForAccountDeletion.ts',
      'services/accountDeletionSession.ts',
    ]) {
      const src = readSharedSource(rel);
      assert.doesNotMatch(src, /linkWithCredential|LinkProvider|useConnectProviderFlow/, rel);
    }
  });
});

/**
 * Behavior tests for Facebook Login on Android (ENH-AUTH-FB-01).
 *
 * Injected deps: no Facebook SDK / RNFirebase / React Native.
 * Run: node --experimental-strip-types --test packages/shared/src/authentication/facebook/__tests__/facebookAuth.test.ts
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  FACEBOOK_LOGIN_PERMISSIONS,
  FacebookAuthenticationError,
  buildFacebookProfilePrefill,
  createAuthenticateWithFacebook,
  createReauthenticateWithFacebook,
  extractFacebookIdentity,
  hasFacebookProvider,
  resolveDeleteAccountReauthMethod,
  type AuthenticateWithFacebookDeps,
  type FacebookFirebaseSession,
} from '../facebookAuthCore.ts';
import { runFacebookDeleteAccount } from '../facebookDeleteAccount.ts';
import { runContractualAndroidLogout } from '../../../location/contractualLogout.ts';

const CANCELLED_KEY = 'authentication.social.facebook.errors.cancelled';
const GENERIC_KEY = 'authentication.social.facebook.errors.generic';

function session(
  overrides: Partial<FacebookFirebaseSession> = {},
): FacebookFirebaseSession {
  return {
    uid: 'firebase-uid-1',
    email: 'person@example.com',
    identity: {
      email: 'person@example.com',
      displayName: 'Ana Pérez',
      givenName: 'Ana',
      familyName: 'Pérez',
      photoUrl: 'https://platform-lookaside.fbsbx.com/p.jpg',
    },
    ...overrides,
  };
}

function deps(
  overrides: Partial<AuthenticateWithFacebookDeps> = {},
): AuthenticateWithFacebookDeps {
  return {
    isConfigured: () => true,
    requestAccessToken: async () => ({ accessToken: 'fb-access-token' }),
    signInWithAccessToken: async () => session(),
    ...overrides,
  };
}

function isFbError(code: string, messageKey?: string) {
  return (err: unknown) =>
    err instanceof FacebookAuthenticationError &&
    err.code === code &&
    (messageKey === undefined || err.messageKey === messageKey);
}

describe('Facebook Login permissions', () => {
  it('requests only public_profile and email', () => {
    assert.deepEqual([...FACEBOOK_LOGIN_PERMISSIONS], ['public_profile', 'email']);
    assert.ok(Object.isFrozen(FACEBOOK_LOGIN_PERMISSIONS));
  });
});

describe('authenticateWithFacebook', () => {
  it('SDK success → access token handed to Firebase exchange → session', async () => {
    const seenTokens: string[] = [];
    const authenticate = createAuthenticateWithFacebook(
      deps({
        requestAccessToken: async () => ({ accessToken: '  fb-access-token  ' }),
        signInWithAccessToken: async (token) => {
          seenTokens.push(token);
          return session();
        },
      }),
    );

    const result = await authenticate();
    assert.deepEqual(seenTokens, ['fb-access-token']);
    assert.equal(result.uid, 'firebase-uid-1');
    assert.equal(result.email, 'person@example.com');
  });

  it('maps SDK cancel to CANCELLED with the canceled copy and never calls Firebase', async () => {
    let firebaseCalls = 0;
    const authenticate = createAuthenticateWithFacebook(
      deps({
        requestAccessToken: async () => {
          throw new FacebookAuthenticationError(
            'CANCELLED',
            'cancelled',
            'SDK_LOGIN_CANCELLED',
          );
        },
        signInWithAccessToken: async () => {
          firebaseCalls += 1;
          return session();
        },
      }),
    );
    await assert.rejects(authenticate, isFbError('CANCELLED', CANCELLED_KEY));
    assert.equal(firebaseCalls, 0);
  });

  it('missing access token → TOKEN_MISSING, discards native session, no Firebase call', async () => {
    let discarded = 0;
    let firebaseCalls = 0;
    for (const accessToken of [null, undefined, '', '   ']) {
      const authenticate = createAuthenticateWithFacebook(
        deps({
          requestAccessToken: async () => ({ accessToken }),
          signInWithAccessToken: async () => {
            firebaseCalls += 1;
            return session();
          },
          discardProviderSession: () => {
            discarded += 1;
          },
        }),
      );
      await assert.rejects(authenticate, isFbError('TOKEN_MISSING', GENERIC_KEY));
    }
    assert.equal(firebaseCalls, 0);
    assert.equal(discarded, 4);
  });

  it('not configured → NOT_CONFIGURED without touching the SDK', async () => {
    let sdkCalls = 0;
    const authenticate = createAuthenticateWithFacebook(
      deps({
        isConfigured: () => false,
        requestAccessToken: async () => {
          sdkCalls += 1;
          return { accessToken: 'x' };
        },
      }),
    );
    await assert.rejects(authenticate, isFbError('NOT_CONFIGURED', GENERIC_KEY));
    assert.equal(sdkCalls, 0);
  });

  it('SDK error → SDK_ERROR (generic copy); network-ish message → NETWORK_ERROR', async () => {
    const sdkFail = createAuthenticateWithFacebook(
      deps({
        requestAccessToken: async () => {
          throw Object.assign(new Error('Login failed'), { code: 'EUNSPECIFIED' });
        },
      }),
    );
    await assert.rejects(sdkFail, (err: unknown) => {
      assert.ok(isFbError('SDK_ERROR', GENERIC_KEY)(err));
      assert.equal((err as FacebookAuthenticationError).diagnosticCode, 'EUNSPECIFIED');
      return true;
    });

    const netFail = createAuthenticateWithFacebook(
      deps({
        requestAccessToken: async () => {
          throw new Error('net::ERR_INTERNET_DISCONNECTED connection lost');
        },
      }),
    );
    await assert.rejects(netFail, isFbError('NETWORK_ERROR', GENERIC_KEY));
  });

  it('Firebase error → mapped code, native session discarded', async () => {
    const cases: Array<[string, string]> = [
      ['auth/network-request-failed', 'NETWORK_ERROR'],
      ['auth/invalid-credential', 'INVALID_CREDENTIAL'],
      ['auth/user-disabled', 'USER_DISABLED'],
      ['auth/operation-not-allowed', 'NOT_CONFIGURED'],
      ['auth/internal-error', 'FIREBASE_ERROR'],
    ];
    for (const [firebaseCode, expected] of cases) {
      let discarded = 0;
      const authenticate = createAuthenticateWithFacebook(
        deps({
          signInWithAccessToken: async () => {
            throw Object.assign(new Error('boom'), { code: firebaseCode });
          },
          discardProviderSession: () => {
            discarded += 1;
          },
        }),
      );
      await assert.rejects(authenticate, (err: unknown) => {
        assert.ok(isFbError(expected, GENERIC_KEY)(err), firebaseCode);
        assert.equal((err as FacebookAuthenticationError).diagnosticCode, firebaseCode);
        return true;
      });
      assert.equal(discarded, 1, firebaseCode);
    }
  });

  it('account-exists-with-different-credential → ACCOUNT_CONFLICT, no linking, no prefill', async () => {
    const commits: string[] = [];
    let discarded = 0;
    const authenticate = createAuthenticateWithFacebook(
      deps({
        signInWithAccessToken: async () => {
          throw Object.assign(new Error('exists'), {
            code: 'auth/account-exists-with-different-credential',
          });
        },
        commitPrefill: (uid) => {
          commits.push(uid);
        },
        discardProviderSession: () => {
          discarded += 1;
        },
      }),
    );
    await assert.rejects(authenticate, isFbError('ACCOUNT_CONFLICT', GENERIC_KEY));
    assert.deepEqual(commits, []);
    assert.equal(discarded, 1);
    // The deps contract has no linking capability at all.
    assert.equal('linkWithCredential' in deps(), false);
  });

  it('blocks a double tap while the first attempt is in flight', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let sdkCalls = 0;
    const authenticate = createAuthenticateWithFacebook(
      deps({
        requestAccessToken: async () => {
          sdkCalls += 1;
          await gate;
          return { accessToken: 'fb-access-token' };
        },
      }),
    );

    const first = authenticate();
    await assert.rejects(authenticate, isFbError('OPERATION_IN_PROGRESS'));
    release();
    await first;
    assert.equal(sdkCalls, 1);
    // Guard releases after completion.
    await authenticate();
    assert.equal(sdkCalls, 2);
  });

  it('commits a limited prefill (name, photo, email) by uid before returning', async () => {
    const commits: Array<{ uid: string; prefill: Record<string, unknown> }> = [];
    const authenticate = createAuthenticateWithFacebook(
      deps({
        commitPrefill: (uid, prefill) => {
          commits.push({ uid, prefill: { ...prefill } });
        },
      }),
    );
    const result = await authenticate();
    assert.equal(commits.length, 1);
    assert.equal(commits[0].uid, 'firebase-uid-1');
    assert.deepEqual(Object.keys(commits[0].prefill).sort(), [
      'displayName',
      'email',
      'familyName',
      'givenName',
      'photoUrl',
    ]);
    assert.deepEqual(result.prefill, commits[0].prefill);
    assert.equal(JSON.stringify(result).includes('fb-access-token'), false);
  });

  it('works without email: email null, prefill has no email', async () => {
    const commits: Array<Record<string, unknown>> = [];
    const authenticate = createAuthenticateWithFacebook(
      deps({
        signInWithAccessToken: async () =>
          session({
            email: null,
            identity: { displayName: 'Sin Correo', photoUrl: null },
          }),
        commitPrefill: (_uid, prefill) => {
          commits.push({ ...prefill });
        },
      }),
    );
    const result = await authenticate();
    assert.equal(result.email, null);
    assert.deepEqual(commits, [{ displayName: 'Sin Correo' }]);
  });

  it('prefill commit failure does not fail an authenticated session', async () => {
    const authenticate = createAuthenticateWithFacebook(
      deps({
        commitPrefill: () => {
          throw new Error('store unavailable');
        },
      }),
    );
    const result = await authenticate();
    assert.equal(result.uid, 'firebase-uid-1');
  });
});

describe('Facebook identity extraction / prefill', () => {
  it('whitelists name, photo and email from additionalUserInfo.profile', () => {
    const identity = extractFacebookIdentity({
      user: { displayName: 'Fallback', email: null, photoURL: null },
      additionalUserInfo: {
        profile: {
          id: '1234567890',
          name: 'Ana Pérez',
          first_name: 'Ana',
          last_name: 'Pérez',
          email: 'ana@example.com',
          birthday: '01/01/1990',
          gender: 'female',
          friends: { data: [] },
          picture: { data: { url: 'https://platform-lookaside.fbsbx.com/a.jpg' } },
        },
      },
    });
    assert.deepEqual(identity, {
      email: 'ana@example.com',
      displayName: 'Ana Pérez',
      givenName: 'Ana',
      familyName: 'Pérez',
      photoUrl: 'https://platform-lookaside.fbsbx.com/a.jpg',
    });
  });

  it('falls back to the Firebase user record and tolerates a missing profile', () => {
    assert.deepEqual(
      extractFacebookIdentity({
        user: {
          displayName: 'User Name',
          email: 'u@example.com',
          photoURL: 'https://graph.facebook.com/1/picture',
        },
        additionalUserInfo: null,
      }),
      {
        email: 'u@example.com',
        displayName: 'User Name',
        photoUrl: 'https://graph.facebook.com/1/picture',
      },
    );
    assert.deepEqual(extractFacebookIdentity({ user: null }), {});
  });

  it('prefill drops non-https photos and empty identities', () => {
    assert.deepEqual(
      buildFacebookProfilePrefill({
        displayName: 'Ana',
        photoUrl: 'http://insecure.example.com/a.jpg',
      }),
      { displayName: 'Ana' },
    );
    assert.equal(buildFacebookProfilePrefill({ email: '  ' }), undefined);
  });
});

describe('Facebook reauthentication (Delete Account)', () => {
  it('fresh token → reauthenticateWithAccessToken', async () => {
    const tokens: string[] = [];
    const reauth = createReauthenticateWithFacebook({
      isConfigured: () => true,
      requestAccessToken: async () => ({ accessToken: 'fresh-token' }),
      reauthenticateWithAccessToken: async (token) => {
        tokens.push(token);
      },
    });
    await reauth();
    assert.deepEqual(tokens, ['fresh-token']);
  });

  it('user-mismatch → USER_MISMATCH', async () => {
    const reauth = createReauthenticateWithFacebook({
      isConfigured: () => true,
      requestAccessToken: async () => ({ accessToken: 'fresh-token' }),
      reauthenticateWithAccessToken: async () => {
        throw Object.assign(new Error('mismatch'), { code: 'auth/user-mismatch' });
      },
    });
    await assert.rejects(reauth, isFbError('USER_MISMATCH'));
  });

  it('delete runs only after successful reauth, then drops the native session', async () => {
    const calls: string[] = [];
    const outcome = await runFacebookDeleteAccount({
      reauthenticate: async () => {
        calls.push('reauth');
      },
      deleteAccount: async () => {
        calls.push('delete');
      },
      logOutProviderSession: () => {
        calls.push('fbLogout');
      },
    });
    assert.deepEqual(outcome, { status: 'deleted' });
    assert.deepEqual(calls, ['reauth', 'delete', 'fbLogout']);
  });

  it('reauth cancel never deletes', async () => {
    let deleted = 0;
    const outcome = await runFacebookDeleteAccount({
      reauthenticate: async () => {
        throw new FacebookAuthenticationError('CANCELLED', 'cancelled');
      },
      deleteAccount: async () => {
        deleted += 1;
      },
    });
    assert.equal(deleted, 0);
    assert.deepEqual(outcome, {
      status: 'reauth_cancelled',
      messageKey: 'settings.deleteAccount.reauthCancelled',
    });
  });

  it('reauth mismatch / failure / in-progress never delete', async () => {
    let deleted = 0;
    const del = async () => {
      deleted += 1;
    };
    const mismatch = await runFacebookDeleteAccount({
      reauthenticate: async () => {
        throw new FacebookAuthenticationError('USER_MISMATCH', 'x');
      },
      deleteAccount: del,
    });
    const failed = await runFacebookDeleteAccount({
      reauthenticate: async () => {
        throw new Error('unexpected');
      },
      deleteAccount: del,
    });
    const busy = await runFacebookDeleteAccount({
      reauthenticate: async () => {
        throw new FacebookAuthenticationError('OPERATION_IN_PROGRESS', 'x');
      },
      deleteAccount: del,
    });
    assert.equal(deleted, 0);
    assert.equal(mismatch.status, 'reauth_mismatch');
    assert.equal(failed.status, 'reauth_failed');
    assert.equal(busy.status, 'in_progress');
  });

  it('reauth method: password wins; facebook-only uses Facebook; others unchanged', () => {
    const user = (...ids: string[]) => ({
      providerData: ids.map((providerId) => ({ providerId })),
    });
    assert.equal(resolveDeleteAccountReauthMethod(user('facebook.com')), 'facebook');
    assert.equal(
      resolveDeleteAccountReauthMethod(user('password', 'facebook.com')),
      'password',
    );
    assert.equal(resolveDeleteAccountReauthMethod(user('google.com')), 'other');
    assert.equal(resolveDeleteAccountReauthMethod(user('phone')), 'other');
    assert.equal(resolveDeleteAccountReauthMethod(null), 'other');
    assert.equal(hasFacebookProvider(user('google.com', 'facebook.com')), true);
    assert.equal(hasFacebookProvider(user('google.com')), false);
    assert.equal(hasFacebookProvider(undefined), false);
  });
});

describe('Contractual logout with Facebook session', () => {
  function logoutDeps(calls: string[], providerLogout?: () => void) {
    return {
      clearSocialPrefill: () => {
        calls.push('clearPrefill');
      },
      stopBackground: async () => {
        calls.push('stopBackground');
      },
      isVisibilityActive: () => false,
      deactivateVisibility: async () => {
        calls.push('deactivate');
      },
      signOutProviderSessions: providerLogout,
      signOut: async () => {
        calls.push('firebaseSignOut');
      },
    };
  }

  it('logs out Facebook before Firebase signOut', async () => {
    const calls: string[] = [];
    await runContractualAndroidLogout(
      logoutDeps(calls, () => {
        calls.push('facebookLogOut');
      }),
    );
    assert.deepEqual(calls, [
      'clearPrefill',
      'stopBackground',
      'facebookLogOut',
      'firebaseSignOut',
    ]);
  });

  it('is idempotent: a failing / repeated Facebook logout never blocks Firebase signOut', async () => {
    const calls: string[] = [];
    const failing = () => {
      calls.push('facebookLogOut');
      throw new Error('native session already gone');
    };
    await runContractualAndroidLogout(logoutDeps(calls, failing));
    await runContractualAndroidLogout(logoutDeps(calls, failing));
    assert.equal(calls.filter((c) => c === 'firebaseSignOut').length, 2);
  });

  it('non-Facebook callers (no provider step) keep the previous sequence', async () => {
    const calls: string[] = [];
    await runContractualAndroidLogout(logoutDeps(calls));
    assert.deepEqual(calls, ['clearPrefill', 'stopBackground', 'firebaseSignOut']);
  });
});

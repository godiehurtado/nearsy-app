/**
 * Facebook Login journey on Android Welcome / Login (2.0.7): account-exists
 * copy, routing and failure handling. Injected deps only.
 * Run: node --experimental-strip-types --test packages/shared/src/authentication/facebook/__tests__/facebookSignInFlow.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  FacebookAuthenticationError,
  createAuthenticateWithFacebook,
  type AuthenticateWithFacebookDeps,
} from '../facebookAuthCore.ts';
import {
  resolveFacebookSignInAlert,
  runFacebookSignIn,
  type FacebookSignInFlowDeps,
} from '../facebookSignInFlow.ts';
import { authenticationTranslations } from '../../../i18n/resources/authentication.ts';

const here = dirname(fileURLToPath(import.meta.url));
const sharedSrc = join(here, '../../..');

const FACEBOOK_TITLE = 'authentication.login.social.facebook';
const GENERIC_KEY = 'authentication.social.facebook.errors.generic';
const CANCELLED_KEY = 'authentication.social.facebook.errors.cancelled';
const EXISTS_TITLE = 'authentication.social.facebook.errors.accountExistsTitle';
const EXISTS_KEY = 'authentication.social.facebook.errors.accountExists';

type Calls = { getUserProfile: number; isProfileComplete: number };

function firebaseFailure(code: string) {
  return Object.assign(new Error('firebase failure'), { code });
}

function authenticateFailingWith(
  code: string,
  extra: Partial<AuthenticateWithFacebookDeps> = {},
) {
  return createAuthenticateWithFacebook({
    isConfigured: () => true,
    requestAccessToken: async () => ({ accessToken: 'fb-access-token' }),
    signInWithAccessToken: async () => {
      throw firebaseFailure(code);
    },
    ...extra,
  });
}

function flowDeps(
  authenticate: FacebookSignInFlowDeps['authenticate'],
  calls: Calls,
  profile: { exists: boolean; complete: boolean } = {
    exists: true,
    complete: true,
  },
): FacebookSignInFlowDeps {
  return {
    authenticate,
    getUserProfile: async () => {
      calls.getUserProfile += 1;
      return profile.exists ? { uid: 'firebase-uid-1' } : null;
    },
    isProfileComplete: async () => {
      calls.isProfileComplete += 1;
      return profile.complete;
    },
  };
}

function newCalls(): Calls {
  return { getUserProfile: 0, isProfileComplete: 0 };
}

describe('Facebook account-exists copy (EN/ES)', () => {
  it('uses the contractual title and message in English and Spanish', () => {
    const en = authenticationTranslations.en.social.facebook.errors;
    const es = authenticationTranslations.es.social.facebook.errors;
    assert.equal(en.accountExistsTitle, 'Account already exists');
    assert.equal(
      en.accountExists,
      'A Nearsy account already exists with this email. Sign in using the method you originally used.',
    );
    assert.equal(es.accountExistsTitle, 'Cuenta existente');
    assert.equal(
      es.accountExists,
      'Ya existe una cuenta de Nearsy asociada a este correo. Inicia sesión utilizando el método que usaste originalmente.',
    );
  });

  it('keeps the existing generic and canceled copy unchanged', () => {
    const en = authenticationTranslations.en.social.facebook.errors;
    const es = authenticationTranslations.es.social.facebook.errors;
    assert.equal(en.generic, 'We couldn’t sign you in with Facebook. Please try again.');
    assert.equal(en.cancelled, 'Facebook sign-in was canceled.');
    assert.equal(es.generic, 'No pudimos iniciar sesión con Facebook. Inténtalo nuevamente.');
    assert.equal(es.cancelled, 'Se canceló el inicio de sesión con Facebook.');
  });

  it('does not reveal which provider owns the existing account', () => {
    for (const lang of ['en', 'es'] as const) {
      const { accountExistsTitle, accountExists } =
        authenticationTranslations[lang].social.facebook.errors;
      assert.doesNotMatch(
        `${accountExistsTitle} ${accountExists}`,
        /google|linkedin|apple|password|contraseña|teléfono|phone/i,
      );
    }
  });
});

describe('runFacebookSignIn — account exists with different credential', () => {
  it('shows the account-exists alert, never routes and never reads or creates a profile', async () => {
    const calls = newCalls();
    let discarded = 0;
    const commits: string[] = [];
    const authenticate = authenticateFailingWith(
      'auth/account-exists-with-different-credential',
      {
        discardProviderSession: () => {
          discarded += 1;
        },
        commitPrefill: (uid) => {
          commits.push(uid);
        },
      },
    );

    const outcome = await runFacebookSignIn(flowDeps(authenticate, calls));

    assert.deepEqual(outcome, {
      kind: 'alert',
      alert: { titleKey: EXISTS_TITLE, messageKey: EXISTS_KEY },
    });
    assert.deepEqual(calls, { getUserProfile: 0, isProfileComplete: 0 });
    assert.deepEqual(commits, []);
    assert.equal(discarded, 1);
  });

  it('exposes no linking capability to the journey', () => {
    const deps = flowDeps(async () => ({ uid: 'u', email: null }), newCalls());
    assert.equal('linkWithCredential' in deps, false);
    const sources = [
      'authentication/facebook/facebookAuthCore.ts',
      'authentication/facebook/facebookSignInFlow.ts',
      'hooks/useFacebookSignInFlow.android.ts',
      'services/facebookSession.android.ts',
      'services/firebaseFacebookAuth.android.ts',
    ].map((rel) => readFileSync(join(sharedSrc, rel), 'utf8'));
    for (const src of sources) {
      assert.doesNotMatch(src, /linkWithCredential|linkWithPopup|linkWithRedirect/);
    }
  });
});

describe('runFacebookSignIn — other failures keep the current copy', () => {
  it('other Firebase failures keep the Facebook title and generic message', async () => {
    for (const code of [
      'auth/credential-already-in-use',
      'auth/email-already-in-use',
      'auth/network-request-failed',
      'auth/invalid-credential',
      'auth/user-disabled',
      'auth/operation-not-allowed',
      'auth/internal-error',
    ]) {
      const calls = newCalls();
      let discarded = 0;
      const outcome = await runFacebookSignIn(
        flowDeps(
          authenticateFailingWith(code, {
            discardProviderSession: () => {
              discarded += 1;
            },
          }),
          calls,
        ),
      );
      assert.deepEqual(
        outcome,
        { kind: 'alert', alert: { titleKey: FACEBOOK_TITLE, messageKey: GENERIC_KEY } },
        code,
      );
      assert.deepEqual(calls, { getUserProfile: 0, isProfileComplete: 0 }, code);
      assert.equal(discarded, 1, code);
    }
  });

  it('cancel keeps the canceled copy under the Facebook title', async () => {
    const calls = newCalls();
    const authenticate = createAuthenticateWithFacebook({
      isConfigured: () => true,
      requestAccessToken: async () => {
        throw new FacebookAuthenticationError('CANCELLED', 'cancelled', 'SDK_LOGIN_CANCELLED');
      },
      signInWithAccessToken: async () => {
        throw new Error('must not be called');
      },
    });
    const outcome = await runFacebookSignIn(flowDeps(authenticate, calls));
    assert.deepEqual(outcome, {
      kind: 'alert',
      alert: { titleKey: FACEBOOK_TITLE, messageKey: CANCELLED_KEY },
    });
    assert.deepEqual(calls, { getUserProfile: 0, isProfileComplete: 0 });
  });

  it('a double tap stays silent and does not start a second attempt', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let sdkCalls = 0;
    const authenticate = createAuthenticateWithFacebook({
      isConfigured: () => true,
      requestAccessToken: async () => {
        sdkCalls += 1;
        await gate;
        return { accessToken: 'fb-access-token' };
      },
      signInWithAccessToken: async () => ({
        uid: 'firebase-uid-1',
        email: 'person@example.com',
        identity: {},
      }),
    });
    const calls = newCalls();
    const first = runFacebookSignIn(flowDeps(authenticate, calls));
    const second = await runFacebookSignIn(flowDeps(authenticate, calls));
    assert.deepEqual(second, { kind: 'ignored' });
    release();
    assert.deepEqual(await first, { kind: 'mainTabs' });
    assert.equal(sdkCalls, 1);
  });

  it('a non-Facebook failure after sign-in falls back to the generic copy', async () => {
    const outcome = await runFacebookSignIn({
      authenticate: async () => ({ uid: 'firebase-uid-1', email: null }),
      getUserProfile: async () => {
        throw new Error('firestore unavailable');
      },
      isProfileComplete: async () => true,
    });
    assert.deepEqual(outcome, {
      kind: 'alert',
      alert: { titleKey: FACEBOOK_TITLE, messageKey: GENERIC_KEY },
    });
  });

  it('resolveFacebookSignInAlert maps only ACCOUNT_EXISTS to the new title', () => {
    assert.deepEqual(
      resolveFacebookSignInAlert(new FacebookAuthenticationError('ACCOUNT_EXISTS', 'x')),
      { titleKey: EXISTS_TITLE, messageKey: EXISTS_KEY },
    );
    assert.deepEqual(
      resolveFacebookSignInAlert(new FacebookAuthenticationError('ACCOUNT_CONFLICT', 'x')),
      { titleKey: FACEBOOK_TITLE, messageKey: GENERIC_KEY },
    );
    assert.equal(
      resolveFacebookSignInAlert(new FacebookAuthenticationError('OPERATION_IN_PROGRESS', 'x')),
      null,
    );
    assert.deepEqual(resolveFacebookSignInAlert(new Error('boom')), {
      titleKey: FACEBOOK_TITLE,
      messageKey: GENERIC_KEY,
    });
  });
});

describe('runFacebookSignIn — successful routing unchanged', () => {
  it('complete profile → MainTabs', async () => {
    const calls = newCalls();
    const outcome = await runFacebookSignIn(
      flowDeps(async () => ({ uid: 'firebase-uid-1', email: 'a@example.com' }), calls),
    );
    assert.deepEqual(outcome, { kind: 'mainTabs' });
    assert.deepEqual(calls, { getUserProfile: 1, isProfileComplete: 1 });
  });

  it('incomplete profile → ProfileCompletion with uid and email', async () => {
    const outcome = await runFacebookSignIn(
      flowDeps(
        async () => ({ uid: 'firebase-uid-1', email: 'a@example.com' }),
        newCalls(),
        { exists: true, complete: false },
      ),
    );
    assert.deepEqual(outcome, {
      kind: 'profileCompletion',
      uid: 'firebase-uid-1',
      email: 'a@example.com',
    });
  });

  it('no profile yet → ProfileCompletion without checking completeness; null email → empty', async () => {
    const calls = newCalls();
    const outcome = await runFacebookSignIn(
      flowDeps(async () => ({ uid: 'firebase-uid-1', email: null }), calls, {
        exists: false,
        complete: false,
      }),
    );
    assert.deepEqual(outcome, {
      kind: 'profileCompletion',
      uid: 'firebase-uid-1',
      email: '',
    });
    assert.deepEqual(calls, { getUserProfile: 1, isProfileComplete: 0 });
  });
});

describe('useFacebookSignInFlow (Android) wiring', () => {
  const hookSrc = readFileSync(
    join(sharedSrc, 'hooks/useFacebookSignInFlow.android.ts'),
    'utf8',
  );

  it('delegates to runFacebookSignIn and alerts with the resolved title and message', () => {
    assert.match(hookSrc, /runFacebookSignIn\(/);
    assert.match(hookSrc, /t\(outcome\.alert\.titleKey as any\)/);
    assert.match(hookSrc, /t\(outcome\.alert\.messageKey as any\)/);
    assert.match(hookSrc, /case 'ignored':\s*return;/);
  });

  it('keeps the submitting guard and routes only on success outcomes', () => {
    assert.match(hookSrc, /if \(submittingRef\.current\) return;/);
    const alertCase = hookSrc.slice(
      hookSrc.indexOf("case 'alert':"),
      hookSrc.indexOf("case 'mainTabs':"),
    );
    assert.doesNotMatch(alertCase, /navigation\./);
    assert.match(hookSrc, /routes: \[\{ name: 'MainTabs' \}\]/);
    assert.match(hookSrc, /name: 'ProfileCompletion'/);
  });

  it('Welcome and Login keep using the shared hook', () => {
    for (const rel of ['screens/WelcomeScreen.tsx', 'screens/LoginScreen.tsx']) {
      const src = readFileSync(join(sharedSrc, rel), 'utf8');
      assert.match(src, /useFacebookSignInFlow\(\)/, rel);
      assert.match(src, /signInWithFacebook\(\)/, rel);
    }
  });
});

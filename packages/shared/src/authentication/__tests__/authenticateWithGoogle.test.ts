/**
 * Behavior tests for authenticateWithGoogle (TS-007).
 *
 * Uses injected deps so Node can run without loading Google SDK / RNFirebase.
 * Run: node --experimental-strip-types --test packages/shared/src/authentication/__tests__/authenticateWithGoogle.test.ts
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createAuthenticateWithGoogle,
  GoogleAuthenticationError,
  type GoogleAuthenticationResult,
} from '../authenticateWithGoogle.ts';

function createSuccessResult(
  overrides: Partial<GoogleAuthenticationResult> = {},
): GoogleAuthenticationResult {
  return {
    uid: 'firebase-uid-1',
    email: 'user@example.com',
    ...overrides,
  };
}

function foundationError(code: string, message: string): Error {
  return Object.assign(new Error(message), {
    name: 'GoogleAuthFoundationError',
    code,
  });
}

function firebaseAdapterError(
  code: string,
  message: string,
  firebaseCode?: string,
): Error {
  return Object.assign(new Error(message), {
    name: 'FirebaseGoogleAuthError',
    code,
    firebaseCode,
  });
}

describe('authenticateWithGoogle', () => {
  it('maps cancellation without treating it as a generic failure', async () => {
    const authenticate = createAuthenticateWithGoogle({
      requestIdToken: async () => {
        throw foundationError(
          'SIGN_IN_CANCELLED',
          'Google sign-in was cancelled.',
        );
      },
      signInWithIdToken: async () => createSuccessResult(),
    });

    await assert.rejects(
      () => authenticate(),
      (err: unknown) =>
        err instanceof GoogleAuthenticationError && err.code === 'CANCELLED',
    );
  });

  it('guards against concurrent execution', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const authenticate = createAuthenticateWithGoogle({
      requestIdToken: async () => {
        await gate;
        return { idToken: 'id-token' };
      },
      signInWithIdToken: async () => createSuccessResult(),
    });

    const first = authenticate();
    await assert.rejects(
      () => authenticate(),
      (err: unknown) =>
        err instanceof GoogleAuthenticationError &&
        err.code === 'OPERATION_IN_PROGRESS',
    );

    release();
    const result = await first;
    assert.equal(result.uid, 'firebase-uid-1');
  });

  it('maps provider unavailable errors', async () => {
    const authenticate = createAuthenticateWithGoogle({
      requestIdToken: async () => {
        throw foundationError(
          'PLAY_SERVICES_UNAVAILABLE',
          'Play Services unavailable.',
        );
      },
      signInWithIdToken: async () => createSuccessResult(),
    });

    await assert.rejects(
      () => authenticate(),
      (err: unknown) =>
        err instanceof GoogleAuthenticationError &&
        err.code === 'PROVIDER_UNAVAILABLE',
    );
  });

  it('maps missing Web Client ID as configuration error', async () => {
    const authenticate = createAuthenticateWithGoogle({
      requestIdToken: async () => {
        throw foundationError(
          'MISSING_WEB_CLIENT_ID',
          'Missing EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID.',
        );
      },
      signInWithIdToken: async () => createSuccessResult(),
    });

    await assert.rejects(
      () => authenticate(),
      (err: unknown) =>
        err instanceof GoogleAuthenticationError &&
        err.code === 'CONFIGURATION_ERROR',
    );
  });

  it('rejects when ID token is missing', async () => {
    const authenticate = createAuthenticateWithGoogle({
      requestIdToken: async () => ({ idToken: '   ' }),
      signInWithIdToken: async () => createSuccessResult(),
    });

    await assert.rejects(
      () => authenticate(),
      (err: unknown) =>
        err instanceof GoogleAuthenticationError &&
        err.code === 'INVALID_CREDENTIAL' &&
        err.diagnosticCode === 'ID_TOKEN_MISSING',
    );
  });

  it('returns minimal authenticated result on Firebase success', async () => {
    let capturedToken: string | undefined;
    const authenticate = createAuthenticateWithGoogle({
      requestIdToken: async () => ({ idToken: 'provider-id-token' }),
      signInWithIdToken: async (idToken) => {
        capturedToken = idToken;
        return createSuccessResult({
          uid: 'uid-42',
          email: 'a@b.com',
        });
      },
    });

    const result = await authenticate();

    assert.equal(capturedToken, 'provider-id-token');
    assert.equal(result.uid, 'uid-42');
    assert.equal(result.email, 'a@b.com');
    assert.equal(
      Object.prototype.hasOwnProperty.call(result, 'idToken'),
      false,
    );
  });

  it('maps Firebase network failure', async () => {
    const authenticate = createAuthenticateWithGoogle({
      requestIdToken: async () => ({ idToken: 'id-token' }),
      signInWithIdToken: async () => {
        throw firebaseAdapterError(
          'NETWORK_ERROR',
          'Network error',
          'auth/network-request-failed',
        );
      },
    });

    await assert.rejects(
      () => authenticate(),
      (err: unknown) =>
        err instanceof GoogleAuthenticationError && err.code === 'NETWORK_ERROR',
    );
  });

  it('maps Firebase invalid credential', async () => {
    const authenticate = createAuthenticateWithGoogle({
      requestIdToken: async () => ({ idToken: 'id-token' }),
      signInWithIdToken: async () => {
        throw firebaseAdapterError(
          'INVALID_CREDENTIAL',
          'Invalid credential',
          'auth/invalid-credential',
        );
      },
    });

    await assert.rejects(
      () => authenticate(),
      (err: unknown) =>
        err instanceof GoogleAuthenticationError &&
        err.code === 'INVALID_CREDENTIAL',
    );
  });

  it('maps Firebase user disabled', async () => {
    const authenticate = createAuthenticateWithGoogle({
      requestIdToken: async () => ({ idToken: 'id-token' }),
      signInWithIdToken: async () => {
        throw firebaseAdapterError(
          'USER_DISABLED',
          'User disabled',
          'auth/user-disabled',
        );
      },
    });

    await assert.rejects(
      () => authenticate(),
      (err: unknown) =>
        err instanceof GoogleAuthenticationError && err.code === 'USER_DISABLED',
    );
  });

  it('releases the in-progress guard after error', async () => {
    let failOnce = true;
    const authenticate = createAuthenticateWithGoogle({
      requestIdToken: async () => {
        if (failOnce) {
          failOnce = false;
          throw foundationError('SIGN_IN_FAILED', 'Google sign-in failed.');
        }
        return { idToken: 'id-token' };
      },
      signInWithIdToken: async () => createSuccessResult(),
    });

    await assert.rejects(() => authenticate());
    const result = await authenticate();
    assert.equal(result.uid, 'firebase-uid-1');
  });

  it('releases the in-progress guard after cancellation', async () => {
    let cancelOnce = true;
    const authenticate = createAuthenticateWithGoogle({
      requestIdToken: async () => {
        if (cancelOnce) {
          cancelOnce = false;
          throw foundationError(
            'SIGN_IN_CANCELLED',
            'Google sign-in was cancelled.',
          );
        }
        return { idToken: 'id-token' };
      },
      signInWithIdToken: async () =>
        createSuccessResult({ uid: 'after-cancel' }),
    });

    await assert.rejects(
      () => authenticate(),
      (err: unknown) =>
        err instanceof GoogleAuthenticationError && err.code === 'CANCELLED',
    );

    const result = await authenticate();
    assert.equal(result.uid, 'after-cancel');
  });

  it('does not return the ID token to callers', async () => {
    const authenticate = createAuthenticateWithGoogle({
      requestIdToken: async () => ({ idToken: 'secret-token-value' }),
      signInWithIdToken: async () => createSuccessResult(),
    });

    const result = await authenticate();
    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes('secret-token-value'), false);
    assert.deepEqual(Object.keys(result).sort(), ['email', 'uid']);
  });
});

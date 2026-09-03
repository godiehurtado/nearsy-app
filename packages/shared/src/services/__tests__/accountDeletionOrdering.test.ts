import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  deleteAccountAndData,
  type AccountDeletionRuntime,
  type AccountDeletionStep,
} from '../accountDeletion';
import { resolveAccountDeletionErrorMessageKey } from '../accountDeletionErrorPresentation';

function createRecordingRuntime(
  overrides: Partial<AccountDeletionRuntime> = {},
): {
  runtime: AccountDeletionRuntime;
  stepsFromRuntime: string[];
} {
  const stepsFromRuntime: string[] = [];
  const runtime: AccountDeletionRuntime = {
    getCurrentUser: () => ({
      uid: 'uid-qa',
      email: 'g@test.com',
      delete: async () => {
        stepsFromRuntime.push('auth-delete-executed');
      },
    }),
    deleteContactHashes: async () => {
      stepsFromRuntime.push('cleanup-firestore-contactHashes');
    },
    deleteUserStorage: async () => {
      stepsFromRuntime.push('cleanup-storage-users');
    },
    deleteUserDocument: async () => {
      stepsFromRuntime.push('cleanup-firestore-user-doc');
    },
    ...overrides,
  };
  return { runtime, stepsFromRuntime };
}

describe('deleteAccountAndData ordering', () => {
  it('cleans Firestore/Storage while authenticated before Auth delete', async () => {
    const { runtime, stepsFromRuntime } = createRecordingRuntime();
    const observed: AccountDeletionStep[] = [];

    await deleteAccountAndData(undefined, runtime, (step) => {
      observed.push(step);
    });

    assert.deepEqual(observed, [
      'cleanup-firestore-contactHashes',
      'cleanup-storage-users',
      'cleanup-firestore-user-doc',
      'auth-delete',
    ]);
    assert.deepEqual(stepsFromRuntime, [
      'cleanup-firestore-contactHashes',
      'cleanup-storage-users',
      'cleanup-firestore-user-doc',
      'auth-delete-executed',
    ]);
  });

  it('does not run Firestore cleanup after Auth has already been deleted', async () => {
    const order: string[] = [];
    let authDeleted = false;

    const runtime: AccountDeletionRuntime = {
      getCurrentUser: () => ({
        uid: 'uid-qa',
        delete: async () => {
          authDeleted = true;
          order.push('auth-delete');
        },
      }),
      deleteContactHashes: async () => {
        assert.equal(authDeleted, false, 'contactHashes must run before auth delete');
        order.push('contactHashes');
      },
      deleteUserStorage: async () => {
        assert.equal(authDeleted, false, 'storage must run before auth delete');
        order.push('storage');
      },
      deleteUserDocument: async () => {
        assert.equal(authDeleted, false, 'user doc must run before auth delete');
        order.push('userDoc');
      },
    };

    await deleteAccountAndData(undefined, runtime);
    assert.deepEqual(order, ['contactHashes', 'storage', 'userDoc', 'auth-delete']);
    assert.equal(authDeleted, true);
  });

  it('preserves requires-recent-login after cleanup so UI can reauth and retry', async () => {
    const { runtime, stepsFromRuntime } = createRecordingRuntime({
      getCurrentUser: () => ({
        uid: 'uid-qa',
        delete: async () => {
          stepsFromRuntime.push('auth-delete-attempt');
          const err = new Error('recent') as Error & { code: string };
          err.code = 'auth/requires-recent-login';
          throw err;
        },
      }),
    });

    await assert.rejects(
      () => deleteAccountAndData(undefined, runtime),
      (err: unknown) =>
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code: string }).code === 'auth/requires-recent-login',
    );

    assert.deepEqual(stepsFromRuntime, [
      'cleanup-firestore-contactHashes',
      'cleanup-storage-users',
      'cleanup-firestore-user-doc',
      'auth-delete-attempt',
    ]);
  });
});

describe('resolveAccountDeletionErrorMessageKey', () => {
  it('maps permission-denied / insufficient permissions to localized key', () => {
    assert.equal(
      resolveAccountDeletionErrorMessageKey({
        code: 'permission-denied',
        message: 'Missing or insufficient permissions.',
      }),
      'settings.deleteAccount.permissionError',
    );
    assert.equal(
      resolveAccountDeletionErrorMessageKey({
        message: 'Missing or insufficient permissions.',
      }),
      'settings.deleteAccount.permissionError',
    );
  });
});

/**
 * Account deletion orchestration.
 * Firebase SDK is loaded only inside the default runtime so Node tests stay RN-free.
 */

import {
  beginAccountDeletionSession,
  endAccountDeletionSession,
} from './accountDeletionSession';

/** Ordered steps for account deletion (testable). */
export type AccountDeletionStep =
  | 'cleanup-firestore-contactHashes'
  | 'cleanup-storage-users'
  | 'cleanup-firestore-user-doc'
  | 'auth-delete';

export type AccountDeletionRuntime = {
  getCurrentUser: () => {
    uid: string;
    email?: string | null;
    delete: () => Promise<void>;
  } | null;
  reauthenticateWithPasswordCredential?: (
    email: string,
    password: string,
  ) => Promise<void>;
  deleteContactHashes: (uid: string) => Promise<void>;
  deleteUserStorage: (uid: string) => Promise<void>;
  deleteUserDocument: (uid: string) => Promise<void>;
};

function isRequiresRecentLogin(err: any) {
  const code = err?.code || err?.message || '';
  return String(code).includes('auth/requires-recent-login');
}

async function deleteFirestoreSubcollection(
  firestoreDb: any,
  firestore: {
    collection: typeof import('firebase/firestore').collection;
    getDocs: typeof import('firebase/firestore').getDocs;
    writeBatch: typeof import('firebase/firestore').writeBatch;
  },
  uid: string,
  sub: string,
) {
  const colRef = firestore.collection(firestoreDb, 'users', uid, sub);
  const snap = await firestore.getDocs(colRef);
  if (snap.empty) return;

  let batch = firestore.writeBatch(firestoreDb);
  let ops = 0;

  for (const d of snap.docs) {
    batch.delete(d.ref);
    ops++;
    if (ops >= 450) {
      await batch.commit();
      batch = firestore.writeBatch(firestoreDb);
      ops = 0;
    }
  }
  if (ops > 0) await batch.commit();
}

async function deleteStorageFolderRecursive(
  storageApi: {
    getStorage: typeof import('firebase/storage').getStorage;
    listAll: typeof import('firebase/storage').listAll;
    ref: typeof import('firebase/storage').ref;
    deleteObject: typeof import('firebase/storage').deleteObject;
  },
  path: string,
) {
  const storage = storageApi.getStorage();
  const root = storageApi.ref(storage, path);
  const res = await storageApi.listAll(root);

  await Promise.all(res.items.map((item) => storageApi.deleteObject(item)));
  for (const prefix of res.prefixes) {
    await deleteStorageFolderRecursive(storageApi, prefix.fullPath);
  }
}

/**
 * Default runtime — Firestore/Storage cleanup while authenticated, Auth last.
 *
 * Why this order:
 * - `user.delete()` clears Auth → subsequent owner Rules checks see request.auth == null
 * - Owner Firestore/Storage deletes require an authenticated session
 * - `auth/requires-recent-login` only applies to Auth delete; cleanup remains retry-safe
 */
export function createDefaultAccountDeletionRuntime(): AccountDeletionRuntime {
  // Lazy requires keep Node unit tests free of RN Firebase config.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { firebaseAuth, firestoreDb } = require('../config/firebaseConfig') as {
    firebaseAuth: {
      currentUser: {
        uid: string;
        email?: string | null;
        delete: () => Promise<void>;
      } | null;
    };
    firestoreDb: unknown;
  };
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const firestore = require('firebase/firestore') as typeof import('firebase/firestore');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const storageApi = require('firebase/storage') as typeof import('firebase/storage');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const authApi = require('firebase/auth') as typeof import('firebase/auth');

  return {
    getCurrentUser: () => {
      const user = firebaseAuth.currentUser;
      if (!user) return null;
      return {
        uid: user.uid,
        email: user.email,
        delete: () => user.delete(),
      };
    },
    reauthenticateWithPasswordCredential: async (email, password) => {
      const user = firebaseAuth.currentUser;
      if (!user) throw new Error('Not authenticated.');
      const cred = authApi.EmailAuthProvider.credential(email, password);
      await authApi.reauthenticateWithCredential(user as any, cred);
    },
    deleteContactHashes: (uid) =>
      deleteFirestoreSubcollection(firestoreDb, firestore, uid, 'contactHashes'),
    deleteUserStorage: (uid) =>
      deleteStorageFolderRecursive(storageApi, `users/${uid}`),
    deleteUserDocument: (uid) =>
      firestore.deleteDoc(firestore.doc(firestoreDb as any, 'users', uid)),
  };
}

/**
 * Delete account data then Auth identity.
 * Records step order when `onStep` is provided (tests).
 */
export async function deleteAccountAndData(
  options?: {
    passwordForReauth?: string;
  },
  runtime: AccountDeletionRuntime = createDefaultAccountDeletionRuntime(),
  onStep?: (step: AccountDeletionStep) => void,
) {
  const user = runtime.getCurrentUser();
  if (!user) throw new Error('Not authenticated.');

  const uid = user.uid;

  if (options?.passwordForReauth && user.email) {
    if (!runtime.reauthenticateWithPasswordCredential) {
      throw new Error('Password reauthentication is unavailable.');
    }
    await runtime.reauthenticateWithPasswordCredential(
      user.email,
      options.passwordForReauth,
    );
  }

  beginAccountDeletionSession();
  try {
    // 1–3) Owner-scoped cleanup WHILE Auth session is still valid.
    onStep?.('cleanup-firestore-contactHashes');
    await runtime.deleteContactHashes(uid);

    onStep?.('cleanup-storage-users');
    await runtime.deleteUserStorage(uid);

    onStep?.('cleanup-firestore-user-doc');
    await runtime.deleteUserDocument(uid);

    // 4) Auth identity LAST — after this, client cannot use owner Rules.
    onStep?.('auth-delete');
    await user.delete();
    // Session flag stays active until finalizePostAccountDeletionSession.
  } catch (err: any) {
    if (isRequiresRecentLogin(err)) {
      // Keep session active through reauth UI so AppNavigator does not remount
      // into CompleteProfile after users/{uid} was already removed.
      throw err;
    }
    endAccountDeletionSession();
    throw err;
  }
}

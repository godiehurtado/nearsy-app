// Android account deletion backed by RNFirebase Auth/Firestore/Storage.
import auth from '@react-native-firebase/auth';
import { Platform } from 'react-native';
import {
  firebaseAuth,
  firestoreDb,
  storageWeb,
} from '../config/firebaseConfig.android';

function logFirestoreSource(functionName: string, op: string) {
  console.warn('[FirestoreSource]', {
    service: 'accountDeletion.android',
    function: functionName,
    platform: Platform.OS,
    op,
  });
}

async function deleteFirestoreSubcollection(uid: string, sub: string) {
  logFirestoreSource('deleteFirestoreSubcollection', 'collection/doc/collection');
  const colRef = (firestoreDb as any).collection('users').doc(uid).collection(sub);
  logFirestoreSource('deleteFirestoreSubcollection', 'get');
  const snap = await colRef.get();

  if (snap.empty) return;

  let batch = (firestoreDb as any).batch();
  let ops = 0;

  for (const d of snap.docs ?? []) {
    batch.delete(d.ref);
    ops++;

    if (ops >= 450) {
      await batch.commit();
      batch = (firestoreDb as any).batch();
      ops = 0;
    }
  }

  if (ops > 0) await batch.commit();
}

async function deleteStorageFolderRecursive(path: string) {
  const root = (storageWeb as any).ref(path);
  const res = await root.listAll();

  await Promise.all((res.items ?? []).map((item: any) => item.delete()));

  for (const prefix of res.prefixes ?? []) {
    await deleteStorageFolderRecursive(prefix.fullPath);
  }
}

function isRequiresRecentLogin(err: any) {
  const code = err?.code || err?.message || '';
  return String(code).includes('auth/requires-recent-login');
}

export async function deleteAccountAndData(options?: {
  passwordForReauth?: string;
}) {
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error('Not authenticated.');

  const uid = user.uid;

  if (options?.passwordForReauth && user.email) {
    const cred = auth.EmailAuthProvider.credential(
      user.email,
      options.passwordForReauth,
    );
    await user.reauthenticateWithCredential(cred);
  }

  try {
    await user.delete();
  } catch (err: any) {
    if (isRequiresRecentLogin(err)) {
      throw err;
    }
    throw err;
  }

  await deleteFirestoreSubcollection(uid, 'contactHashes');
  await deleteStorageFolderRecursive(`users/${uid}`);
  logFirestoreSource('deleteAccountAndData', 'collection/doc/delete');
  await (firestoreDb as any).collection('users').doc(uid).delete();
}

// src/services/accountDeletion.ts
import { firebaseAuth, firestoreDb } from '../config/firebaseConfig';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  writeBatch,
} from 'firebase/firestore';
import { EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import {
  getStorage,
  listAll,
  ref as storageRef,
  deleteObject,
} from 'firebase/storage';

async function deleteFirestoreSubcollection(uid: string, sub: string) {
  const colRef = collection(firestoreDb, 'users', uid, sub);
  const snap = await getDocs(colRef);
  if (snap.empty) return;

  let batch = writeBatch(firestoreDb);
  let ops = 0;

  for (const d of snap.docs) {
    batch.delete(d.ref);
    ops++;
    if (ops >= 450) {
      await batch.commit();
      batch = writeBatch(firestoreDb);
      ops = 0;
    }
  }
  if (ops > 0) await batch.commit();
}

async function deleteStorageFolderRecursive(path: string) {
  const storage = getStorage();
  const root = storageRef(storage, path);
  const res = await listAll(root);

  await Promise.all(res.items.map((item) => deleteObject(item)));
  for (const prefix of res.prefixes) {
    await deleteStorageFolderRecursive(prefix.fullPath);
  }
}

function isRequiresRecentLogin(err: any) {
  const code = err?.code || err?.message || '';
  return String(code).includes('auth/requires-recent-login');
}

/**
 * ✅ SAFE deletion:
 * - Primero garantiza "recent login" intentando borrar el usuario.
 * - Si falla por recent login, NO borra datos.
 * - Si pasa, borra datos (Firestore + Storage).
 */
export async function deleteAccountAndData(options?: {
  passwordForReauth?: string;
}) {
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error('Not authenticated.');

  const uid = user.uid;

  // (Opcional) Reauth upfront si ya tienes password (mejor UX)
  if (options?.passwordForReauth && user.email) {
    const cred = EmailAuthProvider.credential(
      user.email,
      options.passwordForReauth,
    );
    await reauthenticateWithCredential(user as any, cred);
  }

  // ✅ 1) Auth FIRST
  try {
    await (user as any).delete();
  } catch (err: any) {
    if (isRequiresRecentLogin(err)) {
      // No tocamos Firestore/Storage
      throw err;
    }
    throw err;
  }

  // ✅ 2) Data cleanup AFTER auth delete succeeded
  // (Ojo: después de borrar el user, currentUser puede quedar null. Usa uid capturado.)
  await deleteFirestoreSubcollection(uid, 'contactHashes');
  await deleteStorageFolderRecursive(`users/${uid}`);
  await deleteDoc(doc(firestoreDb, 'users', uid));
}

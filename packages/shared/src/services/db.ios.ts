// packages/shared/src/services/db.ios.ts
import { firestoreDb } from '../config/firebaseConfig';
import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  collection,
  query,
  where,
  limit as qLimit,
  getDocs,
} from 'firebase/firestore';

export async function dbGetUser(uid: string) {
  const ref = doc(firestoreDb, 'users', uid);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}

export async function dbSetUserMerge(uid: string, data: any) {
  const ref = doc(firestoreDb, 'users', uid);
  await setDoc(ref, data, { merge: true });
}

export function dbOnUserSnapshot(
  uid: string,
  onData: (d: any | null) => void,
  onErr?: (e: any) => void,
) {
  const ref = doc(firestoreDb, 'users', uid);
  return onSnapshot(
    ref,
    (snap) => onData(snap.exists() ? snap.data() : null),
    (err) => onErr?.(err),
  );
}

export async function dbQueryVisibleUsers(limit = 300) {
  const q = query(
    collection(firestoreDb, 'users'),
    where('visibility', '==', true),
    qLimit(limit),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function dbGetContactHashes(uid: string): Promise<string[]> {
  const colRef = collection(firestoreDb, 'users', uid, 'contactHashes');
  const snap = await getDocs(
    colRef,
  );

  const out: string[] = [];

  snap.forEach((d) => {
    const data = d.data() as { hash?: string };
    if (typeof data.hash === 'string' && data.hash) {
      out.push(data.hash);
    }
  });

  return out;
}

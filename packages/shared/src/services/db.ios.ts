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
  const snap = await getDoc(doc(firestoreDb, 'users', uid));
  return snap.exists() ? snap.data() : null;
}

export async function dbSetUserMerge(uid: string, data: any) {
  await setDoc(doc(firestoreDb, 'users', uid), data, { merge: true });
}

export function dbOnUserSnapshot(
  uid: string,
  onData: (d: any | null) => void,
  onErr?: (e: any) => void,
) {
  return onSnapshot(
    doc(firestoreDb, 'users', uid),
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
  const snap = await getDocs(
    collection(firestoreDb, 'users', uid, 'contactHashes'),
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

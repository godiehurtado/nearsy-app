// packages/shared/src/services/db.ios.ts
import { Platform } from 'react-native';
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

function logFirestoreSource(functionName: string, op: string) {
  console.warn('[FirestoreSource]', {
    service: 'db.ios',
    function: functionName,
    platform: Platform.OS,
    op,
  });
}

export async function dbGetUser(uid: string) {
  logFirestoreSource('dbGetUser', 'doc');
  const ref = doc(firestoreDb, 'users', uid);
  logFirestoreSource('dbGetUser', 'getDoc');
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}

export async function dbSetUserMerge(uid: string, data: any) {
  logFirestoreSource('dbSetUserMerge', 'doc');
  const ref = doc(firestoreDb, 'users', uid);
  logFirestoreSource('dbSetUserMerge', 'setDoc');
  await setDoc(ref, data, { merge: true });
}

export function dbOnUserSnapshot(
  uid: string,
  onData: (d: any | null) => void,
  onErr?: (e: any) => void,
) {
  logFirestoreSource('dbOnUserSnapshot', 'doc');
  const ref = doc(firestoreDb, 'users', uid);
  return onSnapshot(
    ref,
    (snap) => onData(snap.exists() ? snap.data() : null),
    (err) => onErr?.(err),
  );
}

export async function dbQueryVisibleUsers(limit = 300) {
  logFirestoreSource('dbQueryVisibleUsers', 'collection');
  const q = query(
    collection(firestoreDb, 'users'),
    where('visibility', '==', true),
    qLimit(limit),
  );
  logFirestoreSource('dbQueryVisibleUsers', 'getDocs');
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function dbGetContactHashes(uid: string): Promise<string[]> {
  logFirestoreSource('dbGetContactHashes', 'collection');
  const colRef = collection(firestoreDb, 'users', uid, 'contactHashes');
  logFirestoreSource('dbGetContactHashes', 'getDocs');
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

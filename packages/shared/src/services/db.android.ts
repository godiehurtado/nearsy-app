// packages/shared/src/services/db.android.ts
import type { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import { firestoreDb } from '../config/firebaseConfig';

type DocSnap = FirebaseFirestoreTypes.DocumentSnapshot;
type QueryDocSnap = FirebaseFirestoreTypes.QueryDocumentSnapshot;
type SnapErr = unknown;

export async function dbGetUser(uid: string) {
  const snap = await firestoreDb.collection('users').doc(uid).get();
  return snap.exists ? snap.data() : null;
}

export async function dbSetUserMerge(uid: string, data: any) {
  await firestoreDb.collection('users').doc(uid).set(data, { merge: true });
}

export function dbOnUserSnapshot(
  uid: string,
  onData: (d: any | null) => void,
  onErr?: (e: SnapErr) => void,
) {
  return firestoreDb
    .collection('users')
    .doc(uid)
    .onSnapshot(
      (snap: DocSnap) => onData(snap.exists() ? snap.data() : null),
      (err: SnapErr) => onErr?.(err as unknown),
    );
}

export async function dbQueryVisibleUsers(limit = 300) {
  const snap = await firestoreDb
    .collection('users')
    .where('visibility', '==', true)
    .limit(limit)
    .get();

  const out: any[] = [];
  snap.forEach((d: QueryDocSnap) => out.push({ id: d.id, ...d.data() }));
  return out;
}

export async function dbGetContactHashes(uid: string): Promise<string[]> {
  const snap = await firestoreDb
    .collection('users')
    .doc(uid)
    .collection('contactHashes')
    .get();

  const out: string[] = [];
  snap.forEach((d: QueryDocSnap) => {
    const data = d.data() as { hash?: string };
    if (typeof data.hash === 'string' && data.hash) out.push(data.hash);
  });
  return out;
}

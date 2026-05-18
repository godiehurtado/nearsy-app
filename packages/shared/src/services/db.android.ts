// packages/shared/src/services/db.android.ts
import firestore, {
  type FirebaseFirestoreTypes,
} from '@react-native-firebase/firestore';
import { firestoreDb } from '../config/firebaseConfig.android';

type DocSnap = FirebaseFirestoreTypes.DocumentSnapshot;
type QueryDocSnap = FirebaseFirestoreTypes.QueryDocumentSnapshot;
type SnapErr = unknown;

function snapshotExists(snap: DocSnap) {
  const exists = (snap as any).exists;
  return typeof exists === 'function' ? exists.call(snap) : !!exists;
}

export async function dbGetUser(uid: string) {
  const snap = await firestoreDb.collection('users').doc(uid).get();
  return snapshotExists(snap) ? snap.data() : null;
}

export async function dbSetUserMerge(uid: string, data: any) {
  await firestoreDb.collection('users').doc(uid).set(data, { merge: true });
}

export function dbOnUserSnapshot(
  uid: string,
  onData: (d: any | null) => void,
  onErr?: (e: SnapErr) => void,
) {
  const rnFirestore = firestore();
  const userRef = rnFirestore.collection('users').doc(uid);

  return userRef.onSnapshot(
    (snap: DocSnap) => onData(snapshotExists(snap) ? snap.data() : null),
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

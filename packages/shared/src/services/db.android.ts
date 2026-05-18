// packages/shared/src/services/db.android.ts
import firestore, {
  type FirebaseFirestoreTypes,
} from '@react-native-firebase/firestore';
import { Platform } from 'react-native';
import { firestoreDb } from '../config/firebaseConfig.android';

console.log('[LOADED db.android.ts]');

type DocSnap = FirebaseFirestoreTypes.DocumentSnapshot;
type QueryDocSnap = FirebaseFirestoreTypes.QueryDocumentSnapshot;
type SnapErr = unknown;

console.log('[db.android firestoreDb shape]', {
  hasCollection: typeof (firestoreDb as any)?.collection,
  keys: Object.keys((firestoreDb as any) ?? {}).slice(0, 10),
});

function snapshotExists(snap: DocSnap) {
  const exists = (snap as any).exists;
  return typeof exists === 'function' ? exists.call(snap) : !!exists;
}

function logFirestoreSource(functionName: string, op: string) {
  console.warn('[FirestoreSource]', {
    service: 'db.android',
    function: functionName,
    platform: Platform.OS,
    op,
  });
}

export async function dbGetUser(uid: string) {
  logFirestoreSource('dbGetUser', 'collection/doc/get');
  const snap = await firestoreDb.collection('users').doc(uid).get();
  return snapshotExists(snap) ? snap.data() : null;
}

export async function dbSetUserMerge(uid: string, data: any) {
  logFirestoreSource('dbSetUserMerge', 'collection/doc/set');
  await firestoreDb.collection('users').doc(uid).set(data, { merge: true });
}

export function dbOnUserSnapshot(
  uid: string,
  onData: (d: any | null) => void,
  onErr?: (e: SnapErr) => void,
) {
  logFirestoreSource('dbOnUserSnapshot', 'rnfirebase.collection/doc/onSnapshot');
  const rnFirestore = firestore();
  const userRef = rnFirestore.collection('users').doc(uid);

  return userRef.onSnapshot(
    (snap: DocSnap) => onData(snapshotExists(snap) ? snap.data() : null),
    (err: SnapErr) => onErr?.(err as unknown),
  );
}

export async function dbQueryVisibleUsers(limit = 300) {
  logFirestoreSource('dbQueryVisibleUsers', 'collection/where/limit/get');
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
  logFirestoreSource('dbGetContactHashes', 'collection/doc/collection/get');
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

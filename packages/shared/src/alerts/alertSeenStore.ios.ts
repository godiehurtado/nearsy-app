import { collection, doc, getDocs, setDoc } from 'firebase/firestore';

import { firebaseAuth, firestoreDb } from '../config/firebaseConfig';
import type { AlertSeenRecord } from './alertAppearance';
import { parseAppearanceKey } from './alertAppearance';

function seenCollection(viewerUid: string) {
  return collection(firestoreDb, 'users', viewerUid, 'alertSeen');
}

export async function loadAlertSeenMap(
  viewerUid: string,
): Promise<Record<string, AlertSeenRecord>> {
  if (!viewerUid || firebaseAuth.currentUser?.uid !== viewerUid) return {};
  try {
    const snap = await getDocs(seenCollection(viewerUid));
    const out: Record<string, AlertSeenRecord> = {};
    snap.forEach((row) => {
      const data = row.data() as Record<string, unknown> | undefined;
      const seenAt = data?.seenAt;
      if (typeof seenAt !== 'number' || !Number.isFinite(seenAt)) return;
      const appearanceKey = parseAppearanceKey(data?.appearanceKey);
      out[row.id] = appearanceKey ? { appearanceKey, seenAt } : { seenAt };
    });
    return out;
  } catch {
    return {};
  }
}

export async function writeAlertSeen(
  viewerUid: string,
  peerUid: string,
  record: AlertSeenRecord,
): Promise<void> {
  if (!viewerUid || !peerUid || firebaseAuth.currentUser?.uid !== viewerUid) {
    return;
  }
  await setDoc(
    doc(firestoreDb, 'users', viewerUid, 'alertSeen', peerUid),
    {
      seenAt: record.seenAt,
      ...(record.appearanceKey ? { appearanceKey: record.appearanceKey } : {}),
    },
    { merge: true },
  );
}

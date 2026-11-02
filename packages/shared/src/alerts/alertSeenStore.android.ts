import { firebaseAuth, firestoreDb } from '../config/firebaseConfig.android';
import type { AlertSeenRecord } from './alertAppearance.ts';
import { parseAppearanceKey } from './alertAppearance.ts';

function seenCollection(viewerUid: string) {
  return firestoreDb.collection('users').doc(viewerUid).collection('alertSeen');
}

function parseSeenMap(
  snap: { forEach: (cb: (doc: { id: string; data: () => unknown }) => void) => void },
): Record<string, AlertSeenRecord> {
  const out: Record<string, AlertSeenRecord> = {};
  snap.forEach((doc) => {
    const data = (doc.data() ?? {}) as Record<string, unknown>;
    const seenAt = data.seenAt;
    if (typeof seenAt !== 'number' || !Number.isFinite(seenAt)) return;
    const appearanceKey = parseAppearanceKey(data.appearanceKey);
    out[doc.id] = appearanceKey ? { appearanceKey, seenAt } : { seenAt };
  });
  return out;
}

export async function loadAlertSeenMap(
  viewerUid: string,
): Promise<Record<string, AlertSeenRecord>> {
  if (!viewerUid || firebaseAuth.currentUser?.uid !== viewerUid) return {};
  try {
    const snap = await seenCollection(viewerUid).get();
    return parseSeenMap(snap);
  } catch {
    return {};
  }
}

export async function writeAlertSeen(
  viewerUid: string,
  peerUid: string,
  record: AlertSeenRecord,
): Promise<void> {
  if (
    !viewerUid ||
    !peerUid ||
    firebaseAuth.currentUser?.uid !== viewerUid
  ) {
    return;
  }
  await seenCollection(viewerUid).doc(peerUid).set(
    {
      seenAt: record.seenAt,
      ...(record.appearanceKey
        ? { appearanceKey: record.appearanceKey }
        : {}),
    },
    { merge: true },
  );
}

export function subscribeAlertSeenMap(
  viewerUid: string,
  onMap: (map: Record<string, AlertSeenRecord>) => void,
): () => void {
  if (!viewerUid || firebaseAuth.currentUser?.uid !== viewerUid) {
    onMap({});
    return () => {};
  }
  const unsub = seenCollection(viewerUid).onSnapshot(
    (snap) => {
      if (firebaseAuth.currentUser?.uid !== viewerUid) {
        onMap({});
        return;
      }
      onMap(parseSeenMap(snap));
    },
    () => {
      if (firebaseAuth.currentUser?.uid !== viewerUid) return;
    },
  );
  return () => {
    unsub();
  };
}

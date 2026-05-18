// src/components/LiveLocationTracker.tsx
import { useEffect, useState } from 'react';
import { firebaseAuth, firestoreDb } from '../config/firebaseConfig';
import { useLiveLocation } from '../hooks/useLiveLocation';

type ProfileDoc = {
  visibility?: boolean; // ACTIVE/INACTIVE
};

export default function LiveLocationTracker() {
  const uid = firebaseAuth.currentUser?.uid ?? null;
  const [active, setActive] = useState(false);

  // Lee ACTIVE desde Firestore (users/{uid}.visibility)
  useEffect(() => {
    if (!uid) {
      setActive(false);
      return;
    }

    const unsub = firestoreDb
      .collection('users')
      .doc(uid)
      .onSnapshot(
      (snap) => {
        const data = (snap.data() as ProfileDoc) ?? {};
        setActive(!!data.visibility);
      },
      () => setActive(false),
    );

    return () => unsub();
  }, [uid]);

  useLiveLocation({
    enabled: !!uid && active, // ✅ solo trackea en foreground si está ACTIVE
    uid,
    distanceInterval: 1,
    timeIntervalMs: 15_000,
  });

  return null;
}

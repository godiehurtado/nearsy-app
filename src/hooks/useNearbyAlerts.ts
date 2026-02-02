// src/hooks/useNearbyAlerts.ts  ✅ RNFirebase-only
import { useCallback, useEffect, useMemo, useState } from 'react';
import { firebaseAuth, firestoreDb } from '../config/firebaseConfig';
import * as Crypto from 'expo-crypto';

const FEET_PER_METER = 3.28084;

const NEARBY_RADIUS_FT = 20;
const NEARBY_RADIUS_KM = NEARBY_RADIUS_FT / FEET_PER_METER / 1000; // ft → m → km
const LOCATION_FRESH_MS = 5 * 60 * 1000;
const AUTO_REFRESH_MS = 30 * 1000;

// ===== tipos =====
export type AlertKind = 'interest_nearby' | 'contact_nearby';

export type AlertItem = {
  id: string;
  uid?: string;
  name: string;
  avatar?: string | null;
  kind: AlertKind;
  distanceFt?: number;
  sharedInterests?: string[];
  at: number;
  fromContacts?: boolean; // ✅ si está en tus contactos (por hash)
};

type LocationDoc = { lat: number; lng: number; updatedAt?: number };

type UserDoc = {
  uid?: string;
  realName?: string;
  profileImage?: string | null;
  topBarColor?: string;
  visibility?: boolean;
  location?: LocationDoc | null;
  personalInterests?: string[];
  professionalInterests?: string[];
  mode?: 'personal' | 'professional';

  // filtros y bloqueos
  birthYear?: number;
  visibleToMinAge?: number | null;
  visibleToMaxAge?: number | null;
  blockedContacts?: string[];
  email?: string;
  phone?: string;
};

// ===== utilidades =====
function shortName(full?: string) {
  const s = (full || '').trim();
  if (!s) return 'Unnamed';
  const parts = s.split(/\s+/);
  if (parts.length === 1) return s;
  return `${parts[0]} ${parts[1][0]}.`;
}

function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
) {
  const R = 6371; // km
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);

  const c =
    sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;

  const d = 2 * Math.atan2(Math.sqrt(c), Math.sqrt(1 - c));
  return R * d;
}

function normalizeId(value?: string | null): string {
  if (!value) return '';
  return value.replace(/\s+/g, '').toLowerCase();
}

async function hashId(value: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value);
}

function isBlockedBetween(
  myEmail?: string | null,
  myPhone?: string | null,
  myBlockedContacts?: string[] | null,
  otherEmail?: string | null,
  otherPhone?: string | null,
  otherBlockedContacts?: string[] | null,
) {
  const meIds = [normalizeId(myEmail), normalizeId(myPhone)].filter(Boolean);
  const otherIds = [normalizeId(otherEmail), normalizeId(otherPhone)].filter(
    Boolean,
  );

  const myBlocked = (myBlockedContacts ?? []).map(normalizeId);
  const otherBlocked = (otherBlockedContacts ?? []).map(normalizeId);

  const iBlockedOther = otherIds.some((id) => myBlocked.includes(id));
  const otherBlockedMe = meIds.some((id) => otherBlocked.includes(id));

  return iBlockedOther || otherBlockedMe;
}

// ===== Hook principal =====
export function useNearbyAlerts() {
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [me, setMe] = useState<UserDoc | null>(null);
  const [topColor, setTopColor] = useState('#3B5A85');

  const currentYear = useMemo(() => new Date().getFullYear(), []);

  // Suscripción a MI doc: color, visibility y location
  useEffect(() => {
    const uid = firebaseAuth.currentUser?.uid;
    if (!uid) {
      setLoading(false);
      setMe(null);
      return;
    }

    const unsub = firestoreDb
      .collection('users')
      .doc(uid)
      .onSnapshot((snap) => {
        if (snap.exists) {
          const data = snap.data() as UserDoc;
          if (typeof data.topBarColor === 'string' && data.topBarColor) {
            setTopColor(data.topBarColor);
          }
          setMe({ ...data, uid });
        } else {
          setMe(null);
        }
        setLoading(false);
      });

    return () => unsub();
  }, []);

  const buildAlerts = useCallback(async () => {
    const uid = firebaseAuth.currentUser?.uid;
    if (!uid || !me) {
      setAlerts([]);
      return;
    }

    if (!me.visibility || !me.location?.lat || !me.location?.lng) {
      setAlerts([]);
      return;
    }

    try {
      // 1) Leer hashes de tus contactos: users/{uid}/contactHashes/*
      const hashesSnap = await firestoreDb
        .collection('users')
        .doc(uid)
        .collection('contactHashes')
        .get();

      const contactHashSet = new Set<string>();
      hashesSnap.forEach((d) => {
        const data = d.data() as { hash?: string };
        if (typeof data.hash === 'string') {
          contactHashSet.add(data.hash);
        }
      });

      // 2) Leer usuarios visibles (limit 200)
      const usersSnap = await firestoreDb
        .collection('users')
        .where('visibility', '==', true)
        .limit(200)
        .get();

      const myPoint = { lat: me.location.lat, lng: me.location.lng };
      const now = Date.now();

      const myAge =
        typeof me.birthYear === 'number' ? currentYear - me.birthYear : null;

      const myInterests = new Set(
        [
          ...(me.personalInterests ?? []),
          ...(me.professionalInterests ?? []),
        ].map((x) => (x || '').toLowerCase()),
      );

      const authUser = firebaseAuth.currentUser;
      const myEmail = authUser?.email ?? null;
      const myPhone = me.phone ?? null;
      const myBlockedContacts = me.blockedContacts ?? [];

      const results: AlertItem[] = [];

      // RNFirebase: docs en QuerySnapshot
      for (const d of usersSnap.docs) {
        if (d.id === uid) continue;

        const u = d.data() as UserDoc;

        // Bloqueos mutuos
        const blocked = isBlockedBetween(
          myEmail,
          myPhone,
          myBlockedContacts,
          u.email ?? null,
          u.phone ?? null,
          u.blockedContacts ?? [],
        );
        if (blocked) continue;

        // Edad (ambos sentidos)
        const theirAge =
          typeof u.birthYear === 'number' ? currentYear - u.birthYear : null;

        if (myAge !== null) {
          if (u.visibleToMinAge && myAge < u.visibleToMinAge) continue;
          if (u.visibleToMaxAge && myAge > u.visibleToMaxAge) continue;
        }
        if (theirAge !== null) {
          if (me.visibleToMinAge && theirAge < me.visibleToMinAge) continue;
          if (me.visibleToMaxAge && theirAge > me.visibleToMaxAge) continue;
        }

        // Ubicación válida/fresca
        const loc = u.location;
        if (!loc?.lat || !loc?.lng) continue;
        if (loc.updatedAt && now - loc.updatedAt > LOCATION_FRESH_MS) continue;

        // Distancia (20 ft)
        const km = haversineKm(myPoint, { lat: loc.lat, lng: loc.lng });
        if (km > NEARBY_RADIUS_KM) continue;

        const meters = km * 1000;
        const feet = meters * FEET_PER_METER;

        // Intereses en común
        const otherInterests = new Set(
          [
            ...(u.personalInterests ?? []),
            ...(u.professionalInterests ?? []),
          ].map((x) => (x || '').toLowerCase()),
        );

        const shared: string[] = [];
        otherInterests.forEach((tag) => {
          if (myInterests.has(tag)) shared.push(tag);
        });

        // ¿este usuario está en mis contactos (por HASH)?
        const emailNorm = normalizeId(u.email ?? null);
        const phoneNorm = normalizeId(u.phone ?? null);

        let fromContacts = false;
        if (contactHashSet.size > 0) {
          if (emailNorm) {
            const emailHash = await hashId(emailNorm);
            if (contactHashSet.has(emailHash)) fromContacts = true;
          }
          if (!fromContacts && phoneNorm) {
            const phoneHash = await hashId(phoneNorm);
            if (contactHashSet.has(phoneHash)) fromContacts = true;
          }
        }

        const kind: AlertKind =
          shared.length > 0 ? 'interest_nearby' : 'contact_nearby';

        results.push({
          id: `${d.id}-${loc.updatedAt || now}`,
          uid: d.id,
          name: shortName(u.realName),
          avatar: u.profileImage ?? undefined,
          kind,
          distanceFt: Math.round(feet),
          sharedInterests: shared.slice(0, 3),
          at: loc.updatedAt || now,
          fromContacts,
        });
      }

      results.sort((a, b) => (a.distanceFt ?? 0) - (b.distanceFt ?? 0));
      setAlerts(results);
    } catch (err) {
      if (__DEV__) {
        console.warn('[useNearbyAlerts] failed to build alerts', err);
      }
      setAlerts([]);
    }
  }, [me, currentYear]);

  // Inicial + auto refresh
  useEffect(() => {
    if (!me) {
      setAlerts([]);
      return;
    }

    setLoading(true);
    buildAlerts().finally(() => setLoading(false));

    const id = setInterval(() => {
      buildAlerts();
    }, AUTO_REFRESH_MS);

    return () => clearInterval(id);
  }, [me, buildAlerts]);

  return {
    loading,
    alerts,
    topColor,
    me,
    refresh: buildAlerts,
  };
}

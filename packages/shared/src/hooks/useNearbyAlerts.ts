// packages/shared/src/hooks/useNearbyAlerts.ts
import { useCallback, useEffect, useMemo, useState } from 'react';
import { firebaseAuth } from '../config/firebaseConfig';
import * as Crypto from 'expo-crypto';

import {
  dbOnUserSnapshot,
  dbQueryVisibleUsers,
  dbGetContactHashes,
} from '../services/db';

const FEET_PER_METER = 3.28084;

const NEARBY_RADIUS_FT = 30;
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
  fromContacts?: boolean;
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

  birthYear?: number;
  visibleToMinAge?: number | null;
  visibleToMaxAge?: number | null;
  blockedContacts?: string[];
  email?: string;
  phone?: string;
};

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
  const R = 6371;
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

export function useNearbyAlerts() {
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [me, setMe] = useState<UserDoc | null>(null);
  const [topColor, setTopColor] = useState('#3B5A85');

  const currentYear = useMemo(() => new Date().getFullYear(), []);

  // ✅ mi perfil via db layer
  useEffect(() => {
    const uid = firebaseAuth.currentUser?.uid;
    if (!uid) {
      setLoading(false);
      setMe(null);
      return;
    }

    const unsub = dbOnUserSnapshot(uid, (doc: UserDoc | null) => {
      const data = (doc ?? null) as UserDoc | null;

      if (data?.topBarColor) setTopColor(data.topBarColor);
      setMe(data ? { ...data, uid } : null);
      setLoading(false);
    });

    return () => unsub?.();
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
      // 1) hashes de contactos
      const hashes = await dbGetContactHashes(uid);
      const contactHashSet = new Set<string>(hashes);

      // 2) usuarios visibles
      const users = await dbQueryVisibleUsers(200);

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

      for (const u of users as Array<UserDoc & { id?: string; uid?: string }>) {
        const otherUid = (u as any).id || u.uid;
        if (!otherUid || otherUid === uid) continue;

        // bloqueos
        if (
          isBlockedBetween(
            myEmail,
            myPhone,
            myBlockedContacts,
            u.email ?? null,
            u.phone ?? null,
            u.blockedContacts ?? [],
          )
        )
          continue;

        // edades (doble sentido)
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

        // ubicación fresca
        const loc = u.location;
        if (!loc?.lat || !loc?.lng) continue;
        if (loc.updatedAt && now - loc.updatedAt > LOCATION_FRESH_MS) continue;

        // distancia
        const km = haversineKm(myPoint, { lat: loc.lat, lng: loc.lng });
        if (km > NEARBY_RADIUS_KM) continue;

        const feet = km * 1000 * FEET_PER_METER;

        // intereses compartidos
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

        // contacto por hash
        let fromContacts = false;
        if (contactHashSet.size > 0) {
          const emailNorm = normalizeId(u.email ?? null);
          const phoneNorm = normalizeId(u.phone ?? null);

          // (pequeña optimización: no hashear si no hay valor)
          if (emailNorm) {
            const emailHash = await hashId(emailNorm);
            if (contactHashSet.has(emailHash)) fromContacts = true;
          }
          if (!fromContacts && phoneNorm) {
            const phoneHash = await hashId(phoneNorm);
            if (contactHashSet.has(phoneHash)) fromContacts = true;
          }
        }

        // ✅ regla correcta del tipo de alerta:
        // - si hay intereses compartidos => interest_nearby
        // - si NO hay intereses compartidos, solo creamos alerta si fromContacts === true
        if (shared.length === 0 && !fromContacts) continue;

        const kind: AlertKind =
          shared.length > 0 ? 'interest_nearby' : 'contact_nearby';

        results.push({
          id: `${otherUid}-${loc.updatedAt || now}`,
          uid: otherUid,
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
      if (__DEV__)
        console.warn('[useNearbyAlerts] failed to build alerts', err);
      setAlerts([]);
    }
  }, [me, currentYear]);

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

  return { loading, alerts, topColor, me, refresh: buildAlerts };
}

/**
 * Nearby alerts from discoverNearby (no peer users queries, no peer coords).
 */
import { useCallback, useEffect, useState } from 'react';

import { firebaseAuth } from '../config/firebaseConfig';
import { dbOnUserSnapshot } from '../services/db';
import {
  buildDiscoverNearbyRequest,
  metersToFeet,
  type DiscoverNearbyResult,
} from '../visibility';
import { getVisibilityDiscoveryClient } from '../visibility/iosVisibilityFoundation';

const AUTO_REFRESH_MS = 30 * 1000;

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

type UserDoc = {
  uid?: string;
  topBarColor?: string;
  visibility?: boolean;
  searchPreferences?: {
    personal?: { interestIds?: string[] };
    professional?: { interestIds?: string[] };
  };
  personalOnboardingInterests?: Array<{ id?: string }>;
  professionalOnboardingInterests?: Array<{ id?: string }>;
};

function collectOwnInterestIds(me: UserDoc): Set<string> {
  const ids: string[] = [];
  const personal = me.searchPreferences?.personal?.interestIds;
  const professional = me.searchPreferences?.professional?.interestIds;
  if (Array.isArray(personal)) ids.push(...personal);
  if (Array.isArray(professional)) ids.push(...professional);
  for (const row of me.personalOnboardingInterests ?? []) {
    if (row?.id) ids.push(row.id);
  }
  for (const row of me.professionalOnboardingInterests ?? []) {
    if (row?.id) ids.push(row.id);
  }
  return new Set(ids.filter(Boolean));
}

function mapDiscoverResults(
  results: DiscoverNearbyResult[],
  myInterestIds: Set<string>,
  at: number,
): AlertItem[] {
  return results.map((r) => {
    const shared = r.profile.interestIds.filter((id) => myInterestIds.has(id));
    return {
      id: r.uid,
      uid: r.uid,
      name: r.profile.displayName || 'Unnamed',
      avatar: r.profile.profileImage,
      kind: shared.length > 0 ? 'interest_nearby' : 'contact_nearby',
      distanceFt: Math.round(metersToFeet(r.distanceMeters)),
      sharedInterests: shared.slice(0, 3),
      at,
      fromContacts: false,
    };
  });
}

export function useNearbyAlerts() {
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [me, setMe] = useState<UserDoc | null>(null);
  const [topColor, setTopColor] = useState('#3B5A85');

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
    if (!uid || !me?.visibility) {
      setAlerts([]);
      return;
    }

    try {
      const client = await getVisibilityDiscoveryClient();
      const response = await client.discoverNearby(
        buildDiscoverNearbyRequest({ limit: 50 }),
      );
      setAlerts(
        mapDiscoverResults(
          response.results.filter((r) => r.uid !== uid),
          collectOwnInterestIds(me),
          response.serverTime || Date.now(),
        ),
      );
    } catch (err) {
      if (__DEV__)
        console.warn('[useNearbyAlerts] discoverNearby failed', err);
      setAlerts([]);
    }
  }, [me]);

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

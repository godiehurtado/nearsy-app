/**
 * Nearby alerts from discoverNearby (no peer users queries, no peer coords).
 * Periodic refresh is silent once a list exists — same rules as Discovery.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { firebaseAuth } from '../config/firebaseConfig';
import { dbOnUserSnapshot } from '../services/db';
import {
  buildDiscoverNearbyRequest,
  metersToFeet,
  type DiscoverNearbyResult,
} from '../visibility';
import { getVisibilityDiscoveryClient } from '../visibility/iosVisibilityFoundation';
import {
  shouldApplyNearbyLoadResult,
  shouldPreserveNearbyResultsDuringLoad,
  shouldUseNearbyFullScreenLoader,
  type NearbyLoadReason,
} from '../visibility/nearbyLoadUi';

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
  const alertsRef = useRef<AlertItem[]>([]);
  const meRef = useRef<UserDoc | null>(null);
  const requestIdRef = useRef(0);
  const inFlightRef = useRef(false);
  const interestFingerprint = me
    ? [...collectOwnInterestIds(me)].sort().join(',')
    : '';

  useEffect(() => {
    alertsRef.current = alerts;
  }, [alerts]);

  useEffect(() => {
    meRef.current = me;
  }, [me]);

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
    });

    return () => unsub?.();
  }, []);

  const buildAlerts = useCallback(
    async (reason: NearbyLoadReason = 'effect') => {
      const uid = firebaseAuth.currentUser?.uid;
      const currentMe = meRef.current;
      if (!uid || !currentMe?.visibility) {
        setAlerts([]);
        alertsRef.current = [];
        setLoading(false);
        return;
      }

      if (inFlightRef.current && reason === 'interval') {
        return;
      }

      const initialPending = alertsRef.current.length === 0;
      const useFullScreen = shouldUseNearbyFullScreenLoader({
        reason,
        initialDiscoveryPending: initialPending,
      });
      const preserve = shouldPreserveNearbyResultsDuringLoad({
        reason,
        initialDiscoveryPending: initialPending,
        itemCount: alertsRef.current.length,
      });

      const requestId = ++requestIdRef.current;
      inFlightRef.current = true;
      if (useFullScreen && !preserve) {
        setLoading(true);
      }

      try {
        const client = await getVisibilityDiscoveryClient();
        const response = await client.discoverNearby(
          buildDiscoverNearbyRequest({ limit: 50 }),
        );
        if (
          !shouldApplyNearbyLoadResult({
            requestId,
            latestRequestId: requestIdRef.current,
          })
        ) {
          return;
        }
        setAlerts(
          mapDiscoverResults(
            response.results.filter((r) => r.uid !== uid),
            collectOwnInterestIds(currentMe),
            response.serverTime || Date.now(),
          ),
        );
      } catch (err) {
        if (__DEV__)
          console.warn('[useNearbyAlerts] discoverNearby failed', err);
        if (
          !shouldApplyNearbyLoadResult({
            requestId,
            latestRequestId: requestIdRef.current,
          })
        ) {
          return;
        }
        if (!preserve && alertsRef.current.length === 0) {
          setAlerts([]);
        }
      } finally {
        if (requestId === requestIdRef.current) {
          inFlightRef.current = false;
          setLoading(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    if (!me) {
      setAlerts([]);
      alertsRef.current = [];
      setLoading(false);
      return;
    }

    void buildAlerts('effect');

    const id = setInterval(() => {
      void buildAlerts('interval');
    }, AUTO_REFRESH_MS);

    return () => clearInterval(id);
  }, [me?.uid, me?.visibility, interestFingerprint, buildAlerts]);

  const refresh = useCallback(() => buildAlerts('ptr'), [buildAlerts]);

  return { loading, alerts, topColor, me, refresh };
}

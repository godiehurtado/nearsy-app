/**
 * Nearby alerts from discoverNearby (no peer users queries, no peer coords).
 * Periodic refresh is silent once a list exists — same rules as Discovery.
 * Viewed state is written on row open via alertSeen, not tab enter.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  buildAlertSeenWrite,
  countUnseenAlerts,
  isAlertUnseen,
  type AlertSeenRecord,
} from '../alerts/alertAppearance';
import { loadAlertSeenMap, writeAlertSeen } from '../alerts/alertSeenStore';
import { firebaseAuth } from '../config/firebaseConfig';
import { dbOnUserSnapshot } from '../services/db';
import { buildDiscoverNearbyRequest, metersToFeet } from '../visibility';
import { getVisibilityDiscoveryClient } from '../visibility/iosVisibilityFoundation';
import {
  shouldApplyNearbyLoadResult,
  shouldPreserveNearbyResultsDuringLoad,
  shouldUseNearbyFullScreenLoader,
  type NearbyLoadReason,
} from '../visibility/nearbyLoadUi';
import {
  collectActiveModeInterestIds,
  fingerprintActiveModeInterests,
  mapDiscoverResultsToAlerts,
  type AlertItem,
  type AlertKind,
  type NearbyAlertsViewerDoc,
} from './nearbyAlertsMapping';

export type { AlertItem, AlertKind };
export {
  collectActiveModeInterestIds,
  fingerprintActiveModeInterests,
  mapDiscoverResultsToAlerts,
} from './nearbyAlertsMapping';

const AUTO_REFRESH_MS = 30 * 1000;

type UserDoc = NearbyAlertsViewerDoc & {
  uid?: string;
  topBarColor?: string;
  visibility?: boolean;
};

export function useNearbyAlerts() {
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [seenByPeer, setSeenByPeer] = useState<Record<string, AlertSeenRecord>>(
    {},
  );
  const [me, setMe] = useState<UserDoc | null>(null);
  const [topColor, setTopColor] = useState('#3B5A85');
  const alertsRef = useRef<AlertItem[]>([]);
  const meRef = useRef<UserDoc | null>(null);
  const requestIdRef = useRef(0);
  const inFlightRef = useRef(false);
  const interestFingerprint = fingerprintActiveModeInterests(me);

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
      setAlerts([]);
      setSeenByPeer({});
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
        const mapped = mapDiscoverResultsToAlerts(
          response.results,
          collectActiveModeInterestIds(currentMe),
          response.serverTime || Date.now(),
          uid,
          metersToFeet,
        );
        const seen = await loadAlertSeenMap(uid);
        if (
          !shouldApplyNearbyLoadResult({
            requestId,
            latestRequestId: requestIdRef.current,
          })
        ) {
          return;
        }
        setSeenByPeer(seen);
        setAlerts(
          mapped.map((item) => ({
            ...item,
            unseen: isAlertUnseen(
              item.appearanceKey,
              item.uid ? seen[item.uid] : undefined,
            ),
          })),
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

  const markAlertOpened = useCallback(async (item: AlertItem) => {
    const uid = firebaseAuth.currentUser?.uid;
    const peerUid = item.uid;
    if (!uid || !peerUid) return;
    const record = buildAlertSeenWrite(item.appearanceKey, Date.now());
    setSeenByPeer((prev) => ({ ...prev, [peerUid]: record }));
    setAlerts((prev) =>
      prev.map((row) =>
        row.uid === peerUid ? { ...row, unseen: false } : row,
      ),
    );
    try {
      await writeAlertSeen(uid, peerUid, record);
    } catch {
      /* Functions #40 rules may not be deployed yet. */
    }
  }, []);

  const unseenCount = countUnseenAlerts(alerts, seenByPeer);

  return {
    loading,
    alerts,
    unseenCount,
    topColor,
    me,
    refresh,
    markAlertOpened,
  };
}

/**
 * Nearby alerts from discoverNearby (no peer users queries, no peer coords).
 * Shared interests are evaluated against the viewer's active profile mode only.
 * Periodic refresh is silent once a list exists — same rules as Discovery.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { firebaseAuth } from '../config/firebaseConfig';
import { dbOnUserSnapshot } from '../services/db';
import {
  buildDiscoverNearbyRequest,
  isVisibilityDiscoveryClientError,
} from '../visibility';
import { getVisibilityDiscoveryClient } from '../visibility/iosVisibilityFoundation';
import {
  shouldApplyNearbyLoadOutcome,
  shouldClearNearbyItemsOnOutcomeFailure,
} from '../visibility/nearbyLoadUiState';
import {
  collectActiveModeInterestIds,
  fingerprintActiveModeInterests,
  mapDiscoverResultsToInterestAlerts,
  type AlertItem,
  type AlertKind,
  type NearbyAlertsViewerDoc,
} from './nearbyAlertsMapping';

export type { AlertItem, AlertKind };
export {
  collectActiveModeInterestIds,
  fingerprintActiveModeInterests,
  mapDiscoverResultsToInterestAlerts,
} from './nearbyAlertsMapping';

const AUTO_REFRESH_MS = 30 * 1000;

export type NearbyAlertsErrorKind = 'callable' | 'permission-denied' | 'unknown';

type UserDoc = NearbyAlertsViewerDoc & {
  uid?: string;
  topBarColor?: string;
  visibility?: boolean;
};

function classifyAlertsError(err: unknown): NearbyAlertsErrorKind {
  if (isVisibilityDiscoveryClientError(err)) {
    const code = String(err.code ?? '').toLowerCase();
    if (code.includes('permission-denied') || code.includes('permission_denied')) {
      return 'permission-denied';
    }
    return 'callable';
  }
  const code = String((err as { code?: string })?.code ?? '').toLowerCase();
  if (code.includes('permission-denied') || code.includes('permission_denied')) {
    return 'permission-denied';
  }
  return 'unknown';
}

export type NearbyAlertsState = {
  loading: boolean;
  alerts: AlertItem[];
  topColor: string;
  me: UserDoc | null;
  errorKind: NearbyAlertsErrorKind | null;
  refresh: () => Promise<void>;
};

export function useNearbyAlertsState(): NearbyAlertsState {
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [me, setMe] = useState<UserDoc | null>(null);
  const [topColor, setTopColor] = useState('#3B5A85');
  const [errorKind, setErrorKind] = useState<NearbyAlertsErrorKind | null>(
    null,
  );
  const [authUid, setAuthUid] = useState<string | null>(
    () => firebaseAuth.currentUser?.uid ?? null,
  );
  /** Bumped on auth/mode/visibility/unmount so in-flight discoverNearby never applies. */
  const requestGenerationRef = useRef(0);
  const cancelledRef = useRef(false);
  const inFlightRef = useRef(false);
  const initialFetchCompletedRef = useRef(false);
  const viewerUidRef = useRef<string | null>(null);
  const meRef = useRef<UserDoc | null>(null);
  const alertsRef = useRef<AlertItem[]>([]);

  meRef.current = me;
  alertsRef.current = alerts;

  const interestFingerprint = fingerprintActiveModeInterests(me);

  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
      requestGenerationRef.current += 1;
    };
  }, []);

  useEffect(() => {
    const unsub = firebaseAuth.onAuthStateChanged((user) => {
      setAuthUid(user?.uid ?? null);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    requestGenerationRef.current += 1;
    if (!authUid) {
      setLoading(false);
      setMe(null);
      setAlerts([]);
      setErrorKind(null);
      initialFetchCompletedRef.current = false;
      viewerUidRef.current = null;
      return;
    }

    const unsub = dbOnUserSnapshot(authUid, (doc: UserDoc | null) => {
      const data = (doc ?? null) as UserDoc | null;
      if (data?.topBarColor) setTopColor(data.topBarColor);
      setMe(data ? { ...data, uid: authUid } : null);
    });

    return () => {
      requestGenerationRef.current += 1;
      unsub?.();
    };
  }, [authUid]);

  const buildAlerts = useCallback(async (showFullScreenLoader: boolean) => {
    const generation = ++requestGenerationRef.current;
    const stillCurrent = () =>
      shouldApplyNearbyLoadOutcome(generation, requestGenerationRef.current) &&
      !cancelledRef.current;

    inFlightRef.current = true;
    if (showFullScreenLoader) {
      setLoading(true);
      setErrorKind(null);
    } else if (__DEV__) {
      console.log('[useNearbyAlerts] silent refresh');
    }

    try {
      const viewer = meRef.current;
      const uid = firebaseAuth.currentUser?.uid ?? authUid ?? viewer?.uid;
      if (!uid || uid !== authUid || !viewer?.visibility) {
        if (!stillCurrent()) return;
        setAlerts([]);
        setErrorKind(null);
        return;
      }

      const client = await getVisibilityDiscoveryClient();
      const response = await client.discoverNearby(
        buildDiscoverNearbyRequest({ limit: 50 }),
      );
      if (!stillCurrent()) return;
      if (firebaseAuth.currentUser?.uid !== uid) return;

      // Valid empty payloads replace the list; only failures may preserve.
      setAlerts(
        mapDiscoverResultsToInterestAlerts(
          response.results,
          collectActiveModeInterestIds(viewer),
          response.serverTime || Date.now(),
          uid,
        ),
      );
      setErrorKind(null);
    } catch (err) {
      if (!stillCurrent()) return;
      if (__DEV__) {
        console.warn('[useNearbyAlerts] discoverNearby failed', err);
      }
      if (shouldClearNearbyItemsOnOutcomeFailure({ showFullScreenLoader })) {
        setAlerts([]);
      }
      setErrorKind(classifyAlertsError(err));
    } finally {
      if (generation === requestGenerationRef.current) {
        inFlightRef.current = false;
        setLoading(false);
        initialFetchCompletedRef.current = true;
      }
    }
  }, [authUid]);

  useEffect(() => {
    if (!me || !authUid) {
      requestGenerationRef.current += 1;
      inFlightRef.current = false;
      setAlerts([]);
      setErrorKind(null);
      return;
    }

    const uidChanged =
      viewerUidRef.current != null && viewerUidRef.current !== authUid;
    if (uidChanged) {
      setAlerts([]);
      initialFetchCompletedRef.current = false;
    }
    viewerUidRef.current = authUid;

    const showFullScreenLoader =
      !initialFetchCompletedRef.current || uidChanged;
    void buildAlerts(showFullScreenLoader);

    const id = setInterval(() => {
      if (inFlightRef.current) return;
      void buildAlerts(false);
    }, AUTO_REFRESH_MS);

    return () => {
      requestGenerationRef.current += 1;
      inFlightRef.current = false;
      clearInterval(id);
    };
  }, [me?.uid, me?.visibility, interestFingerprint, authUid, buildAlerts]);

  const refresh = useCallback(
    () => buildAlerts(false),
    [buildAlerts],
  );

  return { loading, alerts, topColor, me, errorKind, refresh };
}

/** @deprecated Prefer NearbyAlertsProvider + useNearbyAlerts from context. */
export function useNearbyAlerts(): NearbyAlertsState {
  return useNearbyAlertsState();
}

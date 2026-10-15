/**
 * Nearby alerts from discoverNearby (no peer users queries, no peer coords).
 * Shared interests are evaluated against the viewer's active profile mode only.
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
  collectActiveModeInterestIds,
  mapDiscoverResultsToInterestAlerts,
  type AlertItem,
  type AlertKind,
  type NearbyAlertsViewerDoc,
} from './nearbyAlertsMapping';

export type { AlertItem, AlertKind };
export {
  collectActiveModeInterestIds,
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
      return;
    }

    setLoading(true);
    const unsub = dbOnUserSnapshot(authUid, (doc: UserDoc | null) => {
      const data = (doc ?? null) as UserDoc | null;
      if (data?.topBarColor) setTopColor(data.topBarColor);
      setMe(data ? { ...data, uid: authUid } : null);
      setLoading(false);
    });

    return () => {
      requestGenerationRef.current += 1;
      unsub?.();
    };
  }, [authUid]);

  const buildAlerts = useCallback(async () => {
    const generation = ++requestGenerationRef.current;
    const uid = firebaseAuth.currentUser?.uid;
    if (!uid || uid !== authUid || !me?.visibility) {
      if (generation === requestGenerationRef.current) {
        setAlerts([]);
        setErrorKind(null);
      }
      return;
    }

    // Capture viewer snapshot for this generation (mode + interests at request time).
    const viewer = me;

    try {
      const client = await getVisibilityDiscoveryClient();
      const response = await client.discoverNearby(
        buildDiscoverNearbyRequest({ limit: 50 }),
      );
      if (generation !== requestGenerationRef.current) return;
      if (firebaseAuth.currentUser?.uid !== uid) return;

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
      if (generation !== requestGenerationRef.current) return;
      if (__DEV__) {
        console.warn('[useNearbyAlerts] discoverNearby failed', err);
      }
      setAlerts([]);
      setErrorKind(classifyAlertsError(err));
    }
  }, [me, authUid]);

  useEffect(() => {
    if (!me || !authUid) {
      setAlerts([]);
      setErrorKind(null);
      return;
    }

    // Mode / visibility / interest bags live on `me`; any change invalidates prior work.
    setLoading(true);
    buildAlerts().finally(() => {
      // Only clear loading if this effect's generation is still current.
      setLoading(false);
    });

    const id = setInterval(() => {
      buildAlerts();
    }, AUTO_REFRESH_MS);

    return () => {
      requestGenerationRef.current += 1;
      clearInterval(id);
    };
  }, [me, authUid, buildAlerts]);

  return { loading, alerts, topColor, me, errorKind, refresh: buildAlerts };
}

/** @deprecated Prefer NearbyAlertsProvider + useNearbyAlerts from context. */
export function useNearbyAlerts(): NearbyAlertsState {
  return useNearbyAlertsState();
}

/**
 * Foreground contractual location publisher (BUG-DISC-02).
 * Publishes via publishLocation when Visibility is ON — resume + light cadence.
 * Does not depend on Background Location. Legacy LiveLocationTracker remains.
 */
import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as Location from 'expo-location';
import { firebaseAuth } from '../config/firebaseConfig';
import { dbOnUserSnapshot } from '../services/db';
import { getVisibilityDiscoveryClient } from '../visibility/iosVisibilityFoundation';
import {
  FOREGROUND_CONTRACTUAL_CADENCE_MS,
  shouldAttemptContractualPublish,
  noteContractualPublishSuccess,
} from '../visibility/contractualLocationRefresh';
import { publishLocationFlow } from '../visibility/orchestration';

type ProfileDoc = {
  visibility?: boolean;
};

async function tryContractualPublish(force: boolean): Promise<void> {
  const uid = firebaseAuth.currentUser?.uid;
  if (!uid) return;

  const perm = await Location.getForegroundPermissionsAsync();
  if (perm.status !== 'granted') return;

  if (!force && !shouldAttemptContractualPublish(Date.now())) {
    return;
  }

  try {
    const client = await getVisibilityDiscoveryClient();
    const outcome = await publishLocationFlow(client);
    if (outcome.ok) {
      noteContractualPublishSuccess(Date.now());
    }
  } catch {
    // best-effort — Nearby open/Retry remain the strong recovery path
  }
}

export default function ContractualLocationPublisher() {
  const uid = firebaseAuth.currentUser?.uid ?? null;
  const activeRef = useRef(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    if (!uid) {
      activeRef.current = false;
      return;
    }

    const unsub = dbOnUserSnapshot(
      uid,
      (raw) => {
        const data = (raw as ProfileDoc) ?? {};
        activeRef.current = !!data.visibility;
      },
      () => {
        activeRef.current = false;
      },
    );

    return () => unsub();
  }, [uid]);

  // Resume: Visibility ON + FG permission → contractual publish (debounced)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      const wasBg = appStateRef.current.match(/inactive|background/);
      const isActive = next === 'active';
      appStateRef.current = next;

      if (wasBg && isActive && activeRef.current) {
        void tryContractualPublish(false);
      }
    });
    return () => sub.remove();
  }, []);

  // Light foreground cadence while Visibility is ON (~12 min)
  useEffect(() => {
    const id = setInterval(() => {
      if (AppState.currentState !== 'active') return;
      if (!activeRef.current) return;
      void tryContractualPublish(false);
    }, FOREGROUND_CONTRACTUAL_CADENCE_MS);
    return () => clearInterval(id);
  }, []);

  return null;
}

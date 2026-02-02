// src/hooks/useLiveLocation.ts  ✅ RNFirebase-only
import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { AppState, AppStateStatus } from 'react-native';
import { firestoreDb } from '../config/firebaseConfig';

type Options = {
  enabled?: boolean; // encender/apagar tracking
  uid: string | undefined | null; // uid del usuario
  distanceInterval?: number; // mínimo en metros para reportar (throttle por movimiento)
  timeIntervalMs?: number; // mínimo en ms entre reportes (throttle por tiempo)
  accuracy?: Location.Accuracy; // precisión
  onError?: (err: any) => void;
};

export function useLiveLocation({
  enabled = true,
  uid,
  distanceInterval = 15, // reporta si se movió ≥ 15 m
  timeIntervalMs = 60_000, // y no más de 1 vez por minuto
  accuracy = Location.Accuracy.Balanced,
  onError,
}: Options) {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const lastSentAt = useRef<number>(0);
  const watcher = useRef<Location.LocationSubscription | null>(null);

  // pedir permisos y arrancar/pausar según app state
  useEffect(() => {
    const ensurePermsAndStart = async () => {
      try {
        if (!enabled || !uid) return;

        // permisos
        let perm = await Location.getForegroundPermissionsAsync();
        if (perm.status !== 'granted') {
          const req = await Location.requestForegroundPermissionsAsync();
          if (req.status !== 'granted') {
            setHasPermission(false);
            return;
          }
        }
        setHasPermission(true);

        // primer fix (rápido)
        const last = await Location.getLastKnownPositionAsync();
        const first =
          last ?? (await Location.getCurrentPositionAsync({ accuracy }));

        if (first?.coords) {
          await upsertLocation(
            uid,
            first.coords.latitude,
            first.coords.longitude,
          );
          lastSentAt.current = Date.now();
        }

        // watcher en movimiento
        watcher.current = await Location.watchPositionAsync(
          {
            accuracy,
            distanceInterval,
            mayShowUserSettingsDialog: true,
          },
          async (pos) => {
            const now = Date.now();
            if (now - lastSentAt.current < timeIntervalMs) return; // throttle por tiempo
            lastSentAt.current = now;

            try {
              await upsertLocation(
                uid,
                pos.coords.latitude,
                pos.coords.longitude,
              );
            } catch (err) {
              onError?.(err);
            }
          },
        );
      } catch (err) {
        setHasPermission(false);
        onError?.(err);
      }
    };

    if (enabled && uid) ensurePermsAndStart();

    return () => {
      watcher.current?.remove();
      watcher.current = null;
    };
  }, [enabled, uid, accuracy, distanceInterval, timeIntervalMs, onError]);

  // pausar cuando la app se va a background y reanudar al volver
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextState === 'active'
      ) {
        (async () => {
          try {
            if (!enabled || !uid) return;
            const pos = await Location.getCurrentPositionAsync({ accuracy });
            await upsertLocation(
              uid,
              pos.coords.latitude,
              pos.coords.longitude,
            );
            lastSentAt.current = Date.now();
          } catch (err) {
            onError?.(err);
          }
        })();
      }
      appState.current = nextState;
    });

    return () => sub.remove();
  }, [enabled, uid, accuracy, onError]);

  return { hasPermission };
}

async function upsertLocation(uid: string, lat: number, lng: number) {
  const now = Date.now();

  // ✅ RNFirebase: set() con merge (equivalente a setDoc(..., { merge: true }))
  await firestoreDb
    .collection('users')
    .doc(uid)
    .set(
      {
        location: { lat, lng, updatedAt: now },
        updatedAt: now,
      },
      { merge: true },
    );
}

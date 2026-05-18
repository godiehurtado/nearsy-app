// src/hooks/useLiveLocation.ts
import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { dbSetUserMerge } from '../services/db';

type Options = {
  enabled?: boolean;
  uid: string | undefined | null;
  distanceInterval?: number;
  timeIntervalMs?: number;
  accuracy?: Location.Accuracy;
  onError?: (err: unknown) => void;
};

export function useLiveLocation({
  enabled = true,
  uid,
  distanceInterval = 10,
  timeIntervalMs = 30_000,
  accuracy = Location.Accuracy.Balanced,
  onError,
}: Options) {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  const appState = useRef<AppStateStatus>(AppState.currentState);
  const lastSentAt = useRef<number>(0);
  const watcher = useRef<Location.LocationSubscription | null>(null);

  const stopWatcher = () => {
    watcher.current?.remove();
    watcher.current = null;
  };

  const sendOnce = async (
    lat: number,
    lng: number,
    accuracyValue?: number | null,
  ) => {
    await upsertLocation(uid as string, lat, lng, accuracyValue);
    lastSentAt.current = Date.now();
  };

  // Arranca / detiene watcher según enabled/uid
  useEffect(() => {
    let cancelled = false;

    const ensurePermsAndStart = async () => {
      try {
        if (!enabled || !uid) return;

        // ✅ evita duplicados
        stopWatcher();

        // ✅ permisos foreground
        let perm = await Location.getForegroundPermissionsAsync();
        if (perm.status !== 'granted') {
          const req = await Location.requestForegroundPermissionsAsync();
          if (req.status !== 'granted') {
            if (!cancelled) setHasPermission(false);
            return;
          }
        }
        if (!cancelled) setHasPermission(true);

        // ✅ Prefer a fresh high-accuracy fix for the first foreground write.
        const last = await Location.getLastKnownPositionAsync();
        let first: Location.LocationObject | null = null;

        try {
          first = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Highest,
          });
        } catch {
          first = last;
        }

        if (first?.coords && !cancelled) {
          await sendOnce(
            first.coords.latitude,
            first.coords.longitude,
            first.coords.accuracy,
          );
        }

        // ✅ watcher en movimiento (solo foreground)
        watcher.current = await Location.watchPositionAsync(
          {
            accuracy,
            distanceInterval,
            // ✅ iOS: mejor no disparar diálogos de settings durante review
            mayShowUserSettingsDialog: Platform.OS === 'android',
          },
          async (pos) => {
            if (cancelled) return;

            const now = Date.now();
            if (now - lastSentAt.current < timeIntervalMs) return;

            try {
              await sendOnce(
                pos.coords.latitude,
                pos.coords.longitude,
                pos.coords.accuracy,
              );
            } catch (err) {
              onError?.(err);
            }
          },
        );
      } catch (err) {
        if (!cancelled) setHasPermission(false);
        onError?.(err);
      }
    };

    if (enabled && uid) {
      ensurePermsAndStart();
    } else {
      // si se apaga, corta watcher y resetea estado
      stopWatcher();
      setHasPermission(null);
    }

    return () => {
      cancelled = true;
      stopWatcher();
    };
  }, [enabled, uid, accuracy, distanceInterval, timeIntervalMs, onError]);

  // ✅ Foreground-only: si la app se va a background, detenemos watcher
  // y al volver a active, hacemos un update rápido + re-arrancamos si enabled.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      const wasBg = appState.current.match(/inactive|background/);
      const isNowBg = nextState.match(/inactive|background/);
      const isActive = nextState === 'active';

      // Entró a background → detener watcher (esto NO es background location)
      if (!wasBg && isNowBg) {
        stopWatcher();
      }

      // Volvió a active → update rápido (si aplica)
      if (wasBg && isActive) {
        (async () => {
          try {
            if (!enabled || !uid) return;

            const perm = await Location.getForegroundPermissionsAsync();
            if (perm.status !== 'granted') return;

            const pos = await Location.getCurrentPositionAsync({ accuracy });
            await sendOnce(
              pos.coords.latitude,
              pos.coords.longitude,
              pos.coords.accuracy,
            );
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

async function upsertLocation(
  uid: string,
  lat: number,
  lng: number,
  accuracy?: number | null,
) {
  const now = Date.now();
  await dbSetUserMerge(uid, {
    location: { lat, lng, updatedAt: now, accuracy: accuracy ?? null },
    updatedAt: now,
  });
}

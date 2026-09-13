// src/services/backgroundLocation.ts

import { Platform } from 'react-native';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BG_LOCATION_TASK } from '../background/locationTask.android';

type StartOpts = {
  uid: string;
  accuracy?: Location.Accuracy;
  distanceInterval?: number; // metros mínimos para disparar update
  timeIntervalMs?: number; // ms mínimos entre updates (Android respeta más este)
  showsIndicatorIOS?: boolean;
};

export type BackgroundLocationPermissionFailure = {
  code: 'foreground-denied' | 'background-denied';
  canAskAgain: boolean;
};

export class BackgroundLocationPermissionError extends Error {
  readonly code: BackgroundLocationPermissionFailure['code'];
  readonly canAskAgain: boolean;

  constructor(failure: BackgroundLocationPermissionFailure) {
    super(
      failure.code === 'foreground-denied'
        ? 'Foreground location permission not granted'
        : 'Background location permission not granted',
    );
    this.name = 'BackgroundLocationPermissionError';
    this.code = failure.code;
    this.canAskAgain = failure.canAskAgain;
  }
}

export function isBackgroundLocationPermissionError(
  err: unknown,
): err is BackgroundLocationPermissionError {
  return err instanceof BackgroundLocationPermissionError;
}

export async function startBackgroundLocation({
  uid,
  accuracy = Location.Accuracy.Highest,
  distanceInterval = 1,
  timeIntervalMs = 15_000,
  showsIndicatorIOS = true,
}: StartOpts) {
  if (!uid) {
    throw new Error('Missing uid for background location');
  }

  // Guarda uid para que la Task lo recupere
  await AsyncStorage.setItem('NEARSY_BG_UID', uid);

  // ===== Permisos (check → request only when Android can still prompt) =====

  let fg = await Location.getForegroundPermissionsAsync();
  if (fg.status !== 'granted') {
    if (fg.status === 'undetermined' || fg.canAskAgain) {
      fg = await Location.requestForegroundPermissionsAsync();
    }
  }
  if (fg.status !== 'granted') {
    throw new BackgroundLocationPermissionError({
      code: 'foreground-denied',
      canAskAgain: !!fg.canAskAgain,
    });
  }

  let bg = await Location.getBackgroundPermissionsAsync();
  if (bg.status !== 'granted') {
    if (bg.status === 'undetermined' || bg.canAskAgain) {
      bg = await Location.requestBackgroundPermissionsAsync();
    }
  }
  if (bg.status !== 'granted') {
    throw new BackgroundLocationPermissionError({
      code: 'background-denied',
      canAskAgain: !!bg.canAskAgain,
    });
  }

  // ===== Reinicia la task para aplicar SIEMPRE la configuración nueva =====

  const hasStarted =
    await Location.hasStartedLocationUpdatesAsync(BG_LOCATION_TASK);

  if (hasStarted) {
    await Location.stopLocationUpdatesAsync(BG_LOCATION_TASK);
  }

  // ===== Inicia tracking =====

  // Android: distanceInterval 0 → time-driven delivery while stationary (no 1 m gate).
  // iOS: keep caller/default distanceInterval (1 m).
  const effectiveDistanceInterval =
    Platform.OS === 'android' ? 0 : distanceInterval;

  await Location.startLocationUpdatesAsync(BG_LOCATION_TASK, {
    accuracy,

    // Android: intervalo mínimo
    timeInterval: timeIntervalMs,

    // iOS: distancia mínima (Android también la considera)
    distanceInterval: effectiveDistanceInterval,

    // iOS: barra azul
    showsBackgroundLocationIndicator: showsIndicatorIOS,

    // evita que iOS pause automáticamente si el dispositivo está quieto
    pausesUpdatesAutomatically: false,

    activityType: Location.ActivityType.Other,

    // Android foreground service obligatorio
    foregroundService: {
      notificationTitle: 'Nearsy is updating your location',
      notificationBody: 'Visible to nearby users while you use the app',
    },

    // iOS: entregas inmediatas
    deferredUpdatesInterval: 0,
    deferredUpdatesDistance: 0,
  });
}

export async function stopBackgroundLocation() {
  try {
    const hasStarted =
      await Location.hasStartedLocationUpdatesAsync(BG_LOCATION_TASK);

    if (hasStarted) {
      await Location.stopLocationUpdatesAsync(BG_LOCATION_TASK);
    }
  } finally {
    await AsyncStorage.removeItem('NEARSY_BG_UID');
  }
}

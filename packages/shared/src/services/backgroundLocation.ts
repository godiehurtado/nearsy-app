// src/services/backgroundLocation.ts

import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { BG_LOCATION_TASK } from '../background/locationTask';

type StartOpts = {
  uid: string;
  accuracy?: Location.Accuracy;
  distanceInterval?: number; // metros mínimos para disparar update
  timeIntervalMs?: number; // ms mínimos entre updates (Android respeta más este)
  showsIndicatorIOS?: boolean;
  /**
   * When false, only checks existing permissions (no native prompts).
   * Used by gated runtime sync after education / Settings return.
   */
  requestPermissions?: boolean;
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

/**
 * Check/request FG + Always without starting the background task.
 * Callers that only need permission (education → Always) must use this so a
 * Visibility=OFF preference cannot briefly start updates.
 */
export async function ensureBackgroundLocationPermissions(
  requestPermissions = true,
): Promise<void> {
  let fg = await Location.getForegroundPermissionsAsync();
  if (fg.status !== 'granted') {
    if (
      requestPermissions &&
      (fg.status === 'undetermined' || fg.canAskAgain)
    ) {
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
    if (
      requestPermissions &&
      (bg.status === 'undetermined' || bg.canAskAgain)
    ) {
      bg = await Location.requestBackgroundPermissionsAsync();
    }
  }
  // Re-read effective status — iOS may defer/dismiss Always without granting.
  bg = await Location.getBackgroundPermissionsAsync();
  if (bg.status !== 'granted') {
    throw new BackgroundLocationPermissionError({
      code: 'background-denied',
      canAskAgain: !!bg.canAskAgain,
    });
  }
}

export async function startBackgroundLocation({
  uid,
  accuracy = Location.Accuracy.Highest,
  distanceInterval = 1,
  timeIntervalMs = 15_000,
  showsIndicatorIOS = true,
  requestPermissions = true,
}: StartOpts) {
  if (!uid) {
    throw new Error('Missing uid for background location');
  }

  // Guarda uid para que la Task lo recupere (must match authenticated account)
  await AsyncStorage.setItem('NEARSY_BG_UID', uid);

  await ensureBackgroundLocationPermissions(requestPermissions);

  // ===== Reinicia la task para aplicar SIEMPRE la configuración nueva =====

  const hasStarted =
    await Location.hasStartedLocationUpdatesAsync(BG_LOCATION_TASK);

  if (hasStarted) {
    await Location.stopLocationUpdatesAsync(BG_LOCATION_TASK);
  }

  // ===== Inicia tracking =====

  const distanceIntervalForPlatform =
    Platform.OS === 'ios' ? 0 : distanceInterval;

  await Location.startLocationUpdatesAsync(BG_LOCATION_TASK, {
    accuracy,

    // Android: intervalo mínimo
    timeInterval: timeIntervalMs,

    // iOS: 0 = no movement gate (GPS drift can refresh while stationary)
    // Android: caller distanceInterval (default 1 m)
    distanceInterval: distanceIntervalForPlatform,

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

/** True when Expo has an active background location updates registration. */
export async function isBackgroundLocationTaskRunning(): Promise<boolean> {
  try {
    return await Location.hasStartedLocationUpdatesAsync(BG_LOCATION_TASK);
  } catch {
    return false;
  }
}

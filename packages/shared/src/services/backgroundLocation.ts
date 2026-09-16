// src/services/backgroundLocation.ts

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

  // ===== Permisos =====

  const fg = await Location.requestForegroundPermissionsAsync();

  if (fg.status !== 'granted') {
    throw new Error('Foreground location permission not granted');
  }

  const bg = await Location.requestBackgroundPermissionsAsync();

  if (bg.status !== 'granted') {
    throw new Error('Background location permission not granted');
  }

  // ===== Reinicia la task para aplicar SIEMPRE la configuración nueva =====

  const hasStarted =
    await Location.hasStartedLocationUpdatesAsync(BG_LOCATION_TASK);

  if (hasStarted) {
    await Location.stopLocationUpdatesAsync(BG_LOCATION_TASK);
  }

  // ===== Inicia tracking =====

  await Location.startLocationUpdatesAsync(BG_LOCATION_TASK, {
    accuracy,

    // Android: intervalo mínimo
    timeInterval: timeIntervalMs,

    // iOS: distancia mínima (Android también la considera)
    distanceInterval,

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

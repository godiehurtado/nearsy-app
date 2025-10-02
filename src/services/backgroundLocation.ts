// src/services/backgroundLocation.ts
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BG_LOCATION_TASK } from '../background/locationTask';

type StartOpts = {
  uid: string;
  accuracy?: Location.Accuracy;
  distanceInterval?: number; // metros mínimos para disparar update
  timeIntervalMs?: number; // ms mínimos entre updates (Android respeta más este)
  showsIndicatorIOS?: boolean;
};

export async function startBackgroundLocation({
  uid,
  accuracy = Location.Accuracy.Balanced,
  distanceInterval = 20,
  timeIntervalMs = 60_000,
  showsIndicatorIOS = true,
}: StartOpts) {
  if (!uid) throw new Error('Missing uid for background location');

  // Guarda uid para que la Task lo recupere
  await AsyncStorage.setItem('NEARSY_BG_UID', uid);

  // Permisos
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted')
    throw new Error('Foreground location permission not granted');

  const bg = await Location.requestBackgroundPermissionsAsync();
  if (bg.status !== 'granted')
    throw new Error('Background location permission not granted');

  // Evita duplicados
  const isRunning = await TaskManager.isTaskRegisteredAsync(BG_LOCATION_TASK);
  const hasStarted = await Location.hasStartedLocationUpdatesAsync(
    BG_LOCATION_TASK,
  );
  if (isRunning && hasStarted) return;

  await Location.startLocationUpdatesAsync(BG_LOCATION_TASK, {
    accuracy,
    timeInterval: timeIntervalMs, // Android: intervalo mínimo
    distanceInterval, // iOS: distancia mínima (Android también la considera)
    showsBackgroundLocationIndicator: showsIndicatorIOS, // iOS: barra azul
    pausesUpdatesAutomatically: true, // iOS: pausa si el dispositivo está quieto
    activityType: Location.ActivityType.Fitness,

    // Android: servicio foreground obligatorio p/ BG location
    foregroundService: {
      notificationTitle: 'Nearsy is updating your location',
      notificationBody: 'Visible to nearby users while you use the app',
    },
    // iOS: permite entregas en lotes si el SO decide consolidarlas
    deferredUpdatesInterval: 2 * 60 * 1000,
    deferredUpdatesDistance: 50,
  });
}

export async function stopBackgroundLocation() {
  try {
    const hasStarted = await Location.hasStartedLocationUpdatesAsync(
      BG_LOCATION_TASK,
    );
    if (hasStarted) {
      await Location.stopLocationUpdatesAsync(BG_LOCATION_TASK);
    }
  } finally {
    await AsyncStorage.removeItem('NEARSY_BG_UID');
  }
}

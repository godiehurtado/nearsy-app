/**
 * App wiring of the push-open coordinator. Lives outside the root component so
 * a remount cannot handle the same tap twice.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import type { NavigationContainerRefWithCurrent } from '@react-navigation/native';

import { firebaseAuth } from '../config/firebaseConfig';
import { trackAlertOpened } from './analytics';
import { createPushOpenCoordinator, isRouteReachable } from './pushOpenCoordinator';

const LAST_HANDLED_KEY = 'NEARSY_LAST_HANDLED_PUSH_RESPONSE';

export function createAlertPushOpens(
  navigationRef: NavigationContainerRefWithCurrent<any>,
) {
  const coordinator = createPushOpenCoordinator({
    now: () => Date.now(),
    currentUid: () => firebaseAuth.currentUser?.uid ?? null,
    canNavigate: () =>
      navigationRef.isReady() &&
      isRouteReachable(navigationRef.getRootState(), 'Home'),
    // DiscoveryProfile uses getDiscoveryProfile (no peer users/{uid} read).
    openProfile: (actorUid) =>
      (navigationRef as any).navigate('Home', {
        screen: 'DiscoveryProfile',
        params: { uid: actorUid },
      }),
    emitOpened: (alertId) => trackAlertOpened('push', alertId),
    readLastHandledId: () => AsyncStorage.getItem(LAST_HANDLED_KEY),
    writeLastHandledId: (id) => AsyncStorage.setItem(LAST_HANDLED_KEY, id),
  });
  return {
    ...coordinator,
    /** Handles the tap that launched the app, once the JS side is up. */
    async startColdOpen(): Promise<void> {
      const response = await Notifications.getLastNotificationResponseAsync();
      if (response) await coordinator.handleInitialResponse(response);
    },
  };
}

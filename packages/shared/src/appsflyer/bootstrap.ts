/**
 * App wiring for AppsFlyer/OneLink (contract nc1). Called once from App.tsx.
 * Off (returns immediately) unless the build switched AppsFlyer on.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

import { handleOneLinkTouch } from '../analytics';
import { loadAppsFlyerSdk } from './appsFlyerSdk';
import { resolveAppsFlyerRuntimeConfig, startAppsFlyerRuntime } from './appsFlyerRuntime';
import type { OneLinkDestination } from './oneLinkContract';
import { createPendingDestinationStore } from './pendingDestination';

/** Closed list → existing tabs, no parameters (C6). */
export const DESTINATION_TABS: Record<OneLinkDestination, 'Home' | 'Profile' | 'Alerts'> = {
  home: 'Home',
  profile: 'Profile',
  alerts: 'Alerts',
};

type NavigationPort = {
  isReady(): boolean;
  getRootState(): { index?: number; routes: { name: string }[] } | undefined;
  navigate(...args: any[]): void;
  addListener(event: 'state' | 'ready', cb: () => void): () => void;
};

type AuthPort = {
  currentUid(): string | null;
  onChange(cb: (uid: string | null) => void): () => void;
};

/** True once the signed-in user is in MainTabs, i.e. past login and the CRJ. */
export function isInMainTabs(nav: NavigationPort): boolean {
  if (!nav.isReady()) return false;
  const state = nav.getRootState();
  if (!state) return false;
  const focused = state.routes[state.index ?? state.routes.length - 1];
  return focused?.name === 'MainTabs';
}

let started = false;

export function startNearsyAppsFlyer(nav: NavigationPort, auth: AuthPort): void {
  if (started) return;
  const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;
  const config = resolveAppsFlyerRuntimeConfig(
    extra,
    typeof extra.EXPO_PUBLIC_NEARSY_FIREBASE_ENV === 'string'
      ? extra.EXPO_PUBLIC_NEARSY_FIREBASE_ENV
      : process.env.EXPO_PUBLIC_NEARSY_FIREBASE_ENV,
  );
  if (!config.enabled) return;
  started = true;

  const destinations = createPendingDestinationStore(AsyncStorage, () => Date.now());
  let consuming = false;

  const tryConsume = () => {
    const uid = auth.currentUid();
    if (!uid || consuming || !isInMainTabs(nav)) return;
    consuming = true;
    void destinations
      .take(uid)
      .then((key) => {
        if (!key || auth.currentUid() !== uid || !isInMainTabs(nav)) return;
        nav.navigate('MainTabs', { screen: DESTINATION_TABS[key] });
      })
      .catch(() => {})
      .finally(() => {
        consuming = false;
      });
  };

  let lastUid: string | null = auth.currentUid();
  auth.onChange((uid) => {
    if (!uid) {
      // Only a real sign-out clears; a guest first launch must keep a deferred destination.
      if (lastUid) void destinations.clear().catch(() => {});
      lastUid = null;
      return;
    }
    lastUid = uid;
    void destinations
      .noteAccount(uid)
      .then(tryConsume)
      .catch(() => {});
  });
  nav.addListener('state', tryConsume);
  nav.addListener('ready', tryConsume);

  startAppsFlyerRuntime({
    config,
    loadSdk: loadAppsFlyerSdk,
    now: () => Date.now(),
    currentUid: () => auth.currentUid(),
    onAttribution: handleOneLinkTouch,
    onDestination: (input) => {
      void destinations
        .capture(input)
        .then(tryConsume)
        .catch(() => {});
    },
  });
}

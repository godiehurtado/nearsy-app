/**
 * More › iPhone notifications row state. Reads the permission on mount and on
 * every return to the foreground (including back from Settings); requests it
 * only from the row's tap, and only when iOS has never asked.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Linking } from 'react-native';
import * as Notifications from 'expo-notifications';

import { registerPushToken } from '../services/pushTokens';
import {
  buildNotificationPermissionRow,
  handleNotificationPermissionTap,
  readNotificationPermission,
  refreshNotificationPermission,
  type NotificationPermissionIO,
  type NotificationPermissionState,
} from './notificationPermission';

export function createNotificationPermissionIO(): NotificationPermissionIO {
  return {
    read: () => Notifications.getPermissionsAsync(),
    request: () =>
      Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowBadge: true, allowSound: true },
      }),
    openSettings: () => Linking.openSettings(),
    registerToken: () => registerPushToken(),
  };
}

export function useNotificationPermissionRow(enabled: boolean) {
  const io = useMemo(createNotificationPermissionIO, []);
  const [state, setState] = useState<NotificationPermissionState | null>(null);
  const [busy, setBusy] = useState(false);
  const stateRef = useRef<NotificationPermissionState | null>(null);
  const appStateRef = useRef(AppState.currentState);

  const apply = useCallback((next: NotificationPermissionState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    void readNotificationPermission(io).then((next) => {
      if (alive) apply(next);
    });
    const sub = AppState.addEventListener('change', (next) => {
      const wasBackground = /inactive|background/.test(appStateRef.current);
      appStateRef.current = next;
      if (!wasBackground || next !== 'active') return;
      const previous = stateRef.current ?? 'unknown';
      void refreshNotificationPermission(previous, io).then((fresh) => {
        if (alive) apply(fresh);
      });
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, [enabled, io, apply]);

  const onPress = useCallback(async () => {
    if (busy || !stateRef.current) return;
    setBusy(true);
    try {
      const result = await handleNotificationPermissionTap(stateRef.current, io);
      apply(result.state);
    } finally {
      setBusy(false);
    }
  }, [busy, io, apply]);

  const row = state ? buildNotificationPermissionRow(state) : null;
  return { state, row, busy, onPress };
}

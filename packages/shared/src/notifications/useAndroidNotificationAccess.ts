import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Application from 'expo-application';

import { withOwnExternalFlow } from '../analytics/ownExternalFlow.ts';
import { registerPushToken } from '../services/pushTokens';
import {
  NOTIFICATION_CHANNEL_ID,
  notificationAccessAction,
  resolveNotificationAccess,
  settingsIntentFor,
  shouldRegisterAfter,
  type NotificationAccessAction,
  type NotificationAccessState,
} from './notificationAccessCore.ts';

function apiLevel(): number {
  return typeof Platform.Version === 'number' ? Platform.Version : Number(Platform.Version) || 0;
}

async function readAccess(): Promise<NotificationAccessState> {
  try {
    const permission = await Notifications.getPermissionsAsync();
    let channelImportance: number | null = null;
    try {
      const channel = await Notifications.getNotificationChannelAsync(NOTIFICATION_CHANNEL_ID);
      channelImportance = channel?.importance ?? null;
    } catch {
      channelImportance = null;
    }
    return resolveNotificationAccess({
      apiLevel: apiLevel(),
      permission: {
        status: permission.status,
        granted: permission.granted,
        canAskAgain: permission.canAskAgain,
      },
      channelImportance,
    });
  } catch {
    return 'unknown';
  }
}

async function openSettings(
  action: 'open_app_notification_settings' | 'open_channel_settings',
): Promise<void> {
  const target = settingsIntentFor(action, apiLevel(), Application.applicationId);
  if (target.kind === 'intent') {
    try {
      await withOwnExternalFlow(() => Linking.sendIntent(target.action, target.extras));
      return;
    } catch {
      // Some vendors do not export these screens; App info always exists.
    }
  }
  await withOwnExternalFlow(() => Linking.openSettings());
}

/**
 * Notification access for the More row (Android only). Reads on mount and when
 * the app returns to the foreground; never prompts by itself.
 */
export function useAndroidNotificationAccess(enabled: boolean = Platform.OS === 'android') {
  const [state, setState] = useState<NotificationAccessState | null>(null);
  const [busy, setBusy] = useState(false);
  const stateRef = useRef<NotificationAccessState | null>(null);
  const returningFromSettings = useRef(false);
  const mounted = useRef(true);

  const apply = useCallback(async (next: NotificationAccessState, userActed: boolean) => {
    const previous = stateRef.current;
    stateRef.current = next;
    if (mounted.current) setState(next);
    if (shouldRegisterAfter(previous, next, userActed)) {
      // Errors are handled inside; a failed registration is retried at next session restore.
      await registerPushToken();
    }
  }, []);

  const refresh = useCallback(
    async (userActed = false) => {
      if (!enabled) return;
      await apply(await readAccess(), userActed);
    },
    [apply, enabled],
  );

  useEffect(() => {
    mounted.current = true;
    if (!enabled) return undefined;
    void refresh();
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      const acted = returningFromSettings.current;
      returningFromSettings.current = false;
      void refresh(acted);
    });
    return () => {
      mounted.current = false;
      sub.remove();
    };
  }, [enabled, refresh]);

  const action: NotificationAccessAction = state ? notificationAccessAction(state) : 'none';

  /** False when the action could not run, so the screen can say so. */
  const run = useCallback(async (): Promise<boolean> => {
    if (!enabled || busy || !stateRef.current) return true;
    const current = notificationAccessAction(stateRef.current);
    setBusy(true);
    try {
      if (current === 'request') {
        const result = await withOwnExternalFlow(() => Notifications.requestPermissionsAsync());
        await apply(
          resolveNotificationAccess({
            apiLevel: apiLevel(),
            permission: {
              status: result.status,
              granted: result.granted,
              canAskAgain: result.canAskAgain,
            },
            channelImportance: null,
          }),
          true,
        );
        // The channel may still be off: read it now that the prompt is gone.
        await refresh(true);
      } else if (current === 'open_app_notification_settings' || current === 'open_channel_settings') {
        returningFromSettings.current = true;
        await openSettings(current);
      } else if (current === 'refresh') {
        await refresh();
      }
      return true;
    } catch {
      returningFromSettings.current = false;
      await refresh();
      return false;
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, [apply, busy, enabled, refresh]);

  return { state, action, busy, run };
}

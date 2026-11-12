/**
 * Android notification access as More shows it. Free of React Native imports.
 *
 * Android has three separate switches, and expo-notifications 0.32 reports
 * them like this:
 * - Runtime permission POST_NOTIFICATIONS (Android 13+, API 33). `granted` is
 *   that permission alone.
 * - Notifications for the app (every version). When they are off, `status`
 *   is 'denied' even if the runtime permission is granted.
 * - The channel pushes use. Nearsy pushes go through Expo without a
 *   channelId, so they land on 'default', created at startup (App.tsx).
 *   Channels exist from API 26.
 *
 * Before Android 13 there is no prompt: requesting only reads the state.
 */

export const NOTIFICATION_CHANNEL_ID = 'default';
export const ANDROID_RUNTIME_PERMISSION_API = 33;
export const ANDROID_CHANNELS_API = 26;
/** expo-notifications AndroidImportance.NONE: the person turned the channel off. */
const IMPORTANCE_NONE = 2;

export type NotificationAccessState =
  | 'enabled'
  /** Android 13+: never asked, or asked and dismissed; the prompt can still show. */
  | 'not_requested'
  /** Android 13+: denied and the system will not prompt again. */
  | 'denied'
  /** Notifications for Nearsy turned off in system settings. */
  | 'app_off'
  /** The channel Nearsy pushes use is turned off. */
  | 'channel_off'
  /** The state could not be read. */
  | 'unknown';

export type NotificationAccessAction =
  | 'none'
  | 'request'
  | 'open_app_notification_settings'
  | 'open_channel_settings'
  | 'refresh';

export interface NotificationPermissionRead {
  status: string;
  granted: boolean;
  canAskAgain: boolean;
}

export function resolveNotificationAccess(input: {
  apiLevel: number;
  permission: NotificationPermissionRead | null;
  /** Importance of the push channel; null when it does not exist or channels do not. */
  channelImportance: number | null;
}): NotificationAccessState {
  const { permission } = input;
  if (!permission) return 'unknown';
  if (permission.status === 'granted') {
    return input.apiLevel >= ANDROID_CHANNELS_API && input.channelImportance === IMPORTANCE_NONE
      ? 'channel_off'
      : 'enabled';
  }
  if (input.apiLevel < ANDROID_RUNTIME_PERMISSION_API) return 'app_off';
  // The runtime permission is granted, yet notifications are off: only Settings helps.
  if (permission.granted) return 'app_off';
  return permission.canAskAgain ? 'not_requested' : 'denied';
}

export function notificationAccessAction(state: NotificationAccessState): NotificationAccessAction {
  switch (state) {
    case 'enabled':
      return 'none';
    case 'not_requested':
      return 'request';
    case 'denied':
    case 'app_off':
      return 'open_app_notification_settings';
    case 'channel_off':
      return 'open_channel_settings';
    case 'unknown':
      return 'refresh';
  }
}

/** System screen to open for a settings action, by API level. */
export function settingsIntentFor(
  action: 'open_app_notification_settings' | 'open_channel_settings',
  apiLevel: number,
  packageName: string | null,
):
  | { kind: 'intent'; action: string; extras: Array<{ key: string; value: string }> }
  | { kind: 'app_details' } {
  // App notification and channel screens exist from API 26; before, App info.
  if (!packageName || apiLevel < ANDROID_CHANNELS_API) return { kind: 'app_details' };
  const extras = [{ key: 'android.provider.extra.APP_PACKAGE', value: packageName }];
  if (action === 'open_channel_settings') {
    return {
      kind: 'intent',
      action: 'android.settings.CHANNEL_NOTIFICATION_SETTINGS',
      extras: [...extras, { key: 'android.provider.extra.CHANNEL_ID', value: NOTIFICATION_CHANNEL_ID }],
    };
  }
  return { kind: 'intent', action: 'android.settings.APP_NOTIFICATION_SETTINGS', extras };
}

/** Register the push token only when access became enabled through this row. */
export function shouldRegisterAfter(
  previous: NotificationAccessState | null,
  next: NotificationAccessState,
  userActed: boolean,
): boolean {
  return userActed && next === 'enabled' && previous !== 'enabled';
}

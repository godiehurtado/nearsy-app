/**
 * More › Notifications: the iOS notification permission, shown as it really is
 * and recoverable without repeating the CRJ.
 *
 * The OS permission is not the same as the notice-type preferences
 * (notifyNearbyInterests / notifyNearbyContacts): this module only reads,
 * requests (after a user tap) or sends the user to Settings.
 *
 * Pure: the expo-notifications calls are injected.
 */

/** expo-notifications IosAuthorizationStatus (0.32): numeric enum values. */
const IOS_NOT_DETERMINED = 0;
const IOS_DENIED = 1;
const IOS_AUTHORIZED = 2;
const IOS_PROVISIONAL = 3;
const IOS_EPHEMERAL = 4;

export type NotificationPermissionState =
  | 'notDetermined'
  | 'authorized'
  | 'provisional'
  | 'ephemeral'
  | 'denied'
  | 'unknown';

export type PermissionSnapshot = {
  status?: unknown;
  granted?: unknown;
  ios?: { status?: unknown } | null;
} | null | undefined;

export function resolveNotificationPermissionState(
  snapshot: PermissionSnapshot,
): NotificationPermissionState {
  if (!snapshot || typeof snapshot !== 'object') return 'unknown';
  const ios = snapshot.ios?.status;
  if (typeof ios === 'number') {
    switch (ios) {
      case IOS_NOT_DETERMINED:
        return 'notDetermined';
      case IOS_DENIED:
        return 'denied';
      case IOS_AUTHORIZED:
        return 'authorized';
      case IOS_PROVISIONAL:
        return 'provisional';
      case IOS_EPHEMERAL:
        return 'ephemeral';
      default:
        break;
    }
  }
  if (snapshot.status === 'undetermined') return 'notDetermined';
  if (snapshot.status === 'denied') return 'denied';
  if (snapshot.status === 'granted' || snapshot.granted === true) return 'authorized';
  return 'unknown';
}

/** Push delivery works in these states, so the token should be registered. */
export function allowsPushDelivery(state: NotificationPermissionState): boolean {
  return state === 'authorized' || state === 'provisional' || state === 'ephemeral';
}

export type NotificationPermissionAction = 'request' | 'openSettings' | 'none';

export type NotificationPermissionRow = {
  /** i18n key for the short status value. */
  valueKey: string;
  /** i18n key for the explanation under it. */
  noteKey: string;
  action: NotificationPermissionAction;
};

const KEY = 'settings.notificationPermission';

export function buildNotificationPermissionRow(
  state: NotificationPermissionState,
): NotificationPermissionRow {
  switch (state) {
    case 'notDetermined':
      return { valueKey: `${KEY}.values.notDetermined`, noteKey: `${KEY}.notes.notDetermined`, action: 'request' };
    case 'denied':
      return { valueKey: `${KEY}.values.denied`, noteKey: `${KEY}.notes.denied`, action: 'openSettings' };
    case 'provisional':
      return { valueKey: `${KEY}.values.provisional`, noteKey: `${KEY}.notes.provisional`, action: 'openSettings' };
    case 'authorized':
    case 'ephemeral':
      return { valueKey: `${KEY}.values.authorized`, noteKey: `${KEY}.notes.authorized`, action: 'openSettings' };
    default:
      return { valueKey: `${KEY}.values.unknown`, noteKey: `${KEY}.notes.unknown`, action: 'none' };
  }
}

export type NotificationPermissionIO = {
  read: () => Promise<PermissionSnapshot>;
  /** Native prompt; only ever called from a user tap on the row. */
  request: () => Promise<PermissionSnapshot>;
  openSettings: () => Promise<void>;
  /** Registers or refreshes this device's push token (non-prompting). */
  registerToken: () => Promise<unknown>;
};

export async function readNotificationPermission(
  io: Pick<NotificationPermissionIO, 'read'>,
): Promise<NotificationPermissionState> {
  try {
    return resolveNotificationPermissionState(await io.read());
  } catch {
    return 'unknown';
  }
}

async function registerIfDeliverable(
  io: NotificationPermissionIO,
  state: NotificationPermissionState,
): Promise<void> {
  if (!allowsPushDelivery(state)) return;
  try {
    await io.registerToken();
  } catch {
    // Token registration retries on the next auth change or Alerts open.
  }
}

export type PermissionTapResult = {
  state: NotificationPermissionState;
  /** True when the user was sent to Settings and a return check is due. */
  awaitingSettingsReturn: boolean;
};

/** The row's tap. Requests only when iOS has never asked. */
export async function handleNotificationPermissionTap(
  current: NotificationPermissionState,
  io: NotificationPermissionIO,
): Promise<PermissionTapResult> {
  const action = buildNotificationPermissionRow(current).action;
  if (action === 'request') {
    let state: NotificationPermissionState;
    try {
      state = resolveNotificationPermissionState(await io.request());
    } catch {
      state = await readNotificationPermission(io);
    }
    await registerIfDeliverable(io, state);
    return { state, awaitingSettingsReturn: false };
  }
  if (action === 'openSettings') {
    try {
      await io.openSettings();
      return { state: current, awaitingSettingsReturn: true };
    } catch {
      return { state: current, awaitingSettingsReturn: false };
    }
  }
  return { state: await readNotificationPermission(io), awaitingSettingsReturn: false };
}

/**
 * On return to the app: re-read the permission and register the token when
 * delivery is now possible. Never requests.
 */
export async function refreshNotificationPermission(
  previous: NotificationPermissionState,
  io: NotificationPermissionIO,
): Promise<NotificationPermissionState> {
  const state = await readNotificationPermission(io);
  if (state !== previous) await registerIfDeliverable(io, state);
  return state;
}

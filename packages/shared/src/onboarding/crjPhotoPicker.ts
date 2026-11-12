/**
 * CRJ profile photo step (iOS): library and camera without silent exits.
 *
 * Pure flow over injected picker calls, so it runs in Node tests.
 *
 * Library: expo-image-picker 17 opens UIImagePickerController for
 * `allowsEditing: true`. iOS runs it out of process (iOS 11+) and the native
 * launchImageLibraryAsync checks no permission, so we open it directly and
 * never ask for general Photos access first. Denied or restricted Photos
 * access therefore no longer blocks picking a profile photo.
 *
 * Camera: the native launchCameraAsync rejects without camera permission,
 * so we request it (iOS returns the stored answer without a prompt once
 * decided) and report a blocked state when it is not granted.
 *
 * Errors carry only a short error code, never the photo or a URI.
 */

export type CrjPhotoSource = 'library' | 'camera';

export type CrjPickerAsset = { uri?: string | null };

export type CrjPickerResult = {
  canceled: boolean;
  assets?: CrjPickerAsset[] | null;
};

export type CrjPermission = { granted: boolean };

export type CrjPhotoPickerDeps = {
  launchLibrary: () => Promise<CrjPickerResult>;
  launchCamera: () => Promise<CrjPickerResult>;
  requestCameraPermission: () => Promise<CrjPermission>;
};

export type CrjPhotoOutcome =
  | { kind: 'picked'; uri: string }
  | { kind: 'canceled' }
  /** Camera access is denied or restricted; Settings may or may not help. */
  | { kind: 'cameraBlocked' }
  | {
      kind: 'error';
      source: CrjPhotoSource;
      stage: 'permission' | 'picker';
      code?: string;
    };

/** Options identical to the CRJ step before this change (crop 1:1, 0.85). */
export const CRJ_PHOTO_PICKER_OPTIONS = {
  allowsEditing: true,
  aspect: [1, 1] as [number, number],
  quality: 0.85,
} as const;

/** Only a short native error code (e.g. ERR_MISSING_VIEW_CONTROLLER). */
export function safeErrorCode(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null | undefined)?.code;
  return typeof code === 'string' && /^[A-Za-z0-9_.-]{1,64}$/.test(code)
    ? code
    : undefined;
}

function toOutcome(result: CrjPickerResult | null | undefined): CrjPhotoOutcome {
  const uri = result && !result.canceled ? result.assets?.[0]?.uri : undefined;
  return typeof uri === 'string' && uri.length > 0
    ? { kind: 'picked', uri }
    : { kind: 'canceled' };
}

export async function runCrjIosPhotoPick(
  source: CrjPhotoSource,
  deps: CrjPhotoPickerDeps,
): Promise<CrjPhotoOutcome> {
  if (source === 'camera') {
    let permission: CrjPermission;
    try {
      permission = await deps.requestCameraPermission();
    } catch (error) {
      return { kind: 'error', source, stage: 'permission', code: safeErrorCode(error) };
    }
    if (!permission?.granted) return { kind: 'cameraBlocked' };
  }
  try {
    const result =
      source === 'camera' ? await deps.launchCamera() : await deps.launchLibrary();
    return toOutcome(result);
  } catch (error) {
    return { kind: 'error', source, stage: 'picker', code: safeErrorCode(error) };
  }
}

type Translate = (key: string, options?: Record<string, unknown>) => string;

export type CrjAlertButton = {
  text: string;
  style?: 'cancel' | 'default';
  onPress?: () => void;
};

export type CrjPhotoAlert = {
  title: string;
  message: string;
  buttons: CrjAlertButton[];
};

const KEY = 'onboarding.profileCompletion.info.access';

/** What to show for an outcome; null for picked/canceled (no message). */
export function crjPhotoOutcomeAlert(
  outcome: CrjPhotoOutcome,
  t: Translate,
  openSettings: () => void,
): CrjPhotoAlert | null {
  if (outcome.kind === 'cameraBlocked') {
    return {
      title: t(`${KEY}.cameraBlockedTitle`),
      message: t(`${KEY}.cameraBlockedBody`),
      buttons: [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t(`${KEY}.openSettings`), onPress: openSettings },
      ],
    };
  }
  if (outcome.kind === 'error') {
    const camera = outcome.source === 'camera';
    return {
      title: t(camera ? `${KEY}.cameraErrorTitle` : `${KEY}.libraryErrorTitle`),
      message: t(`${KEY}.errorBody`),
      buttons: [{ text: t('common.buttons.ok') }],
    };
  }
  return null;
}

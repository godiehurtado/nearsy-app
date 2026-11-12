/**
 * Picking one image from the device library with the system photo picker.
 *
 * Android: expo-image-picker opens the system photo picker (PickVisualMedia,
 * or its Play services backport before Android 13). It needs no storage or
 * media permission, so none is requested first and the manifest declares no
 * READ_MEDIA_* permission (Google Play photo and video permissions policy).
 *
 * Other platforms keep their existing permission request.
 *
 * Free of React Native imports so the decision can be tested in Node.
 */

export type SystemImagePickOutcome =
  | { kind: 'picked'; uri: string }
  | { kind: 'canceled' }
  /** Only outside Android, where the library permission is still requested. */
  | { kind: 'denied' };

export interface SystemImagePickOptions {
  allowsEditing?: boolean;
  aspect?: [number, number];
  quality?: number;
}

interface PickerResultLike {
  canceled: boolean;
  assets?: Array<{ uri?: string | null }> | null;
}

export interface SystemImagePickerPort {
  requestMediaLibraryPermissionsAsync(): Promise<{ granted: boolean }>;
  launchImageLibraryAsync(options: Record<string, unknown>): Promise<PickerResultLike>;
  /** Images only: the picker never offers videos. */
  imagesMediaType: unknown;
}

/** Thrown when the picker reports success without an image. */
export class SystemImagePickerEmptyResultError extends Error {
  constructor() {
    super('image-picker-empty-result');
    this.name = 'SystemImagePickerEmptyResultError';
  }
}

type FlowWrapper = <T>(run: () => T | Promise<T>) => Promise<T>;

/**
 * Cancel resolves to `canceled`. A picker failure rejects, so each caller
 * shows its own error instead of failing silently.
 */
export async function pickImageWithSystemPicker(
  port: SystemImagePickerPort,
  platformOS: string,
  options: SystemImagePickOptions,
  wrap: FlowWrapper = async (run) => run(),
): Promise<SystemImagePickOutcome> {
  if (platformOS !== 'android') {
    const perm = await wrap(() => port.requestMediaLibraryPermissionsAsync());
    if (!perm.granted) return { kind: 'denied' };
  }
  const result = await wrap(() =>
    port.launchImageLibraryAsync({ ...options, mediaTypes: port.imagesMediaType }),
  );
  if (result.canceled) return { kind: 'canceled' };
  const uri = result.assets?.[0]?.uri;
  if (!uri) throw new SystemImagePickerEmptyResultError();
  return { kind: 'picked', uri };
}

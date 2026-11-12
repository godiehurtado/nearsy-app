import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { withOwnExternalFlow } from '../analytics/ownExternalFlow.ts';
import {
  pickImageWithSystemPicker,
  type SystemImagePickOptions,
  type SystemImagePickOutcome,
} from './systemImagePickerCore.ts';

export type { SystemImagePickOptions, SystemImagePickOutcome } from './systemImagePickerCore.ts';

/** One image from the system photo picker; see systemImagePickerCore.ts. */
export function pickImageFromSystemLibrary(
  options: SystemImagePickOptions,
): Promise<SystemImagePickOutcome> {
  return pickImageWithSystemPicker(
    {
      requestMediaLibraryPermissionsAsync: () => ImagePicker.requestMediaLibraryPermissionsAsync(),
      launchImageLibraryAsync: (opts) =>
        ImagePicker.launchImageLibraryAsync(opts as ImagePicker.ImagePickerOptions),
      imagesMediaType: ImagePicker.MediaTypeOptions.Images,
    },
    Platform.OS,
    options,
    withOwnExternalFlow,
  );
}

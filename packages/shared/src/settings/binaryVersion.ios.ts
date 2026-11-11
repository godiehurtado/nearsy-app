import { formatBinaryVersion, type BinaryVersion } from './binaryVersion';

export { formatBinaryVersion, type BinaryVersion } from './binaryVersion';

/** CFBundleShortVersionString and CFBundleVersion of the installed binary. */
export function readBinaryVersion(): BinaryVersion | null {
  try {
    const Application = require('expo-application') as typeof import('expo-application');
    return formatBinaryVersion(
      Application.nativeApplicationVersion,
      Application.nativeBuildVersion,
    );
  } catch {
    return null;
  }
}

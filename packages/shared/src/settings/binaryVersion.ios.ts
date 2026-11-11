// Explicit .ts: on iOS, './binaryVersion' resolves to this file itself.
import { formatBinaryVersion, type BinaryVersion } from './binaryVersion.ts';

export { formatBinaryVersion, type BinaryVersion } from './binaryVersion.ts';

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

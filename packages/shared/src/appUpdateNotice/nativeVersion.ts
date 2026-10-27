/**
 * Installed native marketing version (iOS CFBundleShortVersionString).
 * Never use the JS bundle / Expo manifest version.
 */

export function readInstalledNativeVersionFromConstants(constants: {
  nativeAppVersion?: unknown;
  expoConfig?: { version?: unknown } | null;
}): string | null {
  const native = constants.nativeAppVersion;
  if (typeof native === 'string' && native.trim()) return native.trim();
  return null;
}

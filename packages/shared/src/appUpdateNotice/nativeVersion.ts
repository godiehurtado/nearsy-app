/**
 * Installed native marketing version (iOS CFBundleShortVersionString).
 *
 * Source: expo-application `nativeApplicationVersion`, which its iOS module
 * reads from the bundle Info.plist. Never the Expo app config version and
 * never a remote update manifest.
 *
 * 2.0.9 and 2.0.10 read `Constants.nativeAppVersion`, which expo-constants
 * removed in 16.0.0 (the app ships 18.x), so the version was always null and
 * the notice was always skipped.
 */

/** Dotted numeric marketing version, as compare.ts accepts it. */
const MARKETING_VERSION = /^\d+(\.\d+){0,3}$/;

export type InstalledVersionSource = { nativeApplicationVersion?: unknown };

export function readInstalledNativeVersionFromApplication(
  application: InstalledVersionSource | null | undefined,
): string | null {
  const raw = application?.nativeApplicationVersion;
  if (typeof raw !== 'string') return null;
  const version = raw.trim();
  return MARKETING_VERSION.test(version) ? version : null;
}

/**
 * Reads the installed version; null (notice skipped, app unaffected) when the
 * module is missing, throws, or reports an empty or invalid value.
 */
export function readInstalledNativeVersion(
  loadApplication: () => InstalledVersionSource | null | undefined = () =>
    require('expo-application') as typeof import('expo-application'),
): string | null {
  try {
    return readInstalledNativeVersionFromApplication(loadApplication());
  } catch {
    return null;
  }
}

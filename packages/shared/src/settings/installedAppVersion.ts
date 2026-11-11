/**
 * Version of the installed binary, read at runtime from the native package
 * (versionName and versionCode on Android). Never a value written in the app.
 */
export type InstalledAppVersion = { version: string; build: string };

type ApplicationModule = {
  nativeApplicationVersion?: string | null;
  nativeBuildVersion?: string | null;
};

/** Both values or none: a half-known version is not shown. */
export function resolveInstalledAppVersion(
  application: ApplicationModule | null | undefined,
): InstalledAppVersion | null {
  const version = application?.nativeApplicationVersion?.trim();
  const build = application?.nativeBuildVersion?.trim();
  return version && build ? { version, build } : null;
}

/** "2.0.10 (48)". */
export function formatInstalledAppVersion(installed: InstalledAppVersion): string {
  return `${installed.version} (${installed.build})`;
}

export function readInstalledAppVersion(): InstalledAppVersion | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return resolveInstalledAppVersion(require('expo-application') as ApplicationModule);
  } catch {
    return null;
  }
}

/**
 * Installed native marketing version + build.
 * Never use the JS bundle / Expo manifest version alone.
 */

export type InstalledNativeRelease = {
  marketingVersion: string;
  build: string;
};

type NativeVersionConstants = {
  nativeAppVersion?: unknown;
  nativeBuildVersion?: unknown;
  expoConfig?: { version?: unknown } | null;
};

export function readInstalledNativeVersionFromConstants(
  constants: NativeVersionConstants,
): string | null {
  const native = constants.nativeAppVersion;
  if (typeof native === 'string' && native.trim()) return native.trim();
  return null;
}

export function readInstalledNativeReleaseFromConstants(
  constants: NativeVersionConstants,
): InstalledNativeRelease | null {
  const marketingVersion = readInstalledNativeVersionFromConstants(constants);
  if (!marketingVersion) return null;
  const buildRaw = constants.nativeBuildVersion;
  const build =
    typeof buildRaw === 'string' && buildRaw.trim()
      ? buildRaw.trim()
      : typeof buildRaw === 'number' && Number.isFinite(buildRaw)
        ? String(Math.trunc(buildRaw))
        : '0';
  return { marketingVersion, build };
}

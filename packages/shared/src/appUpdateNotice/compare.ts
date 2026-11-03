/**
 * Numeric component comparison for marketing versions and builds.
 * Lexicographic (version first, then build) per Functions CONTRACT v2.
 */

export type VersionCompareResult = -1 | 0 | 1;

const NUMERIC_VERSION = /^\d+(\.\d+)*$/;

function toComponents(raw: string): number[] | null {
  const trimmed = raw.trim();
  if (!NUMERIC_VERSION.test(trimmed)) return null;
  const parts = trimmed.split('.').map((part) => Number(part));
  if (parts.some((n) => !Number.isInteger(n) || n < 0)) return null;
  return parts;
}

export function compareNumericAppVersions(
  left: string,
  right: string,
): VersionCompareResult | null {
  const a = toComponents(left);
  const b = toComponents(right);
  if (!a || !b) return null;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av > bv) return 1;
    if (av < bv) return -1;
  }
  return 0;
}

export function isPublicVersionGreater(
  latestVersion: string,
  installedNativeVersion: string,
): boolean {
  return compareNumericAppVersions(latestVersion, installedNativeVersion) === 1;
}

export type InstalledRelease = {
  marketingVersion: string;
  build: string;
};

export type ReleaseTarget = {
  marketingVersion: string;
  build: string;
};

/** True when installed is strictly behind target (version, then build). */
export function isInstalledBehindTarget(
  installed: InstalledRelease,
  target: ReleaseTarget,
): boolean {
  if (!target.marketingVersion || !target.build) return false;
  if (!installed.marketingVersion || !installed.build) return false;
  const v = compareNumericAppVersions(
    target.marketingVersion,
    installed.marketingVersion,
  );
  if (v === null) return false;
  if (v === 1) return true;
  if (v === -1) return false;
  const b = compareNumericAppVersions(target.build, installed.build);
  return b === 1;
}

/**
 * Numeric component comparison for marketing versions (e.g. 2.0.9 vs 2.0.10).
 * Not locale/text compare, not semver prerelease, not CFBundleVersion.
 */

import { isCanonicalAppUpdateVersion } from './contract';

export type VersionCompareResult = -1 | 0 | 1;

function toComponents(raw: string): number[] | null {
  const trimmed = raw.trim();
  if (!isCanonicalAppUpdateVersion(trimmed)) return null;
  const parts = trimmed.split('.').map((part) => Number(part));
  if (parts.some((n) => !Number.isInteger(n) || n < 0)) return null;
  return parts;
}

/**
 * Compare two dotted numeric versions, padding the shorter with zeros
 * (`2.0` equals `2.0.0`). Returns null when either side is not canonical.
 */
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

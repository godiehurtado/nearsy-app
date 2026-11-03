import {
  APP_UPDATE_BUILD_RE,
  APP_UPDATE_VERSION_RE,
  type AppUpdateReleaseTarget,
} from './contract.ts';

export function parseMarketingVersion(
  raw: string | undefined | null,
): string | null {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  return APP_UPDATE_VERSION_RE.test(trimmed) ? trimmed : null;
}

export function parseBuild(raw: string | undefined | null): string | null {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  return APP_UPDATE_BUILD_RE.test(trimmed) ? trimmed : null;
}

/** A fully configured target (both fields valid). */
export function parseReleaseTarget(
  value: AppUpdateReleaseTarget | null | undefined,
): AppUpdateReleaseTarget | null {
  if (!value) return null;
  const marketingVersion = parseMarketingVersion(value.marketingVersion);
  const build = parseBuild(value.build);
  if (!marketingVersion || !build) return null;
  return { marketingVersion, build };
}

function versionParts(version: string): [number, number, number] | null {
  const parsed = parseMarketingVersion(version);
  if (!parsed) return null;
  const parts = parsed.split('.').map((part) => Number(part));
  return [parts[0], parts[1], parts[2]];
}

/** Numeric compare of two non-negative integer strings without precision loss. */
function compareDecimalStrings(left: string, right: string): number {
  if (left.length !== right.length) return left.length - right.length;
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

/**
 * Normative client comparison (CONTRACT.md): marketing version tuple first,
 * then build / versionCode, both numeric. Negative when `left` is older.
 * `null` when either side is not a valid release identity.
 */
export function compareReleases(
  left: AppUpdateReleaseTarget,
  right: AppUpdateReleaseTarget,
): number | null {
  const a = versionParts(left.marketingVersion);
  const b = versionParts(right.marketingVersion);
  const buildA = parseBuild(left.build);
  const buildB = parseBuild(right.build);
  if (!a || !b || buildA == null || buildB == null) return null;
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return compareDecimalStrings(buildA, buildB);
}

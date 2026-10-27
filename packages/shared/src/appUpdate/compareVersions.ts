import { parseStoreVersion } from './parsePolicy.ts';

function components(version: string): [number, number, number] | null {
  const parsed = parseStoreVersion(version);
  if (!parsed) return null;
  const parts = parsed.split('.').map((part) => Number(part));
  if (parts.length !== 3 || parts.some((n) => !Number.isInteger(n))) return null;
  return [parts[0], parts[1], parts[2]];
}

/**
 * Numeric MAJOR.MINOR.PATCH compare. Negative if `left` is older than `right`.
 * `null` when either side is not a public store version.
 */
export function compareStoreVersions(
  left: string,
  right: string,
): number | null {
  const a = components(left);
  const b = components(right);
  if (!a || !b) return null;
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

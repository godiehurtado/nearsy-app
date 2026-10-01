/**
 * Discovery Profile → read-only Interests screen.
 * Only resolved catalog interest IDs cross the navigation boundary (no uid,
 * name or other profile data); the Interests screen resolves them again with
 * the same `resolveInterestChips`, so labels, icons, order and legacy IDs match.
 */
import type { ResolvedInterestChip } from './interestDisplay';

export type DiscoveryInterestsParams = { interestIds: string[] };

/** Entry params when at least one interest resolves; null hides the entry. */
export function buildDiscoveryInterestsParams(
  chips: readonly Pick<ResolvedInterestChip, 'id'>[],
): DiscoveryInterestsParams | null {
  if (chips.length === 0) return null;
  return { interestIds: chips.map((chip) => chip.id) };
}

/** Tolerates missing or malformed params (e.g. restored navigation state). */
export function readDiscoveryInterestIds(params: unknown): string[] {
  const ids = (params as { interestIds?: unknown } | null | undefined)
    ?.interestIds;
  if (!Array.isArray(ids)) return [];
  return ids.filter(
    (id): id is string => typeof id === 'string' && id.length > 0,
  );
}

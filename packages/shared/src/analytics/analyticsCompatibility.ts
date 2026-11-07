import { toKnownScore } from './analyticsContract.ts';

/** The score of an available compatibility; undefined when it is not known. */
export function knownCompatibilityScore(compatibility: unknown): number | undefined {
  const value = compatibility as { available?: unknown; score?: unknown } | null | undefined;
  return value?.available === true ? toKnownScore(value.score) : undefined;
}

export const INTRO_NODE_STAGGER_MS = 90;
export const INTRO_NODE_BASE_DELAY_MS = 220;

export function introNodeEntryDelayMs(
  nodeIndex: number,
  reduceMotion = false,
): number {
  if (reduceMotion) return 0;
  return INTRO_NODE_BASE_DELAY_MS + nodeIndex * INTRO_NODE_STAGGER_MS;
}

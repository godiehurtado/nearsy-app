export const CELEBRATION_BADGE_STAGGER_MS = 90;
export const CELEBRATION_BADGE_BASE_DELAY_MS = 360;
/** Next-up block settles after halo/check, not a second intro. */
export const CELEBRATION_NEXT_UP_DELAY_MS = 720;
export const CELEBRATION_NEXT_UP_TRANSLATE_Y = 8;

export function celebrationEntryDelayMs(badgeIndex: number): number {
  return CELEBRATION_BADGE_BASE_DELAY_MS + badgeIndex * CELEBRATION_BADGE_STAGGER_MS;
}

export function celebrationNextUpDelayMs(reduceMotion = false): number {
  if (reduceMotion) return 0;
  return CELEBRATION_NEXT_UP_DELAY_MS;
}

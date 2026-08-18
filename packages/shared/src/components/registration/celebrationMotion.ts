export const CELEBRATION_BADGE_STAGGER_MS = 90;
export const CELEBRATION_BADGE_BASE_DELAY_MS = 360;

export function celebrationEntryDelayMs(badgeIndex: number): number {
  return CELEBRATION_BADGE_BASE_DELAY_MS + badgeIndex * CELEBRATION_BADGE_STAGGER_MS;
}

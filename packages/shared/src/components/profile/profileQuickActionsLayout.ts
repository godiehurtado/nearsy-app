export const PROFILE_QUICK_ACTIONS_TWO_COLUMN_MIN_WIDTH = 420;

export function shouldUseSingleColumnQuickActions(
  windowWidth: number,
  fontScale = 1,
): boolean {
  if (fontScale >= 1.2) {
    return true;
  }

  return windowWidth < PROFILE_QUICK_ACTIONS_TWO_COLUMN_MIN_WIDTH;
}

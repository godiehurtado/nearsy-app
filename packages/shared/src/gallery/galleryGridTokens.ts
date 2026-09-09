/** Shared gallery admin grid spacing — CRJ + Own Profile editors. */
export const GALLERY_GRID_GAP = 10;
export const GALLERY_TILE_RADIUS = 12;

/**
 * Own Profile post-CRJ Gallery admin grid columns (phone).
 * Visual style may share CRJ tokens; column count is independent.
 * Public discovery projection remains capped at 12 for MVP
 * (`PUBLIC GALLERY 12-PHOTO PROJECTION ACCEPTED FOR MVP`).
 */
export const OWN_PROFILE_GALLERY_COLUMNS = 3;

export function galleryTileSize(
  windowWidth: number,
  columns: number,
  horizontalPadding = 44,
): number {
  const gapTotal = GALLERY_GRID_GAP * (columns - 1);
  return Math.floor((windowWidth - horizontalPadding - gapTotal) / columns);
}

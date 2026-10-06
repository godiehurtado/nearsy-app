/**
 * Pure layout math for the Discovery affiliations wrap grid.
 * ~2 tiles per row on phones, 1 on very narrow widths, up to 3 on wide screens.
 */

export const DISCOVERY_AFFILIATION_TILE_MIN_WIDTH = 120;
export const DISCOVERY_AFFILIATION_MAX_COLUMNS = 3;
export const DISCOVERY_AFFILIATION_DEFAULT_COLUMNS = 2;

export function resolveDiscoveryAffiliationColumns(
  containerWidth: number,
  gap: number,
): number {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) {
    return DISCOVERY_AFFILIATION_DEFAULT_COLUMNS;
  }
  const fit = Math.floor(
    (containerWidth + gap) / (DISCOVERY_AFFILIATION_TILE_MIN_WIDTH + gap),
  );
  return Math.min(DISCOVERY_AFFILIATION_MAX_COLUMNS, Math.max(1, fit));
}

/** Tile width for a measured container; null until the container is measured. */
export function resolveDiscoveryAffiliationTileWidth(
  containerWidth: number,
  gap: number,
): number | null {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) return null;
  const columns = resolveDiscoveryAffiliationColumns(containerWidth, gap);
  return Math.floor((containerWidth - gap * (columns - 1)) / columns);
}

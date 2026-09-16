/** Default proximity thresholds (feet → meters derived). */
export const FEET_PER_METER = 3.28084;

export const MAX_FEET = 200;
export const MAX_METERS = MAX_FEET / FEET_PER_METER;

/** useNearbyAlerts / tab badge radius */
export const NEARBY_RADIUS_FT = 200;
export const NEARBY_RADIUS_KM = NEARBY_RADIUS_FT / FEET_PER_METER / 1000;

/** AlertsScreen list radius */
export const ALERTS_NEARBY_RADIUS_FT = 200;
export const ALERTS_NEARBY_RADIUS_KM =
  ALERTS_NEARBY_RADIUS_FT / FEET_PER_METER / 1000;

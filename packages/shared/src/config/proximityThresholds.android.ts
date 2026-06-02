/** Android platform override (matches default proximity thresholds). */
export const FEET_PER_METER = 3.28084;

export const MAX_FEET = 200;
export const MAX_METERS = MAX_FEET / FEET_PER_METER;

export const NEARBY_RADIUS_FT = 200;
export const NEARBY_RADIUS_KM = NEARBY_RADIUS_FT / FEET_PER_METER / 1000;

export const ALERTS_NEARBY_RADIUS_FT = 200;
export const ALERTS_NEARBY_RADIUS_KM =
  ALERTS_NEARBY_RADIUS_FT / FEET_PER_METER / 1000;

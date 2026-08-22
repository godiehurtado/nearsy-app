/**
 * Visibility Journey — pure client constants (V3.0 + V3.0.1 Contract Freeze).
 * No Firebase / native I/O.
 */

/** Wire contract version for future callables (not wired in V3.2A). */
export const CONTRACT_VERSION = 1 as const;

/** users / discoveryProfiles schema version for Nearsy 2.0 Visibility. */
export const SCHEMA_VERSION = 2 as const;

/** Location freshness TTL: 60 minutes (inclusive). */
export const LOCATION_TTL_MS = 3_600_000;

/**
 * Maximum horizontal accuracy accepted for activate / publish.
 * Configurable in future code; contractual initial value is 100 m.
 */
export const MAX_LOCATION_ACCURACY_METERS = 100;

/** Inclusive discovery age bounds (who I want to find / restrictions). */
export const MIN_VISIBILITY_AGE = 18;
export const MAX_VISIBILITY_AGE = 99;

/** Feet ↔ meters factor frozen in Contract Freeze. */
export const FEET_PER_METER = 3.28084;

/** Canonical distance range in meters (admits US ft UI and metric UI). */
export const MIN_DISTANCE_METERS = 5;
/** 200 ft expressed in meters. */
export const MAX_DISTANCE_METERS = 200 / FEET_PER_METER;

/** US presentation range (feet). */
export const MIN_DISTANCE_FEET = 20;
export const MAX_DISTANCE_FEET = 200;
export const DISTANCE_STEP_FEET = 5;
export const DEFAULT_US_DISTANCE_FEET = 200;

/** Metric presentation range (meters). */
export const MIN_DISTANCE_METERS_UI = 5;
export const MAX_DISTANCE_METERS_UI = 60;
export const DISTANCE_STEP_METERS = 5;
export const DEFAULT_METRIC_DISTANCE_METERS = 60;

/** Default canonical meters when prefs are first created for a US locale. */
export const DEFAULT_US_DISTANCE_METERS = DEFAULT_US_DISTANCE_FEET / FEET_PER_METER;

/** Absolute epsilon for comparing canonical meter values (locale open/close). */
export const CANONICAL_DISTANCE_EPSILON_METERS = 0.01;

/** Discovery MVP list/detail limits (aligned with backend f2855a1). */
export const DEFAULT_DISCOVERY_LIMIT = 50;
export const MAX_DISCOVERY_LIMIT = 50;
export const MAX_GALLERY_ITEMS = 12;

/** Max independent search-interest IDs per profile face. Empty = no filter. */
export const MAX_SEARCH_INTEREST_IDS = 12;

/** Keys forbidden on any client-facing Visibility/Discovery DTO. */
export const FORBIDDEN_CLIENT_DTO_KEYS = [
  'latitude',
  'longitude',
  'lat',
  'lng',
  'geohash',
  'email',
  'phone',
  'blockedContacts',
  'blockedUids',
  'searchPreferences',
  'ageMin',
  'ageMax',
  'maxDistanceMeters',
] as const;

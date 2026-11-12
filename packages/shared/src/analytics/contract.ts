/**
 * Nearsy analytics contract: the only events and properties that may leave the
 * app. Anything absent here is dropped by the client and by the PostHog
 * `before_send` guard. Excluded on purpose: gender, seniority,
 * monetization events and `event_cohort` (assigned by the server).
 *
 * Pure module: no React Native or Expo imports.
 */

export const TRACKING_PLAN_VERSION = '2026-11-07.1';

export type PropertyRule =
  | { kind: 'boolean' }
  /** Only ever true: a false can never overwrite the classification. */
  | { kind: 'trueOnly' }
  | { kind: 'int'; min: number; max: number }
  | { kind: 'number'; min: number; max: number }
  | { kind: 'enum'; values: readonly string[] }
  | { kind: 'id'; maxLength: number }
  | { kind: 'text'; maxLength: number }
  | { kind: 'email' }
  | { kind: 'country' }
  | { kind: 'isoDateTime' }
  | {
      kind: 'list';
      item: 'id' | 'text';
      maxItems: number;
      maxItemLength: number;
    };

/** Limits for profile arrays. Overflow is flagged, the profile is untouched. */
export const PROFILE_LIST_MAX_ITEMS = 50;
export const PROFILE_TEXT_ITEM_MAX_LENGTH = 80;
export const PROFILE_ID_ITEM_MAX_LENGTH = 120;
export const OCCUPATION_MAX_LENGTH = 120;
export const PERSON_NAME_MAX_LENGTH = 80;
/** Agreed Industry id pattern (Functions contract): ^[a-z][a-z0-9_]{1,40}$. */
export const INDUSTRY_ID_PATTERN = /^[a-z][a-z0-9_]{1,40}$/;
export const INDUSTRY_ID_MAX_LENGTH = 41;

export const SIGNUP_METHODS = [
  'email',
  'google',
  'apple',
  'facebook',
  'linkedin',
] as const;
export type SignupMethod = (typeof SIGNUP_METHODS)[number];

export const ONBOARDING_STEPS = {
  profile_type: 1,
  basics: 2,
  about: 3,
  affiliations: 4,
  interests: 5,
  socials: 6,
} as const;
export type OnboardingStep = keyof typeof ONBOARDING_STEPS;

export const SOCIAL_PLATFORMS = [
  'linkedin',
  'instagram',
  'facebook',
  'youtube',
  'x',
  'tiktok',
  'snapchat',
  'website',
  'custom',
] as const;
export type AnalyticsSocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

/** low=[0,50), medium=[50,75), high=[75,100]. */
export const MATCH_SCORE_RANGES = ['low', 'medium', 'high'] as const;
export type MatchScoreRange = (typeof MATCH_SCORE_RANGES)[number];

export const AGE_RANGES = [
  '18-24',
  '25-34',
  '35-44',
  '45-54',
  '55-64',
  '65+',
] as const;
export type AgeRange = (typeof AGE_RANGES)[number];

/**
 * Channels that can capture. Each needs its own build configuration: nothing
 * captures without a declared channel, so a build without one stays off.
 */
export const DISTRIBUTION_CHANNELS = ['beta', 'production'] as const;
export type DistributionChannel = (typeof DISTRIBUTION_CHANNELS)[number];

const SLUG: PropertyRule = { kind: 'id', maxLength: 64 };
const MATCH_SCORE: PropertyRule = { kind: 'number', min: 0, max: 100 };
const MATCH_RANGE: PropertyRule = { kind: 'enum', values: MATCH_SCORE_RANGES };
const COUNT: PropertyRule = { kind: 'int', min: 0, max: 100000 };
const SOCIAL_PLATFORM: PropertyRule = { kind: 'enum', values: SOCIAL_PLATFORMS };
const ATTRIBUTION_METHOD: PropertyRule = {
  kind: 'enum',
  values: ['universal_link'],
};

const ACQUISITION_RULES = {
  signup_source: SLUG,
  signup_campaign: SLUG,
  signup_content: SLUG,
  signup_tool: SLUG,
  attribution_method: ATTRIBUTION_METHOD,
} as const;

export const EVENT_RULES = {
  app_opened: {
    open_type: { kind: 'enum', values: ['cold_start', 'return_from_background'] },
    session_id: { kind: 'id', maxLength: 64 },
  },
  signup_completed: {
    signup_method: { kind: 'enum', values: SIGNUP_METHODS },
    ...ACQUISITION_RULES,
  },
  acquisition_attributed: { ...ACQUISITION_RULES },
  campaign_accessed: {
    campaign_source: SLUG,
    campaign_name: SLUG,
    campaign_content: SLUG,
    campaign_tool: SLUG,
    attribution_method: ATTRIBUTION_METHOD,
  },
  onboarding_step_completed: {
    step: { kind: 'enum', values: Object.keys(ONBOARDING_STEPS) },
    step_number: { kind: 'int', min: 1, max: 6 },
    skipped: { kind: 'boolean' },
    item_count: COUNT,
    catalog_count: COUNT,
    custom_count: COUNT,
    manual_count: COUNT,
    verified_count: COUNT,
  },
  profile_completed: {
    completion_time_min: { kind: 'number', min: 0, max: 5256000 },
    account_created_at: { kind: 'isoDateTime' },
  },
  foreground_location: { granted: { kind: 'boolean' } },
  background_location: { granted: { kind: 'boolean' } },
  visibility_changed: { enabled: { kind: 'boolean' } },
  discovery_opened: {
    load_time_sec: { kind: 'number', min: 0, max: 86400 },
    people_shown: COUNT,
  },
  profile_viewed: { match_score: MATCH_SCORE, match_score_range: MATCH_RANGE },
  match_made: {
    match_id: { kind: 'id', maxLength: 64 },
    match_score: MATCH_SCORE,
    match_score_range: MATCH_RANGE,
  },
  social_linked: {
    social_platform: SOCIAL_PLATFORM,
    link_type: { kind: 'enum', values: ['manual', 'verified'] },
  },
  match_social_tapped: {
    social_platform: SOCIAL_PLATFORM,
    match_score: MATCH_SCORE,
    match_score_range: MATCH_RANGE,
    open_result: {
      kind: 'enum',
      values: ['opened', 'invalid', 'failed', 'unknown'],
    },
  },
  alert_opened: {
    source: { kind: 'enum', values: ['push', 'inbox'] },
    alert_id: { kind: 'id', maxLength: 128 },
    alert_motive: {
      kind: 'enum',
      values: ['interest', 'contact', 'both', 'affiliation', 'contact_affiliation'],
    },
  },
} as const satisfies Record<string, Record<string, PropertyRule>>;

export type AnalyticsEventName = keyof typeof EVENT_RULES;

export const ANALYTICS_EVENT_NAMES = Object.keys(
  EVENT_RULES,
) as AnalyticsEventName[];

/** Sent with every event. platform stays iOS; social networks use social_platform. */
export const SUPER_PROPERTY_RULES = {
  platform: { kind: 'enum', values: ['iOS'] },
  distribution_channel: { kind: 'enum', values: DISTRIBUTION_CHANNELS },
  is_test_user: { kind: 'trueOnly' },
  app_version: { kind: 'id', maxLength: 32 },
  app_build: { kind: 'id', maxLength: 32 },
  environment: { kind: 'enum', values: ['development', 'production'] },
  tracking_plan_version: { kind: 'id', maxLength: 32 },
} as const satisfies Record<string, PropertyRule>;

const profileList = (item: 'id' | 'text'): PropertyRule => ({
  kind: 'list',
  item,
  maxItems: PROFILE_LIST_MAX_ITEMS,
  maxItemLength:
    item === 'id' ? PROFILE_ID_ITEM_MAX_LENGTH : PROFILE_TEXT_ITEM_MAX_LENGTH,
});

const socialList: PropertyRule = {
  kind: 'list',
  item: 'id',
  maxItems: SOCIAL_PLATFORMS.length,
  maxItemLength: 16,
};

export const PERSON_PROPERTY_RULES = {
  ...SUPER_PROPERTY_RULES,
  ...ACQUISITION_RULES,
  user_id: { kind: 'id', maxLength: 128 },
  email: { kind: 'email' },
  account_created_at: { kind: 'isoDateTime' },
  profile_type: { kind: 'enum', values: ['personal', 'professional'] },
  occupation: { kind: 'text', maxLength: OCCUPATION_MAX_LENGTH },
  occupation_truncated: { kind: 'boolean' },
  /** Account name parts (top-level realName / lastName); $unset when removed. */
  first_name: { kind: 'text', maxLength: PERSON_NAME_MAX_LENGTH },
  last_name: { kind: 'text', maxLength: PERSON_NAME_MAX_LENGTH },
  /**
   * Professional Industry catalog id (users/{uid}.professionalIndustryId).
   * Kept while the personal mode is active (profile_type segments it);
   * $unset only when the selection is cleared.
   */
  industry: { kind: 'id', maxLength: INDUSTRY_ID_MAX_LENGTH },
  country_birth: { kind: 'country' },
  country_live: { kind: 'country' },
  languages: { kind: 'list', item: 'id', maxItems: 50, maxItemLength: 16 },
  age_range: { kind: 'enum', values: AGE_RANGES },
  age_range_status: {
    kind: 'enum',
    values: ['valid', 'below_minimum', 'unknown'],
  },
  interests: profileList('id'),
  interests_custom: profileList('text'),
  interests_custom_normalized: profileList('text'),
  interests_catalog_count: COUNT,
  interests_custom_count: COUNT,
  interests_count: COUNT,
  interests_truncated: { kind: 'boolean' },
  affiliations: profileList('id'),
  affiliations_custom: profileList('text'),
  affiliations_custom_normalized: profileList('text'),
  affiliations_catalog_count: COUNT,
  affiliations_custom_count: COUNT,
  affiliations_count: COUNT,
  affiliations_truncated: { kind: 'boolean' },
  socials_connected: socialList,
  social_platforms_manual: socialList,
  social_platforms_verified: socialList,
  has_socials: { kind: 'boolean' },
  foreground_location_granted: { kind: 'boolean' },
  background_location_granted: { kind: 'boolean' },
} as const satisfies Record<string, PropertyRule>;

export type PersonPropertyName = keyof typeof PERSON_PROPERTY_RULES;

/** Never sent, even if a caller or a stale build tries. */
export const FORBIDDEN_PROPERTY_NAMES: ReadonlySet<string> = new Set([
  'gender',
  'seniority',
  'event_cohort',
  'birthDate',
  'birth_date',
  'birthYear',
  'latitude',
  'longitude',
  'lat',
  'lng',
  'coordinates',
  'url',
  'other_uid',
  'actor_uid',
  'actorUid',
]);

/** Events the SDK itself may produce and that the guard lets through. */
export const SDK_EVENTS_ALLOWED: ReadonlySet<string> = new Set([
  '$identify',
  '$set',
]);

export function isAllowedOutgoingEvent(name: string): boolean {
  return (
    SDK_EVENTS_ALLOWED.has(name) ||
    Object.prototype.hasOwnProperty.call(EVENT_RULES, name)
  );
}

export function matchScoreRange(score: number): MatchScoreRange | null {
  if (!Number.isFinite(score) || score < 0 || score > 100) return null;
  if (score < 50) return 'low';
  if (score < 75) return 'medium';
  return 'high';
}
export type PropertyRuleMap = Readonly<Record<string, PropertyRule>>;

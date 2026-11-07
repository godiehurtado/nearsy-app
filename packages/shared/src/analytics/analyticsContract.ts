/**
 * Android analytics contract (Tracking Plan v1).
 * Pure module: no React Native, Firebase or SDK imports.
 */

export const TRACKING_PLAN_VERSION = 'v1';

/**
 * Every event this app may send, with the properties each may carry. Anything
 * else is dropped before it leaves the device.
 */
export const ANALYTICS_EVENT_CONTRACT = {
  app_opened: ['session_id'],
  signup_completed: [],
  profile_completed: ['completion_time_min'],
  onboarding_step_completed: [
    'step_name',
    'step_number',
    'skipped',
    'profile_type',
    'item_count',
    'catalog_count',
    'custom_count',
    'manual_count',
    'verified_count',
  ],
  social_linked: ['social_platform', 'connection_type', 'profile_type'],
  match_social_tapped: [
    'social_platform',
    'score',
    'match_score_range',
    'open_result',
  ],
  foreground_location: ['granted', 'trigger'],
  background_location: ['granted', 'trigger'],
  visibility_changed: ['enabled'],
  discovery_opened: ['load_time_sec', 'people_shown'],
  profile_viewed: ['score', 'match_score_range'],
  match_made: ['score', 'match_score_range', 'presented_in', 'session_id'],
  alert_opened: ['source', 'alert_id'],
  campaign_accessed: [
    'campaign_source',
    'campaign_name',
    'campaign_content',
    'campaign_tool',
    'attribution_method',
  ],
} as const satisfies Record<string, readonly string[]>;

export type AnalyticsEventName = keyof typeof ANALYTICS_EVENT_CONTRACT;

export const ANALYTICS_EVENTS = Object.keys(
  ANALYTICS_EVENT_CONTRACT,
) as AnalyticsEventName[];

/** Registered on every event; the SDK adds them to the payload by itself. */
export const SUPER_PROPERTY_KEYS = [
  'platform',
  'app_version',
  'app_build',
  'environment',
  'tracking_plan_version',
] as const;

/**
 * Marks of the installation, declared by the build. A Beta install stamps them on
 * every event, whoever is signed in. Any other build removes them, because the SDK
 * persists registered properties across an app update.
 */
export type InstallClassification = {
  is_test_user: true;
  distribution_channel: 'beta';
};

const INSTALL_CLASSIFICATION_KEYS = ['is_test_user', 'distribution_channel'] as const;

/** A person can be marked as a test user, and no code path may ever unmark one. */
function withoutFalseClassification(
  bag: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!bag || !('is_test_user' in bag) || bag.is_test_user === true) return bag;
  const { is_test_user: _dropped, ...rest } = bag;
  return rest;
}

export function applyInstallClassification<T extends object | null>(
  event: T,
  classification: InstallClassification | undefined,
): T {
  if (!event) return event;
  const typed = event as {
    properties?: Record<string, unknown>;
    $set?: Record<string, unknown>;
    $set_once?: Record<string, unknown>;
  };
  const properties: Record<string, unknown> = { ...typed.properties };
  for (const key of INSTALL_CLASSIFICATION_KEYS) delete properties[key];
  return {
    ...typed,
    $set: withoutFalseClassification(typed.$set),
    $set_once: withoutFalseClassification(typed.$set_once),
    properties: { ...properties, ...classification },
  } as T;
}

/** Person-update events the SDK sends for identify and property updates. */
const SDK_PERSON_EVENTS = ['$identify', '$set'] as const;

function isContractEvent(name: unknown): name is AnalyticsEventName {
  return (
    typeof name === 'string' &&
    Object.prototype.hasOwnProperty.call(ANALYTICS_EVENT_CONTRACT, name)
  );
}

/**
 * Backstop for anything the SDK could add by itself (lifecycle, screens,
 * exceptions, flags): only the events of the contract may leave the device.
 */
export function isAllowedOutgoingEvent(name: unknown): boolean {
  return (
    isContractEvent(name) ||
    (SDK_PERSON_EVENTS as readonly unknown[]).includes(name)
  );
}

/**
 * `before_send` body: drops events outside the contract and, on contract
 * events, custom properties it does not list. SDK `$` keys and the registered
 * technical properties stay. Person updates keep their shape.
 */
export function sanitizeOutgoingEvent<T extends { event?: unknown } | null | undefined>(
  event: T,
): T | null {
  if (!event || !isAllowedOutgoingEvent(event.event)) return null;
  if (!isContractEvent(event.event)) return event;
  const allowed: readonly string[] = ANALYTICS_EVENT_CONTRACT[event.event];
  const source = (event as { properties?: Record<string, unknown> }).properties;
  if (!source) return event;
  const properties: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (
      key.startsWith('$') ||
      allowed.includes(key) ||
      (SUPER_PROPERTY_KEYS as readonly string[]).includes(key)
    ) {
      properties[key] = value;
    }
  }
  return { ...event, properties };
}

export type AnalyticsProperties = Record<
  string,
  string | number | boolean | null | string[]
>;

/** True only when Firebase states that this credential created the account. */
export function isConfirmedNewAccount(credential: unknown): boolean {
  const info = (
    credential as { additionalUserInfo?: { isNewUser?: unknown } } | null
  )?.additionalUserInfo;
  return info?.isNewUser === true;
}

/**
 * Elapsed minutes since the Firebase Auth account was created. This is elapsed
 * time, not active time. Missing, invalid or negative input returns undefined
 * so the caller omits the property instead of reporting a false duration.
 */
export function computeCompletionTimeMin(
  creationTime: unknown,
  nowMs: number,
): number | undefined {
  if (typeof creationTime !== 'string' || !creationTime.trim()) return undefined;
  const createdMs = Date.parse(creationTime);
  if (!Number.isFinite(createdMs) || createdMs <= 0) return undefined;
  const elapsedMs = nowMs - createdMs;
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return undefined;
  return Math.round(elapsedMs / 6000) / 10;
}

export type MatchScoreRange = 'low' | 'medium' | 'high';

/** Unknown is not zero: anything outside 0-100 returns undefined. */
export function toKnownScore(score: unknown): number | undefined {
  return typeof score === 'number' &&
    Number.isFinite(score) &&
    score >= 0 &&
    score <= 100
    ? score
    : undefined;
}

/** low=[0,50), medium=[50,75), high=[75,100]. */
export function matchScoreRange(score: number): MatchScoreRange {
  if (score < 50) return 'low';
  return score < 75 ? 'medium' : 'high';
}

/**
 * `match_made`, or null without a valid score or a profile to count. The unit is
 * one profile, per viewer and SDK session. The other person's UID is only part of
 * the local dedupe key: it never becomes a property, and `match_id` is not used.
 */
export function buildMatchMadeEvent(input: {
  peerUid: unknown;
  score: unknown;
  presentedIn: 'nearby_list' | 'discovery_profile';
  sessionId: string | undefined;
}): {
  event: 'match_made';
  onceKey: string;
  properties: AnalyticsProperties;
} | null {
  if (toKnownScore(input.score) === undefined) return null;
  if (typeof input.peerUid !== 'string' || !input.peerUid) return null;
  return {
    event: 'match_made',
    onceKey: `match_made:${input.sessionId ?? 'no-session'}:${input.peerUid}`,
    properties: {
      ...scoreProperties(input.score),
      presented_in: input.presentedIn,
      ...(input.sessionId ? { session_id: input.sessionId } : {}),
    },
  };
}

/** Score properties when known, otherwise nothing. */
export function scoreProperties(score: unknown): AnalyticsProperties {
  const known = toKnownScore(score);
  return known === undefined
    ? {}
    : { score: known, match_score_range: matchScoreRange(known) };
}

const INSPECTABLE_KEYS = new Set<string>([
  ...SUPER_PROPERTY_KEYS,
  ...INSTALL_CLASSIFICATION_KEYS,
  'profile_type',
  'completion_time_min',
  'step_name',
  'step_number',
  'skipped',
  'item_count',
  'catalog_count',
  'custom_count',
  'manual_count',
  'verified_count',
  'social_platform',
  'connection_type',
  'open_result',
  'score',
  'match_score_range',
  'presented_in',
  'granted',
  'trigger',
  'enabled',
  'load_time_sec',
  'people_shown',
  'source',
  'attribution_method',
  'has_socials',
  'foreground_location_granted',
  'background_location_granted',
  'age_range',
  'interests_count',
  'interests_catalog_count',
  'interests_custom_count',
  'affiliations_count',
  'affiliations_catalog_count',
  'affiliations_custom_count',
]);

/**
 * Local inspection view. Only known technical keys keep their value: email,
 * occupation, identifiers, free text and anything unexpected are masked, and
 * lists only show their size.
 */
export function describeForInspection(
  properties: AnalyticsProperties | undefined,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties ?? {})) {
    if (Array.isArray(value)) out[key] = `<${value.length} items>`;
    else if (value === null) out[key] = '<empty>';
    else out[key] = INSPECTABLE_KEYS.has(key) ? value : '<redacted>';
  }
  return out;
}

/**
 * Android analytics contract, foundation batch (Tracking Plan v1).
 * Pure module: no React Native, Firebase or SDK imports.
 */

export const TRACKING_PLAN_VERSION = 'v1';

export const ANALYTICS_EVENTS = [
  'app_opened',
  'signup_completed',
  'profile_completed',
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];

/** Person-update events the SDK sends for identify and property updates. */
const SDK_PERSON_EVENTS = ['$identify', '$set'] as const;

/**
 * Backstop for anything the SDK could add by itself (lifecycle, screens,
 * exceptions, flags): only the events of this batch may leave the device.
 */
export function isAllowedOutgoingEvent(name: unknown): boolean {
  return (
    (ANALYTICS_EVENTS as readonly unknown[]).includes(name) ||
    (SDK_PERSON_EVENTS as readonly unknown[]).includes(name)
  );
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

const INSPECTABLE_KEYS = new Set([
  'platform',
  'app_version',
  'app_build',
  'environment',
  'tracking_plan_version',
  'profile_type',
  'completion_time_min',
]);

/**
 * Local inspection view. Only known technical keys keep their value: email,
 * occupation, identifiers and anything unexpected are masked, and lists only
 * show their size.
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

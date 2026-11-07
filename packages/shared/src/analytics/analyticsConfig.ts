/**
 * Resolves whether analytics may run and how. Remote sending stays off unless
 * every condition of a mode holds, including in production builds.
 *
 * | Mode            | Build       | Real SDK | Network                     |
 * |-----------------|-------------|----------|-----------------------------|
 * | off             | release     | no       | none                        |
 * | inspect         | dev         | no       | none, sanitized logs        |
 * | sdk_intercept   | dev client  | yes      | none, requests intercepted  |
 * | smoke           | dev client  | yes      | PostHog, synthetic accounts |
 * | remote          | release     | yes      | PostHog                     |
 */
export const POSTHOG_US_HOST = 'https://us.i.posthog.com';

/** `.invalid` never resolves (RFC 2606): a second barrier behind the interception. */
export const INTERCEPT_HOST = 'https://posthog-intercept.invalid';
/** Shape-valid placeholder, not a credential. Requests carrying it never leave. */
export const INTERCEPT_TOKEN = 'phc_intercepted_requests_only_not_a_token';

export const SMOKE_FIREBASE_PROJECT_ID = 'nearsy-dev';
export const SMOKE_DISTINCT_ID_PREFIX = 'smoke_nearsy_dev_';

export const DEFAULT_APP_OPENED_MIN_BACKGROUND_SEC = 30;
const MAX_APP_OPENED_MIN_BACKGROUND_SEC = 3600;

export type AnalyticsConfig =
  | { mode: 'off'; reason: string }
  | { mode: 'inspect'; environment: 'development' }
  | { mode: 'sdk_intercept'; environment: 'sdk_intercept' }
  | {
      mode: 'smoke';
      environment: 'smoke_nearsy_dev';
      token: string;
      host: typeof POSTHOG_US_HOST;
      syntheticEmailSuffix: string;
    }
  | {
      mode: 'remote';
      environment: 'production';
      token: string;
      host: typeof POSTHOG_US_HOST;
    };

export type AnalyticsExtras = {
  nearsyAnalytics?: {
    enabled?: unknown;
    environment?: unknown;
    token?: unknown;
    sdkIntercept?: unknown;
    smoke?: {
      enabled?: unknown;
      token?: unknown;
      syntheticEmailSuffix?: unknown;
    } | null;
    appOpenedMinBackgroundSec?: unknown;
    attribution?: unknown;
  } | null;
  nearsyFirebaseEnv?: unknown;
  nearsyFirebaseProjectId?: unknown;
  nearsyDevClient?: unknown;
};

const PROJECT_TOKEN = /^phc_[A-Za-z0-9_-]{20,}$/;
/**
 * Must end in a domain nobody can receive real mail on, so a suffix such as
 * `@gmail.com` cannot pass as synthetic.
 */
const SYNTHETIC_EMAIL_SUFFIX =
  /^\+?[a-z0-9._-]*@(?:[a-z0-9-]+\.)*(?:test|example|invalid)$/i;

function isDevelopmentClient(extras: AnalyticsExtras | null | undefined): boolean {
  return (
    extras?.nearsyFirebaseEnv === 'development' && extras?.nearsyDevClient === true
  );
}

function resolveDevelopmentMode(input: {
  extras: AnalyticsExtras | null | undefined;
  runtimeFirebaseProjectId?: unknown;
}): AnalyticsConfig {
  const inspect: AnalyticsConfig = { mode: 'inspect', environment: 'development' };
  const settings = input.extras?.nearsyAnalytics;
  if (!isDevelopmentClient(input.extras)) return inspect;

  // Interception wins over smoke: when both are set, nothing leaves the device.
  if (settings?.sdkIntercept === true) {
    return { mode: 'sdk_intercept', environment: 'sdk_intercept' };
  }

  const smoke = settings?.smoke;
  if (smoke?.enabled !== true) return inspect;
  if (
    input.extras?.nearsyFirebaseProjectId !== SMOKE_FIREBASE_PROJECT_ID ||
    // Read from the initialized Firebase app: a stale extra cannot widen it.
    input.runtimeFirebaseProjectId !== SMOKE_FIREBASE_PROJECT_ID
  ) {
    return inspect;
  }
  if (typeof smoke.token !== 'string' || !PROJECT_TOKEN.test(smoke.token)) {
    return inspect;
  }
  if (
    typeof smoke.syntheticEmailSuffix !== 'string' ||
    !SYNTHETIC_EMAIL_SUFFIX.test(smoke.syntheticEmailSuffix)
  ) {
    return inspect;
  }
  return {
    mode: 'smoke',
    environment: 'smoke_nearsy_dev',
    token: smoke.token,
    host: POSTHOG_US_HOST,
    syntheticEmailSuffix: smoke.syntheticEmailSuffix.toLowerCase(),
  };
}

export function resolveAnalyticsConfig(input: {
  extras: AnalyticsExtras | null | undefined;
  isDev: boolean;
  /** Project of the initialized Firebase app; only smoke mode uses it. */
  runtimeFirebaseProjectId?: unknown;
}): AnalyticsConfig {
  // Development builds never reach production PostHog data.
  if (input.isDev) return resolveDevelopmentMode(input);

  const settings = input.extras?.nearsyAnalytics;
  if (settings?.enabled !== true) return { mode: 'off', reason: 'not_enabled' };
  // Preview and other profiles share production Firebase UIDs, so remote
  // capture from them would write onto real people.
  if (settings.environment !== 'production') {
    return { mode: 'off', reason: 'environment_not_allowed' };
  }
  if (
    input.extras?.nearsyFirebaseEnv !== 'production' ||
    input.extras?.nearsyDevClient === true
  ) {
    return { mode: 'off', reason: 'firebase_environment_mismatch' };
  }
  if (
    typeof settings.token !== 'string' ||
    !PROJECT_TOKEN.test(settings.token)
  ) {
    return { mode: 'off', reason: 'invalid_token' };
  }
  return {
    mode: 'remote',
    environment: 'production',
    token: settings.token,
    host: POSTHOG_US_HOST,
  };
}

/**
 * Smoke identity: only a synthetic account gets a person, in its own id space.
 * Every other account gets none, so nothing is sent for it.
 */
export function resolveSmokeDistinctId(
  user: { uid: string; email?: string | null },
  syntheticEmailSuffix: string,
): string | null {
  const email = typeof user.email === 'string' ? user.email.trim().toLowerCase() : '';
  if (!email.endsWith(syntheticEmailSuffix.toLowerCase())) return null;
  return `${SMOKE_DISTINCT_ID_PREFIX}${user.uid}`;
}

export function resolveAppOpenedMinBackgroundMs(
  extras: AnalyticsExtras | null | undefined,
): number {
  const seconds = extras?.nearsyAnalytics?.appOpenedMinBackgroundSec;
  const valid =
    typeof seconds === 'number' &&
    Number.isFinite(seconds) &&
    seconds >= 0 &&
    seconds <= MAX_APP_OPENED_MIN_BACKGROUND_SEC;
  return (valid ? seconds : DEFAULT_APP_OPENED_MIN_BACKGROUND_SEC) * 1000;
}

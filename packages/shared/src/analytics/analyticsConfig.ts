/**
 * Resolves whether analytics may run and how. Remote sending stays off unless
 * every condition of a mode holds, including in production builds.
 *
 * | Mode            | Build       | Real SDK | Network                          |
 * |-----------------|-------------|----------|----------------------------------|
 * | off             | release     | no       | none                             |
 * | inspect         | dev         | no       | none, sanitized logs             |
 * | sdk_intercept   | dev client  | yes      | none, requests intercepted       |
 * | beta            | release     | yes      | PostHog, events marked as tests  |
 * | remote          | release     | yes      | PostHog                          |
 */
export const POSTHOG_US_HOST = 'https://us.i.posthog.com';

/** `.invalid` never resolves (RFC 2606): a second barrier behind the interception. */
export const INTERCEPT_HOST = 'https://posthog-intercept.invalid';
/** Shape-valid placeholder, not a credential. Requests carrying it never leave. */
export const INTERCEPT_TOKEN = 'phc_intercepted_requests_only_not_a_token';

export const PRODUCTION_FIREBASE_PROJECT_ID = 'nearsy-pj';

export const DEFAULT_APP_OPENED_MIN_BACKGROUND_SEC = 30;
const MAX_APP_OPENED_MIN_BACKGROUND_SEC = 3600;

export type AnalyticsConfig =
  | { mode: 'off'; reason: string }
  | { mode: 'inspect'; environment: 'development' }
  | { mode: 'sdk_intercept'; environment: 'sdk_intercept' }
  | {
      mode: 'beta';
      environment: 'production';
      /** Declared by the build. Nothing here detects the Play track. */
      distributionChannel: 'beta';
      token: string;
      host: typeof POSTHOG_US_HOST;
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
    beta?: {
      enabled?: unknown;
      environment?: unknown;
      distributionChannel?: unknown;
      token?: unknown;
    } | null;
    appOpenedMinBackgroundSec?: unknown;
    attribution?: unknown;
  } | null;
  nearsyFirebaseEnv?: unknown;
  nearsyFirebaseProjectId?: unknown;
  nearsyDevClient?: unknown;
};

const PROJECT_TOKEN = /^phc_[A-Za-z0-9_-]{20,}$/;
function isDevelopmentClient(extras: AnalyticsExtras | null | undefined): boolean {
  return (
    extras?.nearsyFirebaseEnv === 'development' && extras?.nearsyDevClient === true
  );
}

function resolveDevelopmentMode(
  extras: AnalyticsExtras | null | undefined,
): AnalyticsConfig {
  return isDevelopmentClient(extras) && extras?.nearsyAnalytics?.sdkIntercept === true
    ? { mode: 'sdk_intercept', environment: 'sdk_intercept' }
    : { mode: 'inspect', environment: 'development' };
}

function resolveBetaMode(input: {
  extras: AnalyticsExtras | null | undefined;
  runtimeFirebaseProjectId?: unknown;
}): AnalyticsConfig {
  const beta = input.extras?.nearsyAnalytics?.beta;
  if (beta?.environment !== 'production' || beta.distributionChannel !== 'beta') {
    return { mode: 'off', reason: 'beta_not_declared' };
  }
  if (
    input.extras?.nearsyFirebaseEnv !== 'production' ||
    input.extras?.nearsyDevClient === true ||
    input.extras?.nearsyFirebaseProjectId !== PRODUCTION_FIREBASE_PROJECT_ID ||
    // Read from the initialized Firebase app: a stale extra cannot widen it.
    input.runtimeFirebaseProjectId !== PRODUCTION_FIREBASE_PROJECT_ID
  ) {
    return { mode: 'off', reason: 'firebase_environment_mismatch' };
  }
  if (typeof beta.token !== 'string' || !PROJECT_TOKEN.test(beta.token)) {
    return { mode: 'off', reason: 'invalid_token' };
  }
  return {
    mode: 'beta',
    environment: 'production',
    distributionChannel: 'beta',
    token: beta.token,
    host: POSTHOG_US_HOST,
  };
}

export function resolveAnalyticsConfig(input: {
  extras: AnalyticsExtras | null | undefined;
  isDev: boolean;
  /** Project of the initialized Firebase app; only beta mode uses it. */
  runtimeFirebaseProjectId?: unknown;
}): AnalyticsConfig {
  // Development builds never reach production PostHog data.
  if (input.isDev) return resolveDevelopmentMode(input.extras);

  const settings = input.extras?.nearsyAnalytics;
  const betaRequested = settings?.beta?.enabled === true;
  // Which population a build reports must never be a guess.
  if (settings?.enabled === true && betaRequested) {
    return { mode: 'off', reason: 'ambiguous_mode' };
  }
  if (betaRequested) return resolveBetaMode(input);
  if (settings?.enabled !== true) return { mode: 'off', reason: 'not_enabled' };
  // Preview and other profiles share production Firebase UIDs. Without the Beta
  // marks, capture from them would be counted as real use.
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

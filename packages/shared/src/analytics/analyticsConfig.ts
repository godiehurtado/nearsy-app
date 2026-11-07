/**
 * Resolves whether analytics may run and how. Remote capture stays off unless
 * every condition holds, including in production builds.
 */
export const POSTHOG_US_HOST = 'https://us.i.posthog.com';

export type AnalyticsConfig =
  | { mode: 'off'; reason: string }
  | { mode: 'inspect'; environment: 'development' }
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
  } | null;
  nearsyFirebaseEnv?: unknown;
  nearsyDevClient?: unknown;
};

const PROJECT_TOKEN = /^phc_[A-Za-z0-9_-]{20,}$/;

export function resolveAnalyticsConfig(input: {
  extras: AnalyticsExtras | null | undefined;
  isDev: boolean;
}): AnalyticsConfig {
  // Development builds never reach PostHog; they only log sanitized events.
  if (input.isDev) return { mode: 'inspect', environment: 'development' };

  const settings = input.extras?.nearsyAnalytics;
  if (settings?.enabled !== true) return { mode: 'off', reason: 'not_enabled' };
  // Preview and other profiles share production Firebase UIDs, so remote
  // capture from them would write onto real people. Not allowed in this batch.
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

/**
 * Remote delivery is off unless every switch below is set explicitly, in
 * production too. A missing token never fails the app, it keeps analytics off.
 */
export const POSTHOG_HOST = 'https://us.i.posthog.com';
export const POSTHOG_PROJECT_ID = 716015;

export type AnalyticsEnvironment = 'development' | 'production';

export type AnalyticsConfig = {
  enabled: boolean;
  token: string | null;
  host: string;
  environment: AnalyticsEnvironment;
  /** Universal Link hosts accepted for campaign attribution. Empty = off. */
  attributionHosts: readonly string[];
};

export type AnalyticsConfigInput = {
  enabledFlag?: string | null;
  allowDevelopmentFlag?: string | null;
  token?: string | null;
  firebaseEnv?: string | null;
  isDevBundle?: boolean;
  attributionHosts?: string | null;
};

function resolveEnvironment(input: AnalyticsConfigInput): AnalyticsEnvironment {
  const raw = String(input.firebaseEnv ?? '')
    .trim()
    .toLowerCase();
  if (input.isDevBundle || raw === 'development' || raw === 'dev') {
    return 'development';
  }
  return 'production';
}

export function parseAttributionHosts(raw: string | null | undefined): string[] {
  const seen = new Set<string>();
  for (const part of String(raw ?? '').split(',')) {
    const host = part.trim().toLowerCase();
    if (/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) seen.add(host);
  }
  return [...seen];
}

export function resolveAnalyticsConfig(
  input: AnalyticsConfigInput,
): AnalyticsConfig {
  const environment = resolveEnvironment(input);
  const token = String(input.token ?? '').trim();
  const flagOn = String(input.enabledFlag ?? '').trim() === 'true';
  const developmentAllowed =
    environment === 'production' ||
    String(input.allowDevelopmentFlag ?? '').trim() === 'true';
  const enabled = flagOn && developmentAllowed && token.startsWith('phc_');
  return {
    enabled,
    token: enabled ? token : null,
    host: POSTHOG_HOST,
    environment,
    attributionHosts: enabled
      ? parseAttributionHosts(input.attributionHosts)
      : [],
  };
}

export const DISABLED_ANALYTICS_CONFIG: AnalyticsConfig = {
  enabled: false,
  token: null,
  host: POSTHOG_HOST,
  environment: 'production',
  attributionHosts: [],
};

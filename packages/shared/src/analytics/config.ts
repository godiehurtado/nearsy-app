/**
 * Remote delivery is off unless every switch below is set explicitly, in
 * production too. A missing token never fails the app, it keeps analytics off.
 *
 * Both channels run on production Firebase and are declared by configuration,
 * because TestFlight is not auto-detected:
 * - beta: TestFlight. Every event and the person are marked is_test_user=true.
 * - production: App Store. Nothing is marked, and nothing writes false either.
 * Without a declared channel nothing is sent. No build declares production yet.
 */
import {
  DISTRIBUTION_CHANNELS,
  type DistributionChannel,
} from './contract';

export const POSTHOG_HOST = 'https://us.i.posthog.com';
export const POSTHOG_PROJECT_ID = 716015;

export type AnalyticsEnvironment = 'development' | 'production';

export type AnalyticsConfig = {
  enabled: boolean;
  token: string | null;
  host: string;
  environment: AnalyticsEnvironment;
  distributionChannel: DistributionChannel | null;
  /** This install is Beta: every event says so, anonymous ones too. */
  isTestInstall: boolean;
  /** Universal Link hosts accepted for campaign attribution. Empty = off. */
  attributionHosts: readonly string[];
};

export type AnalyticsConfigInput = {
  enabledFlag?: string | null;
  distributionChannel?: string | null;
  allowDevelopmentFlag?: string | null;
  token?: string | null;
  firebaseEnv?: string | null;
  isDevBundle?: boolean;
  attributionHosts?: string | null;
};

/** Same reading as app.config.js: empty means production. */
function isProductionFirebase(raw: string | null | undefined): boolean {
  const value = String(raw ?? '')
    .trim()
    .toLowerCase();
  return value === 'production' || value === 'prod' || value === '';
}

function resolveChannel(raw: string | null | undefined): DistributionChannel | null {
  const value = String(raw ?? '').trim();
  return DISTRIBUTION_CHANNELS.find((channel) => channel === value) ?? null;
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
  const environment: AnalyticsEnvironment = input.isDevBundle
    ? 'development'
    : 'production';
  const channel = resolveChannel(input.distributionChannel);
  const token = String(input.token ?? '').trim();
  const flagOn = String(input.enabledFlag ?? '').trim() === 'true';
  const bundleAllowed =
    environment === 'production' ||
    String(input.allowDevelopmentFlag ?? '').trim() === 'true';
  const enabled =
    flagOn &&
    channel !== null &&
    bundleAllowed &&
    // Beta identities are real production UIDs. nearsy-dev UIDs must never mix in.
    isProductionFirebase(input.firebaseEnv) &&
    token.startsWith('phc_');
  return {
    enabled,
    token: enabled ? token : null,
    host: POSTHOG_HOST,
    environment,
    distributionChannel: enabled ? channel : null,
    isTestInstall: enabled && channel === 'beta',
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
  distributionChannel: null,
  isTestInstall: false,
  attributionHosts: [],
};

/**
 * Build-time guard for analytics. A profile that declares capture (today: beta)
 * must also have a PostHog project token, or the binary would silently ship
 * without analytics. Profiles that do not declare capture need no token.
 *
 * Never prints the token or any part of it.
 */
const ENABLED_ENV = 'EXPO_PUBLIC_POSTHOG_ENABLED';
const CHANNEL_ENV = 'EXPO_PUBLIC_POSTHOG_DISTRIBUTION_CHANNEL';
const TOKEN_ENV = 'EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN';

function assertAnalyticsBuildConfig(env) {
  const enabled = String(env[ENABLED_ENV] ?? '').trim() === 'true';
  const channel = String(env[CHANNEL_ENV] ?? '').trim();
  if (!enabled && !channel) return { declared: false };
  if (!enabled || !channel) {
    throw new Error(
      `[app.config] Analytics is half configured: set both ${ENABLED_ENV}=true and ${CHANNEL_ENV}, or neither.`,
    );
  }
  const token = String(env[TOKEN_ENV] ?? '').trim();
  if (!token.startsWith('phc_') || token.length < 8) {
    throw new Error(
      `[app.config] This build declares analytics (channel "${channel}") but ${TOKEN_ENV} is missing or malformed. ` +
        'Create it as an EAS environment variable before building, so a QA build cannot ship without analytics.',
    );
  }
  return { declared: true, channel };
}

module.exports = { assertAnalyticsBuildConfig, CHANNEL_ENV, ENABLED_ENV, TOKEN_ENV };

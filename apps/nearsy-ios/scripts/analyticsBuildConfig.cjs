/**
 * Build-time guard for analytics. A profile that declares capture (today: beta)
 * must also have a PostHog project token, or the binary would silently ship
 * without analytics. Profiles that do not declare capture need no token.
 *
 * Where it is enforced: on the EAS builder (`EAS_BUILD=true`), where EAS injects
 * its environment variables, so a build without the token fails before compiling.
 * The EAS CLI also reads app.config on this machine before uploading, without
 * those variables, so that local read only checks the profile is complete.
 *
 * A profile that extends a capturing one switches capture off with
 * ENABLED=false (EAS rejects empty env values in eas.json). That explicit off
 * wins over any inherited channel.
 *
 * Never prints the token or any part of it.
 */
const ENABLED_ENV = 'EXPO_PUBLIC_POSTHOG_ENABLED';
const CHANNEL_ENV = 'EXPO_PUBLIC_POSTHOG_DISTRIBUTION_CHANNEL';
const TOKEN_ENV = 'EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN';

function assertAnalyticsBuildConfig(env) {
  const flag = String(env[ENABLED_ENV] ?? '').trim();
  const enabled = flag === 'true';
  const channel = String(env[CHANNEL_ENV] ?? '').trim();
  if (flag === 'false') return { declared: false };
  if (!enabled && !channel) return { declared: false };
  if (!enabled || !channel) {
    throw new Error(
      `[app.config] Analytics is half configured: set both ${ENABLED_ENV}=true and ${CHANNEL_ENV}, or neither.`,
    );
  }
  const token = String(env[TOKEN_ENV] ?? '').trim();
  const tokenValid = token.startsWith('phc_') && token.length >= 8;
  if (tokenValid) return { declared: true, channel, tokenChecked: true };
  const onEasBuilder = String(env.EAS_BUILD ?? '').trim() === 'true';
  if (!onEasBuilder) return { declared: true, channel, tokenChecked: false };
  throw new Error(
    `[app.config] This build declares analytics (channel "${channel}") but ${TOKEN_ENV} is missing or malformed. ` +
      'Create it as an EAS environment variable before building, so a QA build cannot ship without analytics.',
  );
}

module.exports = { assertAnalyticsBuildConfig, CHANNEL_ENV, ENABLED_ENV, TOKEN_ENV };

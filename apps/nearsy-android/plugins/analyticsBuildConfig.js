/**
 * Analytics settings read at build or Metro start. Everything is off when no
 * variable is set. Tokens only enter the config when their mode is enabled, and
 * no App Links filter exists without an explicit host and path prefix.
 */
function flag(env, name) {
  return (
    String(env[name] || '')
      .trim()
      .toLowerCase() === 'true'
  );
}

function text(env, name) {
  return String(env[name] || '').trim();
}

function optionalNumber(env, name) {
  const raw = text(env, name);
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

/**
 * PostHog generation-id cutover (Functions ANALYTICS_DISTINCT_ID_CONTRACT.md):
 * trimmed digits, no leading zero, a safe integer. Anything else is null, with a
 * warning; unset is null and changes nothing (every account keeps its UID).
 */
const GENERATION_SINCE = /^[1-9][0-9]{0,15}$/;
function resolveGenerationIdSinceMs(env) {
  const raw = text(env, 'NEARSY_POSTHOG_GENERATION_ID_SINCE_MS');
  if (!raw) return null;
  const value = Number(raw);
  if (GENERATION_SINCE.test(raw) && Number.isSafeInteger(value)) return value;
  console.warn(
    '[analytics] NEARSY_POSTHOG_GENERATION_ID_SINCE_MS is not a valid millisecond time; ignored.',
  );
  return null;
}

const HOST = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;
/** A dedicated prefix: `/` alone would capture every link of the domain. */
const PATH_PREFIX = /^\/[a-z0-9_-]+(?:\/[a-z0-9_-]+)*\/?$/i;

function resolveAppLinks(env) {
  const host = text(env, 'NEARSY_APP_LINKS_HOST').toLowerCase();
  const pathPrefix = text(env, 'NEARSY_APP_LINKS_PATH_PREFIX');
  return HOST.test(host) && PATH_PREFIX.test(pathPrefix)
    ? { host, pathPrefix }
    : null;
}

function resolveAnalyticsExtras(env) {
  // A mode that would resolve to off must not carry its token into the build.
  const environment = text(env, 'NEARSY_ANALYTICS_ENV');
  const generalRequested = flag(env, 'NEARSY_ANALYTICS_ENABLED');
  const betaRequested = flag(env, 'NEARSY_ANALYTICS_BETA_ENABLED');
  const ambiguous = generalRequested && betaRequested;
  const remoteEnabled = generalRequested && environment === 'production' && !ambiguous;
  const betaEnabled =
    betaRequested &&
    environment === 'production' &&
    text(env, 'NEARSY_ANALYTICS_DISTRIBUTION_CHANNEL') === 'beta' &&
    !ambiguous;
  // A declared Beta or production capture build without its token would ship
  // silently off. The EAS
  // worker has the EAS variables, so the build stops there. Commands that only
  // read the config locally (eas config, build:version:get) do not receive them,
  // so they only warn, and the token stays out of that config.
  if (
    (betaEnabled || remoteEnabled) &&
    !/^phc_[A-Za-z0-9_-]{20,}$/.test(text(env, 'NEARSY_POSTHOG_TOKEN'))
  ) {
    const message =
      `[analytics] ${betaEnabled ? 'Beta' : 'Production'} build declared without a valid NEARSY_POSTHOG_TOKEN. ` +
      'Create it in the EAS "production" environment with visibility Sensitive. ' +
      'The value is never printed.';
    if (flag(env, 'EAS_BUILD')) throw new Error(message);
    console.warn(message);
  }
  const appOpenedMinBackgroundSec = optionalNumber(
    env,
    'NEARSY_ANALYTICS_APP_OPENED_MIN_BG_SEC',
  );
  const attributionExpiryHours = optionalNumber(
    env,
    'NEARSY_ATTRIBUTION_EXPIRY_HOURS',
  );
  const appLinks = resolveAppLinks(env);
  const generationIdSinceMs = resolveGenerationIdSinceMs(env);
  return {
    enabled: remoteEnabled,
    ...(generationIdSinceMs !== null ? { generationIdSinceMs } : {}),
    ...(remoteEnabled
      ? {
          environment,
          token: text(env, 'NEARSY_POSTHOG_TOKEN'),
        }
      : {}),
    ...(betaEnabled
      ? {
          beta: {
            enabled: true,
            environment,
            distributionChannel: 'beta',
            token: text(env, 'NEARSY_POSTHOG_TOKEN'),
          },
        }
      : {}),
    ...(flag(env, 'NEARSY_ANALYTICS_SDK_INTERCEPT') ? { sdkIntercept: true } : {}),
    ...(appOpenedMinBackgroundSec !== undefined
      ? { appOpenedMinBackgroundSec }
      : {}),
    attribution: {
      installReferrerEnabled: flag(env, 'NEARSY_ATTRIBUTION_INSTALL_REFERRER'),
      ...(attributionExpiryHours !== undefined ? { attributionExpiryHours } : {}),
      ...(appLinks ? { appLinks } : {}),
    },
  };
}

/** Verified App Link for one exact prefix; empty until both values exist. */
function resolveAppLinkIntentFilters(env) {
  const appLinks = resolveAppLinks(env);
  if (!appLinks) return [];
  return [
    {
      action: 'VIEW',
      autoVerify: true,
      category: ['BROWSABLE', 'DEFAULT'],
      data: [
        {
          scheme: 'https',
          host: appLinks.host,
          pathPrefix: appLinks.pathPrefix,
        },
      ],
    },
  ];
}

module.exports = {
  resolveAnalyticsExtras,
  resolveAppLinkIntentFilters,
  resolveGenerationIdSinceMs,
};

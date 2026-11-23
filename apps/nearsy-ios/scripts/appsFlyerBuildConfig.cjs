/**
 * Build-time switch for AppsFlyer/OneLink (contract nc1, shared with Android).
 *
 * Off unless a profile sets NEARSY_APPSFLYER_ENABLED=true. Off means the binary
 * carries nothing of AppsFlyer: the native module is not linked, no AppDelegate
 * forwarding, no Associated Domains entry and no key in `extra`.
 *
 * On requires the SDK dev key in the EAS variable NEARSY_APPSFLYER_DEV_KEY
 * (sensitive, never in Git). Same rule as analyticsBuildConfig.cjs: the EAS
 * builder (`EAS_BUILD=true`) fails without it; a local config read only checks
 * the profile, because the EAS variables are not present on this machine.
 *
 * Never prints the key or any part of it.
 */
const ENABLED_ENV = 'NEARSY_APPSFLYER_ENABLED';
const DEV_KEY_ENV = 'NEARSY_APPSFLYER_DEV_KEY';

/** Confirmed by the Owner (2026-11-21). Changing the host breaks every printed link. */
const ONELINK_HOST = 'nearsy.onelink.me';
const ONELINK_TEMPLATE_ID = 'Uxo6';
const APPLE_APP_ID = '6759302206';
const APPLE_TEAM_ID = '4DX74Q6UH4';

const EXTRA = {
  enabled: 'NEARSY_APPSFLYER_ENABLED',
  devKey: 'NEARSY_APPSFLYER_DEV_KEY',
  appleAppId: 'NEARSY_APPSFLYER_APPLE_APP_ID',
  oneLinkHost: 'NEARSY_ONELINK_HOST',
  oneLinkTemplateId: 'NEARSY_ONELINK_TEMPLATE_ID',
};

function resolveAppsFlyerBuildConfig(env) {
  const flag = String(env[ENABLED_ENV] ?? '').trim();
  if (flag !== '' && flag !== 'true' && flag !== 'false') {
    throw new Error(`[app.config] ${ENABLED_ENV} must be "true" or "false".`);
  }
  if (flag !== 'true') return { enabled: false };

  const devKey = String(env[DEV_KEY_ENV] ?? '').trim();
  // AppsFlyer dev keys are short alphanumeric strings; anything else is a paste error.
  const keyValid = /^[A-Za-z0-9]{16,64}$/.test(devKey);
  const onEasBuilder = String(env.EAS_BUILD ?? '').trim() === 'true';
  if (!keyValid && onEasBuilder) {
    throw new Error(
      `[app.config] ${ENABLED_ENV}=true but ${DEV_KEY_ENV} is missing or malformed. ` +
        'Create it as a sensitive EAS environment variable for this environment before building.',
    );
  }
  return {
    enabled: true,
    keyChecked: keyValid,
    devKey: keyValid ? devKey : null,
    oneLinkHost: ONELINK_HOST,
    associatedDomains: [`applinks:${ONELINK_HOST}`],
  };
}

/** Values the app reads at runtime. Empty when off. */
function appsFlyerExtra(resolved) {
  if (!resolved.enabled || !resolved.devKey) return {};
  return {
    [EXTRA.enabled]: 'true',
    [EXTRA.devKey]: resolved.devKey,
    [EXTRA.appleAppId]: APPLE_APP_ID,
    [EXTRA.oneLinkHost]: ONELINK_HOST,
    [EXTRA.oneLinkTemplateId]: ONELINK_TEMPLATE_ID,
  };
}

module.exports = {
  ENABLED_ENV,
  DEV_KEY_ENV,
  ONELINK_HOST,
  ONELINK_TEMPLATE_ID,
  APPLE_APP_ID,
  APPLE_TEAM_ID,
  EXTRA,
  resolveAppsFlyerBuildConfig,
  appsFlyerExtra,
};

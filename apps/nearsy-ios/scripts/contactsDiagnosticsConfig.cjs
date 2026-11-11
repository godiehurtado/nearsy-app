/**
 * Build-time gate for the Contacts diagnostic reference.
 *
 * Off everywhere except the dedicated internal EAS profile. That profile only
 * declares a window in days; the expiry instant is computed on the EAS builder
 * (EAS_BUILD=true) when the binary is compiled, so the reference disappears a
 * fixed time after the build. Any other profile that declares it fails.
 */

const CONTACTS_DIAGNOSTICS_PROFILE = 'testflight-contacts-diagnostics';
const CONTACTS_DIAGNOSTICS_PROFILE_ENV = 'NEARSY_CONTACTS_DIAGNOSTICS_PROFILE';
const CONTACTS_DIAGNOSTICS_DAYS_ENV = 'NEARSY_CONTACTS_DIAGNOSTICS_DAYS';
const CONTACTS_DIAGNOSTICS_UNTIL_EXTRA = 'NEARSY_CONTACTS_DIAGNOSTICS_UNTIL';
const MAX_WINDOW_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/** @returns {string | undefined} ISO instant to embed, or undefined when off. */
function resolveContactsDiagnosticsUntil(env, nowMs = Date.now()) {
  const marker = String(env[CONTACTS_DIAGNOSTICS_PROFILE_ENV] ?? '').trim();
  const daysRaw = String(env[CONTACTS_DIAGNOSTICS_DAYS_ENV] ?? '').trim();
  if (!marker && !daysRaw) return undefined;

  const profile = String(env.EAS_BUILD_PROFILE ?? '').trim();
  if (
    marker !== CONTACTS_DIAGNOSTICS_PROFILE ||
    (profile && profile !== CONTACTS_DIAGNOSTICS_PROFILE)
  ) {
    throw new Error(
      `[app.config] The Contacts diagnostic reference is only allowed in the ${CONTACTS_DIAGNOSTICS_PROFILE} EAS profile`,
    );
  }
  if (!/^[1-9]\d*$/.test(daysRaw) || Number(daysRaw) > MAX_WINDOW_DAYS) {
    throw new Error(
      `[app.config] ${CONTACTS_DIAGNOSTICS_DAYS_ENV} must be a whole number of days from 1 to ${MAX_WINDOW_DAYS}`,
    );
  }
  // The local CLI read happens before the build; only the builder fixes the instant.
  if (String(env.EAS_BUILD ?? '').trim() !== 'true') return undefined;
  return new Date(nowMs + Number(daysRaw) * DAY_MS).toISOString();
}

module.exports = {
  CONTACTS_DIAGNOSTICS_PROFILE,
  CONTACTS_DIAGNOSTICS_PROFILE_ENV,
  CONTACTS_DIAGNOSTICS_DAYS_ENV,
  CONTACTS_DIAGNOSTICS_UNTIL_EXTRA,
  MAX_WINDOW_DAYS,
  resolveContactsDiagnosticsUntil,
};

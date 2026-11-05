/**
 * Build-time gate for the Contacts diagnostic reference. Off unless the
 * dedicated EAS profile carries an expiry instant in UTC; any other route fails
 * the build instead of shipping the reference by accident.
 */

const CONTACTS_DIAGNOSTICS_PROFILE = 'testflight-contacts-diagnostics';
const CONTACTS_DIAGNOSTICS_UNTIL_ENV = 'NEARSY_CONTACTS_DIAGNOSTICS_UNTIL';
const CONTACTS_DIAGNOSTICS_PROFILE_ENV = 'NEARSY_CONTACTS_DIAGNOSTICS_PROFILE';
const MAX_WINDOW_DAYS = 14;

function resolveContactsDiagnosticsUntil(env, nowMs = Date.now()) {
  const until = String(env[CONTACTS_DIAGNOSTICS_UNTIL_ENV] ?? '').trim();
  if (!until) return undefined;

  const profile = env.EAS_BUILD_PROFILE;
  if (
    env[CONTACTS_DIAGNOSTICS_PROFILE_ENV] !== CONTACTS_DIAGNOSTICS_PROFILE ||
    (profile && profile !== CONTACTS_DIAGNOSTICS_PROFILE)
  ) {
    throw new Error(
      `[app.config] ${CONTACTS_DIAGNOSTICS_UNTIL_ENV} is only allowed in the ${CONTACTS_DIAGNOSTICS_PROFILE} EAS profile`,
    );
  }

  const end = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(until)
    ? Date.parse(until)
    : Number.NaN;
  const latest = nowMs + MAX_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  if (!Number.isFinite(end) || end <= nowMs || end > latest) {
    throw new Error(
      `[app.config] ${CONTACTS_DIAGNOSTICS_UNTIL_ENV} must be a YYYY-MM-DDTHH:mm:ss.sssZ instant within the next ${MAX_WINDOW_DAYS} days`,
    );
  }
  return until;
}

module.exports = {
  CONTACTS_DIAGNOSTICS_PROFILE,
  CONTACTS_DIAGNOSTICS_UNTIL_ENV,
  CONTACTS_DIAGNOSTICS_PROFILE_ENV,
  resolveContactsDiagnosticsUntil,
};

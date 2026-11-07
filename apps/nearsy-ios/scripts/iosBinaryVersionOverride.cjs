/**
 * Optional per-profile override of the iOS marketing version and build number.
 *
 * eas.json uses `appVersionSource: "local"`, so EAS takes both values from the
 * resolved app config. A build profile can set these two variables in its `env`
 * to number one binary without touching app.json, which every other profile
 * still reads. Unset means app.json is used unchanged.
 */
const VERSION_ENV = 'NEARSY_IOS_VERSION';
const BUILD_NUMBER_ENV = 'NEARSY_IOS_BUILD_NUMBER';

function clean(raw) {
  const value = String(raw ?? '').trim();
  return value.length > 0 ? value : undefined;
}

function resolveIosBinaryVersionOverride(env) {
  const version = clean(env[VERSION_ENV]);
  const buildNumber = clean(env[BUILD_NUMBER_ENV]);
  if (version !== undefined && !/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`[app.config] ${VERSION_ENV} must look like 2.0.10, got: ${version}`);
  }
  if (buildNumber !== undefined && !/^[1-9]\d{0,8}$/.test(buildNumber)) {
    throw new Error(`[app.config] ${BUILD_NUMBER_ENV} must be a positive integer, got: ${buildNumber}`);
  }
  return {
    ...(version !== undefined ? { version } : {}),
    ...(buildNumber !== undefined ? { buildNumber } : {}),
  };
}

module.exports = {
  BUILD_NUMBER_ENV,
  VERSION_ENV,
  resolveIosBinaryVersionOverride,
};

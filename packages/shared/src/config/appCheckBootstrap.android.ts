/**
 * Controlled App Check bootstrap for Android (J01).
 * Native SDKs load lazily so Node unit tests can target appCheckPolicy.ts.
 */

import {
  ensureAppCheckInitializedWithDeps,
  ensureAppCheckTokenFoundationWithDeps,
  getAppCheckInitStatus,
  __resetAppCheckBootstrapForTests,
  type AppCheckBootstrapDeps,
  type AppCheckInitStatus,
  type AppCheckTokenFoundation,
} from './appCheckPolicy.ts';

export type {
  AppCheckInitStatus,
  AppCheckBootstrapDeps,
  AppCheckTokenFoundation,
};
export { getAppCheckInitStatus, __resetAppCheckBootstrapForTests };

function defaultDeps(): AppCheckBootstrapDeps {
  // Lazy requires keep Node unit tests free of RNFirebase / Expo native loads.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Constants = require('expo-constants').default ?? require('expo-constants');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const appCheck = require('@react-native-firebase/app-check').default;

  return {
    readExtras: () => Constants.expoConfig?.extra ?? {},
    isJsDev: typeof __DEV__ !== 'undefined' ? __DEV__ : false,
    getAppCheck: () => appCheck(),
  };
}

/**
 * Ensures App Check bootstrap has been attempted once.
 * Safe to call from multiple effects; does not throw on policy reject or native error
 * (status is returned — LinkedIn / callables must treat non-ready as hard failure).
 */
export function ensureAppCheckInitialized(
  deps: AppCheckBootstrapDeps = defaultDeps(),
): Promise<AppCheckInitStatus> {
  return ensureAppCheckInitializedWithDeps(deps);
}

/** Token foundation for future Identity / OTP / Affiliations / Visibility callables. */
export function ensureAppCheckTokenFoundation(
  deps: AppCheckBootstrapDeps = defaultDeps(),
): Promise<AppCheckTokenFoundation> {
  return ensureAppCheckTokenFoundationWithDeps(deps);
}

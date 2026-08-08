/**
 * Controlled App Check bootstrap for Android Development (A3.4.1).
 * Native SDKs load lazily so Node unit tests can target appCheckPolicy.ts.
 */

import {
  ensureAppCheckInitializedWithDeps,
  getAppCheckInitStatus,
  __resetAppCheckBootstrapForTests,
  type AppCheckBootstrapDeps,
  type AppCheckInitStatus,
} from './appCheckPolicy';

export type { AppCheckInitStatus, AppCheckBootstrapDeps };
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
 * Safe to call from multiple effects; does not throw on policy skip or native error.
 */
export function ensureAppCheckInitialized(
  deps: AppCheckBootstrapDeps = defaultDeps(),
): Promise<AppCheckInitStatus> {
  return ensureAppCheckInitializedWithDeps(deps);
}

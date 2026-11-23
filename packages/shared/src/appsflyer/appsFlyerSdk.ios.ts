import type { AppsFlyerSdkPort } from './appsFlyerRuntime';

/**
 * Loaded only when the build switched AppsFlyer on. In other builds the native
 * module is not linked and requiring the package would throw at import time
 * (it builds a NativeEventEmitter eagerly), so it is never required there.
 */
export function loadAppsFlyerSdk(): AppsFlyerSdkPort | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('react-native-appsflyer');
    return (mod?.default ?? mod?.AppsFlyer ?? null) as AppsFlyerSdkPort | null;
  } catch {
    return null;
  }
}

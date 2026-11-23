import type { AppsFlyerSdkPort } from './appsFlyerRuntime';

/** Non-iOS bundles of this history never load the SDK. */
export function loadAppsFlyerSdk(): AppsFlyerSdkPort | null {
  return null;
}

/**
 * Client copy of the Functions app-update contract (`getAppUpdatePolicy`).
 * Source: nearsy-functions `src/modules/appUpdate/contract.ts`.
 * Do not invent extra request/response fields (`required`, `minVersion`, etc.).
 */

export const APP_UPDATE_PLATFORMS = ['ios', 'android'] as const;

export type AppUpdatePlatform = (typeof APP_UPDATE_PLATFORMS)[number];

/**
 * Marketing version on the public store listing. Three non-negative integers,
 * no leading zeros, no pre-release / build suffix (never TestFlight or
 * Play Internal testing labels).
 */
export const APP_UPDATE_VERSION_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/** Exact request keys. Extra fields are rejected by the server. */
export const APP_UPDATE_REQUEST_KEYS = ['platform'] as const;

export type AppUpdatePolicyRequest = {
  platform: AppUpdatePlatform;
};

/**
 * Public policy for one platform. `required` is intentionally absent: this
 * scope is optional notice only. Clients must not treat a missing field as
 * a force-update.
 */
export type AppUpdatePolicyResponse = {
  platform: AppUpdatePlatform;
  enabled: boolean;
  latestVersion: string;
  storeUrl: string;
};

export const IOS_APP_STORE_URL = 'https://apps.apple.com/app/id6759302206';
export const ANDROID_PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.nearsy.app';

export const APP_UPDATE_STORE_URL: Record<AppUpdatePlatform, string> = {
  ios: IOS_APP_STORE_URL,
  android: ANDROID_PLAY_STORE_URL,
};

export const APP_UPDATE_CALLABLE_NAME = 'getAppUpdatePolicy' as const;
export const APP_UPDATE_FUNCTIONS_REGION = 'us-central1' as const;

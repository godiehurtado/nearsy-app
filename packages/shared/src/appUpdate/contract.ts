/**
 * Client copy of the Functions app-update contract (`getAppUpdatePolicy`), v2.
 *
 * Source of truth (nearsy-functions PR #43, HEAD
 * 5e524d1cd2cfa7b3d58137bd5d07cda71e927a45):
 *   - `src/modules/appUpdate/contract.ts`
 *   - `src/modules/appUpdate/CONTRACT.md`
 *   - `docs/operations/app-update-policy-contract.md`
 *
 * Do not invent extra request/response fields. Only the Android subset of the
 * contract is mirrored here (`platform: 'android'`, channels `production` |
 * `playInternal`).
 */

export const APP_UPDATE_PLATFORMS = ['ios', 'android'] as const;
export type AppUpdatePlatform = (typeof APP_UPDATE_PLATFORMS)[number];

/** Distribution channel — not the Firebase project id (CONTRACT.md). */
export const APP_UPDATE_CHANNELS = [
  'production',
  'testflight',
  'playInternal',
] as const;
export type AppUpdateChannel = (typeof APP_UPDATE_CHANNELS)[number];

/** Channels valid for `platform: 'android'`. */
export const ANDROID_APP_UPDATE_CHANNELS = [
  'production',
  'playInternal',
] as const;
export type AndroidAppUpdateChannel =
  (typeof ANDROID_APP_UPDATE_CHANNELS)[number];

/** Marketing version: three non-negative integers, no pre-release suffix. */
export const APP_UPDATE_VERSION_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/** Build / Android `versionCode`: non-negative integer, no leading zeros. */
export const APP_UPDATE_BUILD_RE = /^(0|[1-9]\d*)$/;

/**
 * Exact request keys. Extra keys are `invalid-argument` on the server.
 * `channel` is optional on the wire (default `production`).
 */
export const APP_UPDATE_REQUEST_KEYS = ['platform', 'channel'] as const;

/** v2 request. */
export type AppUpdatePolicyRequest = {
  platform: AppUpdatePlatform;
  channel?: AppUpdateChannel;
};

/** Pre-v2 (PR #34) request. Implies `production` on a v2 server. */
export type AppUpdateLegacyRequest = { platform: AppUpdatePlatform };

/** One comparable release identity. Empty strings mean “not configured”. */
export type AppUpdateReleaseTarget = {
  marketingVersion: string;
  build: string;
};

/** Wire response (v2). Legacy aliases are retained by the server. */
export type AppUpdatePolicyWireResponse = {
  platform: AppUpdatePlatform;
  channel: AppUpdateChannel;
  appId: string;
  softEnabled: boolean;
  recommended: AppUpdateReleaseTarget;
  forceEnabled: boolean;
  minimum: AppUpdateReleaseTarget;
  updateUrl: string;
  cacheTtlSeconds: number;
  /** Legacy alias of `softEnabled`. */
  enabled: boolean;
  /** Legacy alias of `recommended.marketingVersion`. */
  latestVersion: string;
  /** Legacy alias of `updateUrl`. */
  storeUrl: string;
};

export const ANDROID_APPLICATION_ID = 'com.nearsy.app';
export const ANDROID_PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${ANDROID_APPLICATION_ID}`;
/** Play Internal testing landing for this application id (CONTRACT.md). */
export const ANDROID_PLAY_INTERNAL_URL = `https://play.google.com/apps/testing/${ANDROID_APPLICATION_ID}`;

export const APP_UPDATE_DEFAULT_URL_ANDROID: Record<
  AndroidAppUpdateChannel,
  string
> = {
  production: ANDROID_PLAY_STORE_URL,
  playInternal: ANDROID_PLAY_INTERNAL_URL,
};

/** Server allowlist prefixes for android (contract.ts). */
export const APP_UPDATE_URL_ALLOWLIST_PREFIXES_ANDROID = [
  'https://play.google.com/store/apps/',
  'https://play.google.com/apps/testing/',
  'https://play.google.com/apps/internaltest/',
] as const;

export const APP_UPDATE_DEFAULT_CACHE_TTL_SECONDS = 3600;
export const APP_UPDATE_MIN_CACHE_TTL_SECONDS = 60;
export const APP_UPDATE_MAX_CACHE_TTL_SECONDS = 86_400;

export const APP_UPDATE_CALLABLE_NAME = 'getAppUpdatePolicy' as const;
export const APP_UPDATE_FUNCTIONS_REGION = 'us-central1' as const;

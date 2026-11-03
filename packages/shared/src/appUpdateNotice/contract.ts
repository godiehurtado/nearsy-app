/**
 * Client parse of Functions `getAppUpdatePolicy`.
 *
 * Contract SHA: 5e524d1cd2cfa7b3d58137bd5d07cda71e927a45
 * (feat/209-app-update-policy-v2). Legacy PR #34 `{ platform }` →
 * `{ enabled, latestVersion, storeUrl }` remains accepted.
 */

import {
  isAllowlistedIosUpdateUrl,
  isPublicAppStoreUrl,
  isTestFlightUpdateUrl,
} from './storeListing';

export const GET_APP_UPDATE_POLICY = 'getAppUpdatePolicy' as const;
export const APP_UPDATE_NOTICE_REGION = 'us-central1' as const;
export const APP_UPDATE_NOTICE_HTTP_TIMEOUT_MS = 15_000;
export const APP_UPDATE_NOTICE_CONTRACT_SHA =
  '5e524d1cd2cfa7b3d58137bd5d07cda71e927a45' as const;

export const APP_UPDATE_VERSION_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
export const APP_UPDATE_BUILD_RE = /^(0|[1-9]\d*)$/;

export type AppUpdateChannel = 'production' | 'testflight';

export type AppUpdateReleaseTarget = {
  marketingVersion: string;
  build: string;
};

export type AppUpdateNoticeConfig = {
  platform: 'ios';
  channel: AppUpdateChannel;
  softEnabled: boolean;
  recommended: AppUpdateReleaseTarget;
  forceEnabled: boolean;
  minimum: AppUpdateReleaseTarget;
  updateUrl: string;
  cacheTtlSeconds: number;
  /** Legacy aliases */
  enabled: boolean;
  latestVersion: string;
  storeUrl: string;
};

export type AppUpdateNoticeParseResult =
  | { ok: true; config: AppUpdateNoticeConfig }
  | { ok: false };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isCanonicalAppUpdateVersion(value: string): boolean {
  return APP_UPDATE_VERSION_RE.test(value.trim());
}

export function isCanonicalAppUpdateBuild(value: string): boolean {
  return APP_UPDATE_BUILD_RE.test(value.trim());
}

function parseTarget(value: unknown): AppUpdateReleaseTarget | null {
  if (!isPlainObject(value)) return null;
  if (typeof value.marketingVersion !== 'string') return null;
  if (typeof value.build !== 'string') return null;
  const marketingVersion = value.marketingVersion.trim();
  const build = value.build.trim();
  if (marketingVersion.length > 0 && !isCanonicalAppUpdateVersion(marketingVersion)) {
    return null;
  }
  if (build.length > 0 && !isCanonicalAppUpdateBuild(build)) {
    return null;
  }
  if ((marketingVersion.length === 0) !== (build.length === 0)) {
    // Partial targets are invalid when soft/force is on; empty/empty is ok.
    return null;
  }
  return { marketingVersion, build };
}

function emptyTarget(): AppUpdateReleaseTarget {
  return { marketingVersion: '', build: '' };
}

export function buildAppUpdatePolicyRequest(channel: AppUpdateChannel): {
  platform: 'ios';
  channel: AppUpdateChannel;
} {
  return { platform: 'ios', channel };
}

/** Legacy PR #34 request (implies production). */
export const APP_UPDATE_NOTICE_REQUEST = { platform: 'ios' } as const;

/**
 * Fail-closed parser. Accepts v2 full documents and legacy PR #34 shapes.
 * Rejects TestFlight channel paired with a public App Store URL (Beta safety).
 */
export function parseAppUpdateNoticeConfig(
  data: unknown,
): AppUpdateNoticeParseResult {
  if (!isPlainObject(data)) return { ok: false };
  if (data.platform !== 'ios') return { ok: false };

  const channelRaw =
    typeof data.channel === 'string' ? data.channel.trim() : 'production';
  if (channelRaw !== 'production' && channelRaw !== 'testflight') {
    return { ok: false };
  }
  const channel = channelRaw as AppUpdateChannel;

  // --- v2 fields (preferred) ---
  const hasV2 =
    typeof data.softEnabled === 'boolean' ||
    typeof data.forceEnabled === 'boolean' ||
    isPlainObject(data.recommended) ||
    isPlainObject(data.minimum);

  if (hasV2) {
    if (typeof data.softEnabled !== 'boolean') return { ok: false };
    if (typeof data.forceEnabled !== 'boolean') return { ok: false };
    if (typeof data.updateUrl !== 'string') return { ok: false };
    const recommended = parseTarget(data.recommended) ?? emptyTarget();
    const minimum = parseTarget(data.minimum) ?? emptyTarget();
    const updateUrl = data.updateUrl.trim();
    if (!isAllowlistedIosUpdateUrl(updateUrl)) return { ok: false };
    if (channel === 'testflight' && isPublicAppStoreUrl(updateUrl)) {
      return { ok: false };
    }
    if (channel === 'production' && isTestFlightUpdateUrl(updateUrl)) {
      // Production soft may still use App Store only; TestFlight URL on
      // production channel is rejected to avoid cross-channel confusion.
      return { ok: false };
    }
    if (
      data.softEnabled &&
      (recommended.marketingVersion.length === 0 || recommended.build.length === 0)
    ) {
      return { ok: false };
    }
    if (
      data.forceEnabled &&
      (minimum.marketingVersion.length === 0 || minimum.build.length === 0)
    ) {
      return { ok: false };
    }
    const cacheTtlSeconds =
      typeof data.cacheTtlSeconds === 'number' &&
      Number.isFinite(data.cacheTtlSeconds) &&
      data.cacheTtlSeconds > 0
        ? Math.floor(data.cacheTtlSeconds)
        : 3600;

    return {
      ok: true,
      config: {
        platform: 'ios',
        channel,
        softEnabled: data.softEnabled,
        recommended,
        forceEnabled: data.forceEnabled,
        minimum,
        updateUrl,
        cacheTtlSeconds,
        enabled: data.softEnabled,
        latestVersion: recommended.marketingVersion,
        storeUrl: updateUrl,
      },
    };
  }

  // --- Legacy PR #34 ---
  if (typeof data.enabled !== 'boolean') return { ok: false };
  if (typeof data.latestVersion !== 'string') return { ok: false };
  if (typeof data.storeUrl !== 'string') return { ok: false };

  const latestVersion = data.latestVersion.trim();
  if (latestVersion.length > 0 && !isCanonicalAppUpdateVersion(latestVersion)) {
    return { ok: false };
  }
  const storeUrl = data.storeUrl.trim();
  if (!isAllowlistedIosUpdateUrl(storeUrl)) return { ok: false };
  if (channel === 'testflight' && isPublicAppStoreUrl(storeUrl)) {
    return { ok: false };
  }

  const recommended =
    latestVersion.length > 0
      ? { marketingVersion: latestVersion, build: '0' }
      : emptyTarget();

  return {
    ok: true,
    config: {
      platform: 'ios',
      channel,
      softEnabled: data.enabled,
      recommended,
      forceEnabled: false,
      minimum: emptyTarget(),
      updateUrl: storeUrl,
      cacheTtlSeconds: 3600,
      enabled: data.enabled,
      latestVersion,
      storeUrl,
    },
  };
}

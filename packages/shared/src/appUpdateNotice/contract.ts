/**
 * Optional App Store update notice — client parse of Functions
 * `getAppUpdatePolicy` (PR #34, HEAD cf9fced).
 *
 * Canonical request: `{ platform: "ios" }`. Canonical response:
 * `{ platform, enabled, latestVersion, storeUrl }`. Empty `latestVersion`
 * means none configured. Extra keys (force / required / minVersion) are
 * ignored and never treated as a force-update.
 */

import { isOfficialIosStoreUrl } from './storeListing';

export const GET_APP_UPDATE_POLICY = 'getAppUpdatePolicy' as const;
export const APP_UPDATE_NOTICE_REGION = 'us-central1' as const;
export const APP_UPDATE_NOTICE_HTTP_TIMEOUT_MS = 15_000;
export const APP_UPDATE_NOTICE_REQUEST = { platform: 'ios' } as const;

/** Three-component public store version from Functions. Empty is "none". */
export const APP_UPDATE_VERSION_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export type AppUpdateNoticeConfig = {
  platform: 'ios';
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

/**
 * Fail-closed parser of the Functions response. `latestVersion === ''` is
 * valid (not configured). Unexpected store URLs are invalid.
 */
export function parseAppUpdateNoticeConfig(
  data: unknown,
): AppUpdateNoticeParseResult {
  if (!isPlainObject(data)) return { ok: false };

  if (data.platform !== 'ios') return { ok: false };
  if (typeof data.enabled !== 'boolean') return { ok: false };
  if (typeof data.latestVersion !== 'string') return { ok: false };
  if (typeof data.storeUrl !== 'string') return { ok: false };

  const latestVersion = data.latestVersion.trim();
  if (latestVersion.length > 0 && !isCanonicalAppUpdateVersion(latestVersion)) {
    return { ok: false };
  }

  const storeUrl = data.storeUrl.trim();
  if (!isOfficialIosStoreUrl(storeUrl)) return { ok: false };

  return {
    ok: true,
    config: {
      platform: 'ios',
      enabled: data.enabled,
      latestVersion,
      storeUrl,
    },
  };
}

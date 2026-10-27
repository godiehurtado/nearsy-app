/**
 * Optional App Store update notice — client parse of the Functions-owned
 * payload. Field names `enabled` and `latestVersion` come from the 2.0.9
 * product contract Functions is publishing. Do not add a second endpoint
 * or extra required fields here.
 *
 * Transport name stays empty until that callable is published; an empty
 * name means the client must not invent or call a placeholder function.
 */

export const APP_UPDATE_NOTICE_REGION = 'us-central1' as const;

/**
 * Published callable name from Functions. Empty until the backend contract
 * lands — the iOS host then fail-softs and never hits the network.
 */
export const APP_UPDATE_NOTICE_CALLABLE_NAME = '' as const;

export const APP_UPDATE_NOTICE_HTTP_TIMEOUT_MS = 15_000;

const VERSION_SHAPE = /^\d+(\.\d+)*$/;

export type AppUpdateNoticeConfig = {
  enabled: boolean;
  latestVersion: string;
};

export type AppUpdateNoticeParseResult =
  | { ok: true; config: AppUpdateNoticeConfig }
  | { ok: false };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isCanonicalAppUpdateVersion(value: string): boolean {
  return VERSION_SHAPE.test(value.trim());
}

/**
 * Fail-closed parser. Extra keys are ignored (never treated as force-update).
 * String booleans, build numbers, and JS bundle labels are invalid.
 */
export function parseAppUpdateNoticeConfig(
  data: unknown,
): AppUpdateNoticeParseResult {
  if (!isPlainObject(data)) return { ok: false };

  if (typeof data.enabled !== 'boolean') return { ok: false };
  if (typeof data.latestVersion !== 'string') return { ok: false };

  const latestVersion = data.latestVersion.trim();
  if (!isCanonicalAppUpdateVersion(latestVersion)) return { ok: false };

  return {
    ok: true,
    config: {
      enabled: data.enabled,
      latestVersion,
    },
  };
}

import {
  ANDROID_APPLICATION_ID,
  APP_UPDATE_DEFAULT_CACHE_TTL_SECONDS,
  APP_UPDATE_MAX_CACHE_TTL_SECONDS,
  APP_UPDATE_MIN_CACHE_TTL_SECONDS,
  type AndroidAppUpdateChannel,
  type AppUpdateLegacyRequest,
  type AppUpdatePolicyRequest,
  type AppUpdateReleaseTarget,
} from './contract.ts';
import {
  parseBuild,
  parseMarketingVersion,
  parseReleaseTarget,
} from './compareVersions.ts';

/**
 * Parsed, validated Android policy for ONE channel. `source: 'legacy'` means
 * the pre-v2 `{ enabled, latestVersion, storeUrl }` surface (production only).
 */
export type AppUpdatePolicy = {
  source: 'v2' | 'legacy';
  platform: 'android';
  channel: AndroidAppUpdateChannel;
  softEnabled: boolean;
  /** Fully configured or `null` (not configured). */
  recommended: AppUpdateReleaseTarget | null;
  forceEnabled: boolean;
  /** Fully configured or `null` (not configured / partial). */
  minimum: AppUpdateReleaseTarget | null;
  updateUrl: string;
  cacheTtlSeconds: number;
};

const EMPTY_TARGET: AppUpdateReleaseTarget = {
  marketingVersion: '',
  build: '',
};

/** Exact v2 Android request (CONTRACT.md "Request"). */
export function buildAppUpdatePolicyRequest(
  channel: AndroidAppUpdateChannel,
): AppUpdatePolicyRequest {
  return { platform: 'android', channel };
}

/** Exact pre-v2 request. Never carries a channel. */
export const ANDROID_LEGACY_APP_UPDATE_REQUEST: AppUpdateLegacyRequest = {
  platform: 'android',
};

/**
 * Pre-v2 servers reject unknown keys (`channel`) with `invalid-argument`.
 * RNFirebase reports `functions/invalid-argument` (or the bare code).
 */
export function isInvalidArgumentError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const rec = error as Record<string, unknown>;
  for (const key of ['code', 'nativeErrorCode'] as const) {
    const value = rec[key];
    if (
      typeof value === 'string' &&
      /(^|\/)invalid[-_]argument$/i.test(value.trim())
    ) {
      return true;
    }
  }
  return false;
}

// `play.google.com` only, https only. Query characters are limited so a
// server override can add e.g. `&hl=en` but nothing exotic.
const QUERY_TAIL = '[A-Za-z0-9_=%.\\-&]*';
const PACKAGE_RE = ANDROID_APPLICATION_ID.replace(/\./g, '\\.');
const PRODUCTION_URL_RE = new RegExp(
  `^https://play\\.google\\.com/store/apps/details\\?id=${PACKAGE_RE}(&${QUERY_TAIL})?$`,
);
const INTERNAL_TESTING_URL_RE = new RegExp(
  `^https://play\\.google\\.com/apps/testing/${PACKAGE_RE}(\\?${QUERY_TAIL})?$`,
);
const INTERNAL_OPTIN_URL_RE = new RegExp(
  `^https://play\\.google\\.com/apps/internaltest/[A-Za-z0-9_-]+(\\?${QUERY_TAIL})?$`,
);

/**
 * Channel-scoped allowlist (stricter than the server's prefix allowlist).
 * Production must be the public listing for this package; Internal must be a
 * Play testing / opt-in URL. This keeps an Internal install from being sent to
 * the public listing (an older public build) and vice versa (CONTRACT.md
 * client comparison rule 5).
 */
export function allowlistedAndroidUpdateUrl(
  url: unknown,
  channel: AndroidAppUpdateChannel,
): string | null {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (trimmed.length === 0 || trimmed.length > 512) return null;
  if (channel === 'production') {
    return PRODUCTION_URL_RE.test(trimmed) ? trimmed : null;
  }
  return INTERNAL_TESTING_URL_RE.test(trimmed) ||
    INTERNAL_OPTIN_URL_RE.test(trimmed)
    ? trimmed
    : null;
}

type TargetParse = { ok: true; target: AppUpdateReleaseTarget | null } | { ok: false };

function parseWireTarget(value: unknown): TargetParse {
  if (value === undefined || value === null) return { ok: true, target: null };
  if (typeof value !== 'object' || Array.isArray(value)) return { ok: false };
  const rec = value as Record<string, unknown>;
  const marketingVersion =
    typeof rec.marketingVersion === 'string' ? rec.marketingVersion.trim() : '';
  const build = typeof rec.build === 'string' ? rec.build.trim() : '';
  if (marketingVersion === '' && build === '') return { ok: true, target: null };
  // Garbage in a field the server populated => invalid policy (fail open).
  if (marketingVersion !== '' && !parseMarketingVersion(marketingVersion)) {
    return { ok: false };
  }
  if (build !== '' && !parseBuild(build)) return { ok: false };
  // A half-set target is "not configured": never soft/force against it.
  return { ok: true, target: parseReleaseTarget({ marketingVersion, build }) };
}

function parseTtl(value: unknown): number | null {
  if (value === undefined) return APP_UPDATE_DEFAULT_CACHE_TTL_SECONDS;
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < APP_UPDATE_MIN_CACHE_TTL_SECONDS ||
    value > APP_UPDATE_MAX_CACHE_TTL_SECONDS
  ) {
    return null;
  }
  return value;
}

/**
 * Parse a v2 response. Unknown keys are ignored (CONTRACT.md). Returns `null`
 * on any invalid policy so callers fail open. The response must be for the
 * channel we asked for, and `updateUrl` must be allowlisted for that channel.
 *
 * Legacy aliases (`enabled`, `latestVersion`, `storeUrl`) are consulted ONLY
 * when the corresponding v2 field is absent.
 */
export function parseAppUpdatePolicyV2(
  data: unknown,
  expectedChannel: AndroidAppUpdateChannel,
): AppUpdatePolicy | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const raw = data as Record<string, unknown>;
  if (raw.platform !== 'android') return null;
  if (raw.channel !== expectedChannel) return null;

  let softEnabled: boolean;
  if (typeof raw.softEnabled === 'boolean') softEnabled = raw.softEnabled;
  else if (raw.softEnabled === undefined && typeof raw.enabled === 'boolean') {
    softEnabled = raw.enabled;
  } else return null;

  let forceEnabled = false;
  if (raw.forceEnabled !== undefined) {
    if (typeof raw.forceEnabled !== 'boolean') return null;
    forceEnabled = raw.forceEnabled;
  }

  let recommendedWire: unknown = raw.recommended;
  if (recommendedWire === undefined && typeof raw.latestVersion === 'string') {
    // Alias: latestVersion ≡ recommended.marketingVersion. Build is unknown.
    recommendedWire = { marketingVersion: raw.latestVersion, build: '0' };
    if (raw.latestVersion.trim() === '') recommendedWire = EMPTY_TARGET;
  }
  const recommended = parseWireTarget(recommendedWire);
  const minimum = parseWireTarget(raw.minimum);
  if (!recommended.ok || !minimum.ok) return null;

  const urlRaw = raw.updateUrl !== undefined ? raw.updateUrl : raw.storeUrl;
  const updateUrl = allowlistedAndroidUpdateUrl(urlRaw, expectedChannel);
  if (!updateUrl) return null;

  const cacheTtlSeconds = parseTtl(raw.cacheTtlSeconds);
  if (cacheTtlSeconds == null) return null;

  return {
    source: 'v2',
    platform: 'android',
    channel: expectedChannel,
    softEnabled,
    recommended: recommended.target,
    forceEnabled,
    minimum: minimum.target,
    updateUrl,
    cacheTtlSeconds,
  };
}

/**
 * Parse the pre-v2 `{ platform, enabled, latestVersion, storeUrl }` response.
 * Production only: that surface cannot express Play Internal. Build is
 * treated as `0` (CONTRACT.md "Legacy"), so only a newer marketing version
 * can trigger a soft notice. Never soft/force on `required`/`minVersion`.
 */
export function parseAppUpdatePolicyLegacy(
  data: unknown,
): AppUpdatePolicy | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const raw = data as Record<string, unknown>;
  if (raw.platform !== 'android') return null;
  if (typeof raw.enabled !== 'boolean') return null;
  if (typeof raw.latestVersion !== 'string') return null;
  const latest = raw.latestVersion.trim();
  if (latest !== '' && !parseMarketingVersion(latest)) return null;
  const updateUrl = allowlistedAndroidUpdateUrl(raw.storeUrl, 'production');
  if (!updateUrl) return null;
  return {
    source: 'legacy',
    platform: 'android',
    channel: 'production',
    softEnabled: raw.enabled && latest !== '',
    recommended:
      latest === '' ? null : { marketingVersion: latest, build: '0' },
    forceEnabled: false,
    minimum: null,
    updateUrl,
    cacheTtlSeconds: APP_UPDATE_DEFAULT_CACHE_TTL_SECONDS,
  };
}

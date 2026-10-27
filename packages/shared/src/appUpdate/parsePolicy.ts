import {
  ANDROID_PLAY_STORE_URL,
  APP_UPDATE_PLATFORMS,
  APP_UPDATE_VERSION_RE,
  type AppUpdatePlatform,
  type AppUpdatePolicyRequest,
  type AppUpdatePolicyResponse,
} from './contract.ts';

export function parseStoreVersion(raw: string | undefined | null): string | null {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (!APP_UPDATE_VERSION_RE.test(trimmed)) return null;
  return trimmed;
}

/** Exact Android callable JSON. Extra keys are `invalid-argument` on the server. */
export const ANDROID_APP_UPDATE_POLICY_REQUEST: AppUpdatePolicyRequest = {
  platform: 'android',
};

/**
 * Client request: exact `{ platform }`. Never send extras.
 */
export function buildAppUpdatePolicyRequest(
  platform: AppUpdatePlatform,
): AppUpdatePolicyRequest {
  return platform === 'android'
    ? ANDROID_APP_UPDATE_POLICY_REQUEST
    : { platform };
}

/** Server `storeUrl` must be the public Play listing; never Internal/TestFlight. */
export function officialAndroidStoreUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  return trimmed === ANDROID_PLAY_STORE_URL ? trimmed : null;
}

function isPlatform(value: unknown): value is AppUpdatePlatform {
  return (
    typeof value === 'string' &&
    (APP_UPDATE_PLATFORMS as readonly string[]).includes(value)
  );
}

/**
 * Fail closed on invalid config. Extra response keys are ignored; unknown
 * `required` / `force` / `minVersion` fields are never read.
 */
export function parseAppUpdatePolicyResponse(
  data: unknown,
  expectedPlatform: AppUpdatePlatform,
): AppUpdatePolicyResponse | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const raw = data as Record<string, unknown>;
  if (!isPlatform(raw.platform) || raw.platform !== expectedPlatform) return null;
  if (typeof raw.enabled !== 'boolean') return null;
  if (typeof raw.latestVersion !== 'string') return null;
  if (typeof raw.storeUrl !== 'string') return null;

  const latestVersion = raw.latestVersion.trim();
  if (latestVersion.length > 0 && !APP_UPDATE_VERSION_RE.test(latestVersion)) {
    return null;
  }

  const storeUrl =
    expectedPlatform === 'android'
      ? officialAndroidStoreUrl(raw.storeUrl)
      : typeof raw.storeUrl === 'string'
        ? raw.storeUrl.trim()
        : null;
  if (!storeUrl) return null;

  return {
    platform: raw.platform,
    enabled: raw.enabled,
    latestVersion,
    storeUrl,
  };
}

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

/**
 * Client request: exact `{ platform: 'android' }` (or `ios`). Never send extras.
 */
export function buildAppUpdatePolicyRequest(
  platform: AppUpdatePlatform,
): AppUpdatePolicyRequest {
  return { platform };
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

  const storeUrl = raw.storeUrl.trim();
  if (expectedPlatform === 'android' && storeUrl !== ANDROID_PLAY_STORE_URL) {
    return null;
  }

  return {
    platform: raw.platform,
    enabled: raw.enabled,
    latestVersion,
    storeUrl,
  };
}

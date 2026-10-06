import type { SocialCustomLink } from '../types/profile';
import {
  CRJ_SOCIAL_PLATFORMS,
  CUSTOM_NETWORK_NAME_MAX,
  type CrjSocialDraftValues,
  type CrjSocialPlatformId,
} from './onboardingSocialCatalog';
import { normalizeSocialLinkUrl, type SocialLinkUrlPlatform } from './socialLinkUrl';

export type SocialNormalizeOk = { ok: true; url?: string };
export type SocialNormalizeErr = { ok: false; reason: 'invalid' };
export type SocialNormalizeResult = SocialNormalizeOk | SocialNormalizeErr;

function toNormalizeResult(
  platform: SocialLinkUrlPlatform,
  raw: unknown,
): SocialNormalizeResult {
  if (typeof raw !== 'string') return { ok: false, reason: 'invalid' };
  if (!raw.trim()) return { ok: true };
  const url = normalizeSocialLinkUrl(platform, raw);
  return url ? { ok: true, url } : { ok: false, reason: 'invalid' };
}

/**
 * Accept @handle, username, or URL. Persist the canonical HTTPS URL
 * (platform host allowlist, `http` upgraded, X stored on x.com).
 * Empty / whitespace → omit (ok, no url).
 */
export function normalizeSocialInput(
  platformId: CrjSocialPlatformId | 'website',
  raw: string,
): SocialNormalizeResult {
  return toNormalizeResult(platformId, raw ?? '');
}

/** Website and custom-network URLs: any public HTTPS host, never a handle. */
export function normalizeCustomNetworkUrl(raw: string): SocialNormalizeResult {
  return toNormalizeResult('website', raw ?? '');
}

export function validateCustomNetworkName(raw: string): {
  ok: boolean;
  reason?: 'required' | 'tooLong';
} {
  const name = raw.trim();
  if (!name) return { ok: false, reason: 'required' };
  if (name.length > CUSTOM_NETWORK_NAME_MAX) {
    return { ok: false, reason: 'tooLong' };
  }
  return { ok: true };
}

export function isDuplicateCustomNetwork(
  list: SocialCustomLink[],
  name: string,
): boolean {
  const key = name.trim().toLowerCase();
  if (!key) return false;
  return list.some((row) => row.name.trim().toLowerCase() === key);
}

export type CrjSocialFieldErrors = Partial<
  Record<CrjSocialPlatformId | 'custom', string>
>;

export function collectSocialFieldErrors(
  values: CrjSocialDraftValues,
  reasonLabel: string,
): CrjSocialFieldErrors {
  const errors: CrjSocialFieldErrors = {};
  for (const platform of CRJ_SOCIAL_PLATFORMS) {
    const result = normalizeSocialInput(platform.id, values[platform.id] ?? '');
    if (!result.ok) errors[platform.id] = reasonLabel;
  }
  return errors;
}

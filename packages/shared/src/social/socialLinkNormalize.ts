import type { SocialCustomLink } from '../types/profile.ts';
import {
  CRJ_SOCIAL_PLATFORMS,
  CUSTOM_NETWORK_NAME_MAX,
  type CrjSocialDraftValues,
  type CrjSocialPlatformId,
} from './onboardingSocialCatalog.ts';
import { normalizeSocialLinkUrl } from './socialLinkUrl.ts';

export type SocialNormalizeOk = { ok: true; url?: string };
export type SocialNormalizeErr = { ok: false; reason: 'invalid' };
export type SocialNormalizeResult = SocialNormalizeOk | SocialNormalizeErr;

function toNormalizeResult(raw: string, url: string | null): SocialNormalizeResult {
  if (!(raw ?? '').trim()) return { ok: true };
  return url ? { ok: true, url } : { ok: false, reason: 'invalid' };
}

/**
 * Accept @handle, username, or URL. Persist the canonical HTTPS URL accepted by the
 * Discovery backend (per-network host allowlist). Empty / whitespace → omit (ok, no url).
 */
export function normalizeSocialInput(
  platformId: CrjSocialPlatformId,
  raw: string,
): SocialNormalizeResult {
  return toNormalizeResult(raw, normalizeSocialLinkUrl(platformId, raw));
}

/** Website and custom networks: any public HTTPS host (http upgraded). */
export function normalizeCustomNetworkUrl(raw: string): SocialNormalizeResult {
  return toNormalizeResult(raw, normalizeSocialLinkUrl('website', raw));
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

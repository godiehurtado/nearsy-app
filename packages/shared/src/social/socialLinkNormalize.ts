import type { SocialCustomLink } from '../types/profile.ts';
import {
  CRJ_SOCIAL_PLATFORMS,
  CUSTOM_NETWORK_NAME_MAX,
  type CrjSocialDraftValues,
  type CrjSocialPlatformId,
} from './onboardingSocialCatalog.ts';

export type SocialNormalizeOk = { ok: true; url?: string };
export type SocialNormalizeErr = { ok: false; reason: 'invalid' };
export type SocialNormalizeResult = SocialNormalizeOk | SocialNormalizeErr;

const HANDLE_RE = /^[A-Za-z0-9._-]+$/;
const YOUTUBE_HANDLE_RE = /^[A-Za-z0-9._-]{1,100}$/;

function stripAt(value: string): string {
  return value.replace(/^@+/, '').trim();
}

function looksLikeUrl(raw: string): boolean {
  const value = raw.trim();
  if (!value) return false;
  if (/^(https?:)\/\//i.test(value)) return true;
  if (/^www\./i.test(value)) return true;
  if (/^(linkedin|instagram|facebook|youtube|youtu\.be|twitter|x|tiktok|snapchat)\.com\b/i.test(value)) {
    return true;
  }
  return /[a-z0-9-]+\.[a-z]{2,}\//i.test(value);
}

/** Coerce a user-entered URL into http(s). Null when obviously unusable. */
export function coerceHttpUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^(javascript|data|file|about):/i.test(trimmed)) return null;

  let candidate = trimmed;
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate.replace(/^\/+/, '')}`;
  }

  try {
    const url = new URL(candidate);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname.includes('.')) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function canonicalXUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (
      parsed.hostname === 'twitter.com' ||
      parsed.hostname === 'www.twitter.com' ||
      parsed.hostname === 'mobile.twitter.com'
    ) {
      parsed.hostname = 'x.com';
      return parsed.toString();
    }
  } catch {
    /* keep original */
  }
  return url;
}

function handleToUrl(id: CrjSocialPlatformId, handle: string): string | null {
  const clean = stripAt(handle);
  if (!clean) return null;
  const re = id === 'youtube' ? YOUTUBE_HANDLE_RE : HANDLE_RE;
  if (!re.test(clean) || /\s/.test(clean)) return null;

  switch (id) {
    case 'linkedin':
      return `https://www.linkedin.com/in/${clean}`;
    case 'instagram':
      return `https://www.instagram.com/${clean}`;
    case 'facebook':
      return `https://www.facebook.com/${clean}`;
    case 'youtube':
      return `https://www.youtube.com/@${clean}`;
    case 'x':
      return `https://x.com/${clean}`;
    case 'tiktok':
      return `https://www.tiktok.com/@${clean}`;
    case 'snapchat':
      return `https://www.snapchat.com/add/${clean}`;
  }
}

/**
 * Accept @handle, username, or URL. Persist the production canonical URL.
 * Empty / whitespace → omit (ok, no url).
 */
export function normalizeSocialInput(
  platformId: CrjSocialPlatformId,
  raw: string,
): SocialNormalizeResult {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return { ok: true };

  if (looksLikeUrl(trimmed)) {
    const url = coerceHttpUrl(trimmed);
    if (!url) return { ok: false, reason: 'invalid' };
    return {
      ok: true,
      url: platformId === 'x' ? canonicalXUrl(url) : url,
    };
  }

  const url = handleToUrl(platformId, trimmed);
  if (!url) return { ok: false, reason: 'invalid' };
  return { ok: true, url };
}

export function normalizeCustomNetworkUrl(raw: string): SocialNormalizeResult {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return { ok: true };
  if (looksLikeUrl(trimmed) || trimmed.includes('.')) {
    const url = coerceHttpUrl(trimmed);
    if (!url) return { ok: false, reason: 'invalid' };
    return { ok: true, url };
  }
  return { ok: false, reason: 'invalid' };
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

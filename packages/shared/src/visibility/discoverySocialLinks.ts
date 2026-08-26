/**
 * Public social links for getDiscoveryProfile (Detail only).
 * No usernames, tokens, or private bags — platform + https url only.
 */

import { createContractResponseError } from './callables/errors';

export type DiscoverySocialPlatform =
  | 'linkedin'
  | 'instagram'
  | 'facebook'
  | 'youtube'
  | 'x'
  | 'tiktok'
  | 'snapchat'
  | 'website';

export type DiscoveryPublicSocialLink = {
  platform: DiscoverySocialPlatform;
  url: string;
};

export const DISCOVERY_SOCIAL_PLATFORMS: readonly DiscoverySocialPlatform[] = [
  'linkedin',
  'instagram',
  'facebook',
  'youtube',
  'x',
  'tiktok',
  'snapchat',
  'website',
] as const;

const PLATFORM_SET = new Set<string>(DISCOVERY_SOCIAL_PLATFORMS);

/** Visual tokens aligned with CRJ / approved design (website added for Detail). */
export type DiscoverySocialPlatformVisual = {
  ionicon: string;
  iconSet: 'ionicons' | 'fontawesome6';
  color: string;
};

export const DISCOVERY_SOCIAL_PLATFORM_VISUAL: Record<
  DiscoverySocialPlatform,
  DiscoverySocialPlatformVisual
> = {
  linkedin: {
    ionicon: 'logo-linkedin',
    iconSet: 'ionicons',
    color: '#0A66C2',
  },
  instagram: {
    ionicon: 'logo-instagram',
    iconSet: 'ionicons',
    color: '#E1306C',
  },
  facebook: {
    ionicon: 'logo-facebook',
    iconSet: 'ionicons',
    color: '#1877F2',
  },
  youtube: {
    ionicon: 'logo-youtube',
    iconSet: 'ionicons',
    color: '#FF0000',
  },
  x: {
    ionicon: 'x-twitter',
    iconSet: 'fontawesome6',
    color: '#111111',
  },
  tiktok: {
    ionicon: 'logo-tiktok',
    iconSet: 'ionicons',
    color: '#111111',
  },
  snapchat: {
    ionicon: 'logo-snapchat',
    iconSet: 'ionicons',
    color: '#FFFC00',
  },
  website: {
    ionicon: 'globe-outline',
    iconSet: 'ionicons',
    color: '#4E77C7',
  },
};

const SOCIAL_LINK_ALLOWED_KEYS = new Set(['platform', 'url']);

export function isDiscoverySocialPlatform(
  value: unknown,
): value is DiscoverySocialPlatform {
  return typeof value === 'string' && PLATFORM_SET.has(value);
}

/**
 * Strict HTTPS gate for wire + open. Rejects non-https schemes and embedded credentials.
 */
export function isAllowedDiscoverySocialHttpsUrl(url: string): boolean {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  if (parsed.username || parsed.password) return false;
  return true;
}

function requireHttpsSocialUrl(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw createContractResponseError(`${path} must be a non-empty string`, value);
  }
  const trimmed = value.trim();
  if (!isAllowedDiscoverySocialHttpsUrl(trimmed)) {
    throw createContractResponseError(
      `${path} must be a valid https URL without credentials`,
      value,
    );
  }
  return trimmed;
}

function parseSocialLinkItem(
  value: unknown,
  path: string,
): DiscoveryPublicSocialLink {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw createContractResponseError(`${path} must be an object`, value);
  }
  const row = value as Record<string, unknown>;
  for (const key of Object.keys(row)) {
    if (!SOCIAL_LINK_ALLOWED_KEYS.has(key)) {
      throw createContractResponseError(
        `Forbidden socialLinks field "${key}" at ${path}`,
        value,
      );
    }
  }
  if (!isDiscoverySocialPlatform(row.platform)) {
    throw createContractResponseError(
      `${path}.platform must be a known Discovery social platform`,
      row.platform,
    );
  }
  return {
    platform: row.platform,
    url: requireHttpsSocialUrl(row.url, `${path}.url`),
  };
}

/**
 * Wire parser for getDiscoveryProfile.socialLinks.
 *
 * Temporal compat: field absent → []. Present but invalid → invalid-response.
 * Preserves backend order. One entry per platform (duplicates → invalid-response).
 */
export function parseDiscoverySocialLinks(
  raw: unknown,
): DiscoveryPublicSocialLink[] {
  if (raw === undefined) {
    return [];
  }
  if (!Array.isArray(raw)) {
    throw createContractResponseError(
      'socialLinks must be an array when present',
      raw,
    );
  }

  const out: DiscoveryPublicSocialLink[] = [];
  const seenPlatforms = new Set<DiscoverySocialPlatform>();

  for (let i = 0; i < raw.length; i += 1) {
    const item = parseSocialLinkItem(raw[i], `socialLinks[${i}]`);
    if (seenPlatforms.has(item.platform)) {
      throw createContractResponseError(
        `duplicate socialLinks platform "${item.platform}"`,
        item.platform,
      );
    }
    seenPlatforms.add(item.platform);
    out.push(item);
  }

  return out;
}

/** @deprecated Prefer parseDiscoverySocialLinks for wire; kept as soft UI omit helper. */
export function normalizeDiscoveryPublicSocialLinks(
  raw: unknown,
): DiscoveryPublicSocialLink[] {
  if (raw === undefined || raw === null) return [];
  try {
    return parseDiscoverySocialLinks(raw);
  } catch {
    return [];
  }
}

export type DiscoveryLinkOpener = {
  canOpenURL: (url: string) => Promise<boolean>;
  openURL: (url: string) => Promise<void>;
};

export type OpenDiscoverySocialLinkResult =
  | 'opened'
  | 'rejected'
  | 'failed';

/**
 * Re-check HTTPS then open externally. Never logs the URL.
 * Pass React Native `Linking` (or a test double) as `opener`.
 */
export async function openDiscoverySocialHttpsUrl(
  url: string,
  opener: DiscoveryLinkOpener,
): Promise<OpenDiscoverySocialLinkResult> {
  if (!isAllowedDiscoverySocialHttpsUrl(url)) {
    return 'rejected';
  }
  try {
    const can = await opener.canOpenURL(url);
    if (!can) return 'failed';
    await opener.openURL(url);
    return 'opened';
  } catch {
    return 'failed';
  }
}

export function discoverySocialPlatformI18nKey(
  platform: DiscoverySocialPlatform,
): `platform${Capitalize<DiscoverySocialPlatform>}` {
  const map: Record<
    DiscoverySocialPlatform,
    `platform${Capitalize<DiscoverySocialPlatform>}`
  > = {
    linkedin: 'platformLinkedin',
    instagram: 'platformInstagram',
    facebook: 'platformFacebook',
    youtube: 'platformYoutube',
    x: 'platformX',
    tiktok: 'platformTiktok',
    snapchat: 'platformSnapchat',
    website: 'platformWebsite',
  };
  return map[platform];
}

/**
 * Public social links for getDiscoveryProfile (Detail only).
 * No usernames, tokens, or private bags — platform + https url only.
 */

import {
  isSocialLinkPlatform,
  normalizeSocialLinkUrl,
  SOCIAL_LINK_PLATFORMS,
  type PublicSocialLink,
  type SocialLinkPlatform,
} from '../social/socialLinkUrl.ts';

export type DiscoverySocialPlatform = SocialLinkPlatform;

export type DiscoveryPublicSocialLink = PublicSocialLink;

export const DISCOVERY_SOCIAL_PLATFORMS: readonly DiscoverySocialPlatform[] =
  SOCIAL_LINK_PLATFORMS;

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
  return isSocialLinkPlatform(value);
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

function parseSocialLinkItem(value: unknown): DiscoveryPublicSocialLink | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const row = value as Record<string, unknown>;
  if (Object.keys(row).some((key) => !SOCIAL_LINK_ALLOWED_KEYS.has(key))) {
    return null;
  }
  if (!isDiscoverySocialPlatform(row.platform)) return null;
  if (typeof row.url !== 'string' || !/^https:\/\//i.test(row.url.trim())) {
    return null;
  }
  const url = normalizeSocialLinkUrl(row.platform, row.url);
  return url ? { platform: row.platform, url } : null;
}

/**
 * Wire parser for getDiscoveryProfile.socialLinks.
 *
 * Fail-open per entry: absent / non-array → []; malformed, unknown platform, forbidden
 * fields, non-https, disallowed host or duplicate platform → that entry is dropped.
 * Never throws, so a bad link cannot fail the whole profile. Preserves backend order.
 */
export function parseDiscoverySocialLinks(
  raw: unknown,
): DiscoveryPublicSocialLink[] {
  if (!Array.isArray(raw)) return [];

  const out: DiscoveryPublicSocialLink[] = [];
  const seenPlatforms = new Set<DiscoverySocialPlatform>();

  for (const entry of raw) {
    const item = parseSocialLinkItem(entry);
    if (!item || seenPlatforms.has(item.platform)) continue;
    seenPlatforms.add(item.platform);
    out.push(item);
  }

  return out;
}

/** @deprecated Alias of parseDiscoverySocialLinks (already fail-open per entry). */
export function normalizeDiscoveryPublicSocialLinks(
  raw: unknown,
): DiscoveryPublicSocialLink[] {
  return parseDiscoverySocialLinks(raw);
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

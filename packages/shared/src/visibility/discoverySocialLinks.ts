/**
 * Public social links for getDiscoveryProfile (Detail only).
 * No usernames, tokens, or private bags — platform + https url only.
 */

import {
  normalizeSocialLinkUrl,
  type SocialLinkUrlPlatform,
} from '../social/socialLinkUrl';

export type DiscoverySocialPlatform = SocialLinkUrlPlatform;

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
 * Generic HTTPS gate (affiliation logos). Social links use `normalizeSocialLinkUrl`.
 * Rejects non-https schemes and embedded credentials.
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

/**
 * One wire row → canonical link, or null when it must be hidden
 * (not an object, extra/sensitive fields, unknown platform, unsafe URL).
 */
function parseSocialLinkItem(value: unknown): DiscoveryPublicSocialLink | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const row = value as Record<string, unknown>;
  for (const key of Object.keys(row)) {
    if (!SOCIAL_LINK_ALLOWED_KEYS.has(key)) return null;
  }
  if (!isDiscoverySocialPlatform(row.platform)) return null;
  const url = normalizeSocialLinkUrl(row.platform, row.url);
  if (!url) return null;
  return { platform: row.platform, url };
}

/**
 * Wire parser for getDiscoveryProfile.socialLinks.
 *
 * Fail-open per entry, like the backend: invalid rows are hidden individually
 * and never fail the profile. Absent / non-array → []. Preserves backend
 * order; first row wins per platform.
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

export type DiscoveryLinkOpener = {
  openURL: (url: string) => Promise<unknown>;
};

export type OpenDiscoverySocialLinkResult = 'opened' | 'invalid' | 'failed';

/**
 * Re-normalize, then hand the canonical HTTPS URL to the OS (Universal Link or
 * Safari). `canOpenURL` is intentionally not consulted: it is not required for
 * https and gives false negatives on some platforms. Never logs the URL.
 * Pass React Native `Linking` (or a test double) as `opener`.
 */
export async function openDiscoverySocialLink(
  link: { platform: unknown; url: unknown },
  opener: DiscoveryLinkOpener,
): Promise<OpenDiscoverySocialLinkResult> {
  if (!isDiscoverySocialPlatform(link.platform)) return 'invalid';
  const url = normalizeSocialLinkUrl(link.platform, link.url);
  if (!url) return 'invalid';
  try {
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

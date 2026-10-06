/**
 * Single pure normalizer for profile social links (input, persistence, wire, open).
 *
 * Output is always a canonical `https://` URL or `null`. Host allowlists mirror the
 * backend `visibilityDiscovery/socialLinks.ts` contract (exact host or subdomain).
 * Never logs values.
 */

export type SocialLinkPlatform =
  | 'linkedin'
  | 'instagram'
  | 'facebook'
  | 'youtube'
  | 'x'
  | 'tiktok'
  | 'snapchat'
  | 'website';

export type SocialLinkStorageKey =
  | 'linkedin'
  | 'instagram'
  | 'facebook'
  | 'youtube'
  | 'twitter'
  | 'tiktok'
  | 'snapchat'
  | 'website';

export type PublicSocialLink = {
  platform: SocialLinkPlatform;
  url: string;
};

/** Deterministic CRJ order, then website (same as backend). */
export const SOCIAL_LINK_PLATFORMS: readonly SocialLinkPlatform[] = [
  'linkedin',
  'instagram',
  'facebook',
  'youtube',
  'x',
  'tiktok',
  'snapchat',
  'website',
] as const;

export const SOCIAL_LINK_STORAGE_KEY: Record<SocialLinkPlatform, SocialLinkStorageKey> = {
  linkedin: 'linkedin',
  instagram: 'instagram',
  facebook: 'facebook',
  youtube: 'youtube',
  x: 'twitter',
  tiktok: 'tiktok',
  snapchat: 'snapchat',
  website: 'website',
};

export const SOCIAL_LINK_ALLOWED_HOSTS: Record<
  Exclude<SocialLinkPlatform, 'website'>,
  readonly string[]
> = {
  linkedin: ['linkedin.com', 'www.linkedin.com'],
  instagram: ['instagram.com', 'www.instagram.com'],
  facebook: ['facebook.com', 'www.facebook.com', 'm.facebook.com', 'fb.com', 'www.fb.com'],
  youtube: ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'],
  x: ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com'],
  tiktok: ['tiktok.com', 'www.tiktok.com', 'vm.tiktok.com'],
  snapchat: ['snapchat.com', 'www.snapchat.com'],
};

const MAX_URL_LENGTH = 2048;
const HANDLE_RE = /^[A-Za-z0-9._-]+$/;
const YOUTUBE_HANDLE_RE = /^[A-Za-z0-9._-]{1,100}$/;
const LINKEDIN_PATH_HANDLE_RE = /^\/?(in|company)\/([A-Za-z0-9._%-]+)\/?$/i;
const INVISIBLE_RE = /[\u200B-\u200D\u2060\uFEFF]/g;
const SCHEME_RE = /^([a-z][a-z0-9+.-]*):/i;
const HOST_LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const FORBIDDEN_URL_CHARS_RE = /[\s\u0000-\u001F\u007F\\<>"`]/;
const TWITTER_HOSTS = new Set(['twitter.com', 'www.twitter.com', 'mobile.twitter.com']);

const PLATFORM_SET = new Set<string>(SOCIAL_LINK_PLATFORMS);

export function isSocialLinkPlatform(value: unknown): value is SocialLinkPlatform {
  return typeof value === 'string' && PLATFORM_SET.has(value);
}

function hostAllowed(host: string, allowed: readonly string[]): boolean {
  return allowed.some((a) => host === a || host.endsWith(`.${a}`));
}

function isPublicHostname(host: string): boolean {
  if (host.length > 253) return false;
  const labels = host.split('.');
  if (labels.length < 2) return false;
  if (!labels.every((label) => HOST_LABEL_RE.test(label))) return false;
  const tld = labels[labels.length - 1];
  return /^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/.test(tld);
}

function encodeNonAscii(value: string): string {
  return value.replace(/[^\x21-\x7E]/gu, (ch) => encodeURIComponent(ch));
}

type ParsedHttpsUrl = { host: string; rest: string };

/**
 * Strict parse of `http(s)://host[:443]/path?query#fragment` (scheme optional → https).
 * Rejects other schemes, credentials, non-443 ports, IP/single-label/non-ASCII hosts,
 * whitespace/control/backslash characters.
 */
function parseHttpsCandidate(value: string): ParsedHttpsUrl | null {
  let rest = value;
  const scheme = SCHEME_RE.exec(rest);
  if (scheme && /^https?:\/\//i.test(rest)) {
    rest = rest.replace(/^https?:\/\//i, '');
  } else if (scheme && !/^[^:/?#]+:\d+(?:[/?#]|$)/.test(rest)) {
    return null;
  } else {
    rest = rest.replace(/^\/+/, '');
  }

  if (FORBIDDEN_URL_CHARS_RE.test(rest)) return null;

  const authorityEnd = rest.search(/[/?#]/);
  const authority = authorityEnd === -1 ? rest : rest.slice(0, authorityEnd);
  let tail = authorityEnd === -1 ? '' : rest.slice(authorityEnd);

  if (!authority || authority.includes('@') || authority.includes('[')) return null;

  let host = authority;
  const colon = authority.indexOf(':');
  if (colon !== -1) {
    const port = authority.slice(colon + 1);
    if (port !== '443') return null;
    host = authority.slice(0, colon);
  }
  host = host.toLowerCase();
  if (!isPublicHostname(host)) return null;

  if (!tail.startsWith('/')) tail = `/${tail}`;
  return { host, rest: encodeNonAscii(tail) };
}

function looksLikeUrl(value: string, allowedHosts: readonly string[] | null): boolean {
  if (/^https?:\/\//i.test(value)) return true;
  if (/^www\./i.test(value)) return true;
  if (/^[a-z0-9-]+(?:\.[a-z0-9-]+)+\//i.test(value)) return true;
  const authority = value.split(/[/?#]/, 1)[0].toLowerCase();
  if (allowedHosts === null) return authority.includes('.');
  return hostAllowed(authority, allowedHosts);
}

function handleToUrl(platform: Exclude<SocialLinkPlatform, 'website'>, raw: string): string | null {
  if (platform === 'linkedin') {
    const path = LINKEDIN_PATH_HANDLE_RE.exec(raw);
    if (path) return `https://www.linkedin.com/${path[1].toLowerCase()}/${path[2]}`;
  }
  const clean = raw.replace(/^@+/, '').trim();
  if (!clean) return null;
  const re = platform === 'youtube' ? YOUTUBE_HANDLE_RE : HANDLE_RE;
  if (!re.test(clean)) return null;

  switch (platform) {
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
 * Normalize a stored or user-entered value for one platform.
 * Accepts full URL (http upgraded to https) or, for social networks, a handle.
 * Website requires a URL-like value. Non-strings (arrays, `custom`) → null.
 */
export function normalizeSocialLinkUrl(
  platform: SocialLinkPlatform,
  raw: unknown,
): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.replace(INVISIBLE_RE, '').trim();
  if (!value || value.length > MAX_URL_LENGTH) return null;

  const allowedHosts = platform === 'website' ? null : SOCIAL_LINK_ALLOWED_HOSTS[platform];

  if (!looksLikeUrl(value, allowedHosts)) {
    return platform === 'website' ? null : handleToUrl(platform, value);
  }

  const parsed = parseHttpsCandidate(value);
  if (!parsed) return null;
  let { host } = parsed;
  if (allowedHosts !== null && !hostAllowed(host, allowedHosts)) return null;
  if (platform === 'x' && TWITTER_HOSTS.has(host)) host = 'x.com';

  const url = `https://${host}${parsed.rest}`;
  return url.length > MAX_URL_LENGTH ? null : url;
}

/**
 * Map a persisted `socialLinksPersonal | socialLinksProfessional` bag to public links.
 * Same order and filtering as the backend Discovery contract; `custom` is never included.
 * Invalid entries are skipped individually.
 */
export function readPublicSocialLinks(bag: unknown): PublicSocialLink[] {
  if (!bag || typeof bag !== 'object' || Array.isArray(bag)) return [];
  const record = bag as Record<string, unknown>;
  const out: PublicSocialLink[] = [];
  for (const platform of SOCIAL_LINK_PLATFORMS) {
    const url = normalizeSocialLinkUrl(platform, record[SOCIAL_LINK_STORAGE_KEY[platform]]);
    if (url) out.push({ platform, url });
  }
  return out;
}

/**
 * Single pure normalizer for public social / website URLs.
 *
 * Used by the profile editors (persist) and by Discovery (wire re-check + open).
 * Host allowlists and handle mapping mirror Functions
 * `modules/visibilityDiscovery/socialLinks.ts` (`sanitizeSocialLinkValue`).
 *
 * Deliberately string-based: React Native's global `URL` is a regex shim
 * (no setters, no host lowercasing, never throws), so results must not depend
 * on it to stay identical between Node tests and Hermes.
 */

export type SocialLinkUrlPlatform =
  | 'linkedin'
  | 'instagram'
  | 'facebook'
  | 'youtube'
  | 'x'
  | 'tiktok'
  | 'snapchat'
  | 'website';

type PlatformRule = {
  allowedHosts: readonly string[];
  handleToUrl: ((handle: string) => string | null) | null;
};

const HANDLE_RE = /^[A-Za-z0-9._-]+$/;
const YOUTUBE_HANDLE_RE = /^[A-Za-z0-9._-]{1,100}$/;
const LINKEDIN_PATH_HANDLE_RE = /^\/?(in|company)\/([A-Za-z0-9._-]+)\/?$/i;

const HOSTNAME_RE =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;

/** Zero-width / BOM characters that sneak in through copy-paste. */
const INVISIBLE_CHARS_RE = /[\u200B-\u200D\u2060\uFEFF]/g;
const FORBIDDEN_CHARS_RE = /[\s\u0000-\u001F\u007F\\<>"`{}|^]/;

const TWITTER_HOSTS = new Set(['twitter.com', 'www.twitter.com', 'mobile.twitter.com']);

function cleanHandle(raw: string, re: RegExp): string | null {
  const clean = raw.replace(/^@+/, '').trim();
  if (!clean || /\s/.test(clean)) return null;
  return re.test(clean) ? clean : null;
}

function simpleHandle(
  re: RegExp,
  build: (handle: string) => string,
): (raw: string) => string | null {
  return (raw) => {
    const clean = cleanHandle(raw, re);
    return clean ? build(clean) : null;
  };
}

const PLATFORM_RULES: Record<SocialLinkUrlPlatform, PlatformRule> = {
  linkedin: {
    allowedHosts: ['linkedin.com', 'www.linkedin.com'],
    handleToUrl: (raw) => {
      const path = LINKEDIN_PATH_HANDLE_RE.exec(raw);
      if (path) {
        return `https://www.linkedin.com/${path[1].toLowerCase()}/${path[2]}`;
      }
      const clean = cleanHandle(raw, HANDLE_RE);
      return clean ? `https://www.linkedin.com/in/${clean}` : null;
    },
  },
  instagram: {
    allowedHosts: ['instagram.com', 'www.instagram.com'],
    handleToUrl: simpleHandle(HANDLE_RE, (h) => `https://www.instagram.com/${h}`),
  },
  facebook: {
    allowedHosts: ['facebook.com', 'www.facebook.com', 'm.facebook.com', 'fb.com', 'www.fb.com'],
    handleToUrl: simpleHandle(HANDLE_RE, (h) => `https://www.facebook.com/${h}`),
  },
  youtube: {
    allowedHosts: ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'],
    handleToUrl: simpleHandle(YOUTUBE_HANDLE_RE, (h) => `https://www.youtube.com/@${h}`),
  },
  x: {
    allowedHosts: ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com'],
    handleToUrl: simpleHandle(HANDLE_RE, (h) => `https://x.com/${h}`),
  },
  tiktok: {
    allowedHosts: ['tiktok.com', 'www.tiktok.com', 'vm.tiktok.com'],
    handleToUrl: simpleHandle(HANDLE_RE, (h) => `https://www.tiktok.com/@${h}`),
  },
  snapchat: {
    allowedHosts: ['snapchat.com', 'www.snapchat.com'],
    handleToUrl: simpleHandle(HANDLE_RE, (h) => `https://www.snapchat.com/add/${h}`),
  },
  website: {
    allowedHosts: [],
    handleToUrl: null,
  },
};

function looksLikeUrl(value: string): boolean {
  if (/^https?:\/\//i.test(value)) return true;
  if (value.startsWith('//')) return true;
  if (/^www\./i.test(value)) return true;
  if (/^(linkedin|instagram|facebook|youtube|twitter|x|tiktok|snapchat)\.com\b/i.test(value)) {
    return true;
  }
  return /[a-z0-9-]+\.[a-z]{2,}\//i.test(value);
}

function hostAllowed(host: string, allowed: readonly string[]): boolean {
  return allowed.some((a) => host === a || host.endsWith(`.${a}`));
}

function encodeNonAscii(rest: string): string | null {
  try {
    return rest.replace(/[^\x21-\x7E]/gu, (char) => encodeURIComponent(char));
  } catch {
    return null;
  }
}

type ParsedHttpsUrl = { host: string; rest: string };

/**
 * Parse `https://`, `http://` (upgraded), scheme-less `host/path` or `//host/path`.
 * Rejects every other explicit scheme, credentials, non-default ports and
 * hosts that are not plain DNS names (IP literals, underscores, single labels).
 */
function parseHttpsCandidate(value: string): ParsedHttpsUrl | null {
  let body: string;
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(value);
  if (scheme) {
    const name = scheme[1].toLowerCase();
    if (name !== 'http' && name !== 'https') return null;
    body = value.slice(scheme[0].length);
  } else if (/^[a-z][a-z0-9+-]*:/i.test(value)) {
    return null;
  } else {
    body = value.replace(/^\/+/, '');
  }

  const authorityEnd = body.search(/[/?#]/);
  const authority = authorityEnd === -1 ? body : body.slice(0, authorityEnd);
  const rawRest = authorityEnd === -1 ? '' : body.slice(authorityEnd);
  if (!authority || authority.includes('@')) return null;

  let host = authority.toLowerCase();
  const portSplit = /^([^:]+):(\d+)$/.exec(host);
  if (portSplit) {
    if (portSplit[2] !== '443') return null;
    host = portSplit[1];
  } else if (host.includes(':')) {
    return null;
  }
  if (!HOSTNAME_RE.test(host)) return null;

  const encodedRest = encodeNonAscii(rawRest);
  if (encodedRest === null) return null;
  const rest = encodedRest.startsWith('/') ? encodedRest : `/${encodedRest}`;
  return { host, rest };
}

/**
 * Normalize a stored or user-entered value to a canonical public HTTPS URL.
 * Returns null when empty, non-string (arrays / objects / custom bags),
 * unsafe, off-allowlist, or an unsupported handle.
 */
export function normalizeSocialLinkUrl(
  platform: SocialLinkUrlPlatform,
  raw: unknown,
): string | null {
  if (typeof raw !== 'string') return null;
  if (!Object.prototype.hasOwnProperty.call(PLATFORM_RULES, platform)) return null;
  const rule = PLATFORM_RULES[platform];

  const value = raw.replace(INVISIBLE_CHARS_RE, '').trim();
  if (!value || FORBIDDEN_CHARS_RE.test(value)) return null;

  const treatAsUrl =
    looksLikeUrl(value) ||
    (platform === 'website' && value.includes('.')) ||
    /^[a-z][a-z0-9+.-]*:/i.test(value);

  if (!treatAsUrl) {
    return rule.handleToUrl ? rule.handleToUrl(value) : null;
  }

  const parsed = parseHttpsCandidate(value);
  if (!parsed) return null;

  let host = parsed.host;
  if (platform !== 'website') {
    if (!hostAllowed(host, rule.allowedHosts)) return null;
    if (platform === 'x' && TWITTER_HOSTS.has(host)) host = 'x.com';
  }
  return `https://${host}${parsed.rest}`;
}

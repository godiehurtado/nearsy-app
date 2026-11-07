/**
 * Campaign attribution. Pure rules plus a small store; the Android binding feeds
 * it with links and the install referrer.
 *
 * - Only allowlisted parameters with safe values are kept. Full URLs and OAuth
 *   parameters are never stored or sent.
 * - Any URL with an OAuth parameter, or the OAuth return addresses, is ignored.
 *   Reading a link does not consume it, so those flows are not affected.
 * - Acquisition (`signup_*`) goes out as set_once, only for a confirmed new
 *   account and only with real evidence. `organic` and `unknown` are never
 *   written, so late legitimate evidence is not blocked.
 * - A later campaign is the event `campaign_accessed`, and never overwrites the
 *   acquisition of the person.
 */
import type { AnalyticsProperties } from './analyticsContract.ts';

export const DEFAULT_ATTRIBUTION_EXPIRY_HOURS = 7 * 24;
const MAX_ATTRIBUTION_EXPIRY_HOURS = 90 * 24;
export const ATTRIBUTION_STORAGE_KEY = 'NEARSY_ANALYTICS_CAMPAIGN_TOUCH';
export const INSTALL_REFERRER_READ_KEY = 'NEARSY_ANALYTICS_INSTALL_REFERRER_READ';
/** Reserved for campaign links on the existing custom scheme. */
export const CAMPAIGN_SCHEME_URL = 'nearsy://campaign';

export type AttributionMethod = 'app_link' | 'custom_scheme' | 'install_referrer';

export type CampaignTouch = {
  source?: string;
  campaign?: string;
  content?: string;
  tool?: string;
  method: AttributionMethod;
};

export type StoredCampaignTouch = CampaignTouch & { storedAt: number };

export type AttributionSettings = {
  appLinks?: { host: string; pathPrefix: string };
  installReferrerEnabled: boolean;
  expiryMs: number;
};

export function resolveAttributionSettings(raw: unknown): AttributionSettings {
  const value = (raw ?? {}) as {
    appLinks?: { host?: unknown; pathPrefix?: unknown };
    installReferrerEnabled?: unknown;
    attributionExpiryHours?: unknown;
  };
  const hours = value.attributionExpiryHours;
  const validHours =
    typeof hours === 'number' &&
    Number.isFinite(hours) &&
    hours > 0 &&
    hours <= MAX_ATTRIBUTION_EXPIRY_HOURS;
  const host = value.appLinks?.host;
  const pathPrefix = value.appLinks?.pathPrefix;
  return {
    ...(typeof host === 'string' && typeof pathPrefix === 'string'
      ? { appLinks: { host: host.toLowerCase(), pathPrefix } }
      : {}),
    installReferrerEnabled: value.installReferrerEnabled === true,
    expiryMs: (validHours ? hours : DEFAULT_ATTRIBUTION_EXPIRY_HOURS) * 3_600_000,
  };
}

const SAFE_VALUE = /^[A-Za-z0-9._~-]{1,64}$/;
const FORBIDDEN_PARAMS = new Set([
  'code',
  'state',
  'token',
  'access_token',
  'id_token',
  'refresh_token',
  'transactionid',
  'result',
  'error',
  'mode',
]);

/** Query parser with no dependency on the partial URL class of React Native. */
function parseQuery(query: string): Map<string, string> | null {
  const out = new Map<string, string>();
  for (const part of query.split('&')) {
    if (!part) continue;
    const separator = part.indexOf('=');
    const rawKey = separator < 0 ? part : part.slice(0, separator);
    const rawValue = separator < 0 ? '' : part.slice(separator + 1);
    let key: string;
    let value: string;
    try {
      key = decodeURIComponent(rawKey).toLowerCase();
      value = decodeURIComponent(rawValue.replace(/\+/g, ' '));
    } catch {
      return null;
    }
    if (FORBIDDEN_PARAMS.has(key)) return null;
    if (!out.has(key)) out.set(key, value);
  }
  return out;
}

function safe(value: string | undefined): string | undefined {
  return value !== undefined && SAFE_VALUE.test(value) ? value : undefined;
}

function touchFromQuery(
  query: string,
  method: AttributionMethod,
): CampaignTouch | null {
  const params = parseQuery(query);
  if (!params) return null;
  // Play reports this for an install without a campaign: it is not evidence.
  if (params.get('utm_medium')?.toLowerCase() === 'organic') return null;
  const source = safe(params.get('utm_source'));
  const campaign = safe(params.get('utm_campaign'));
  if (!source && !campaign) return null;
  const content = safe(params.get('utm_content'));
  const tool = safe(params.get('nearsy_tool') ?? params.get('utm_tool'));
  return {
    ...(source ? { source } : {}),
    ...(campaign ? { campaign } : {}),
    ...(content ? { content } : {}),
    ...(tool ? { tool } : {}),
    method,
  };
}

/** Returns a touch only for a configured campaign address; null for all else. */
export function parseCampaignLink(
  url: unknown,
  settings: Pick<AttributionSettings, 'appLinks'>,
): CampaignTouch | null {
  if (typeof url !== 'string') return null;
  const match = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]*)([^?#]*)(?:\?([^#]*))?/i.exec(
    url.trim(),
  );
  if (!match) return null;
  const scheme = match[1].toLowerCase();
  const host = match[2].toLowerCase();
  const path = match[3];
  const query = match[4] ?? '';
  if (scheme === 'nearsy') {
    return host === 'campaign' && (path === '' || path === '/')
      ? touchFromQuery(query, 'custom_scheme')
      : null;
  }
  const appLinks = settings.appLinks;
  if (scheme !== 'https' || !appLinks || host !== appLinks.host) return null;
  const prefix = appLinks.pathPrefix.replace(/\/+$/, '');
  if (path !== prefix && !path.startsWith(`${prefix}/`)) return null;
  return touchFromQuery(query, 'app_link');
}

export function parseInstallReferrer(referrer: unknown): CampaignTouch | null {
  return typeof referrer === 'string' && referrer.trim()
    ? touchFromQuery(referrer.trim(), 'install_referrer')
    : null;
}

export function signupAttributionProperties(touch: CampaignTouch): AnalyticsProperties {
  return {
    ...(touch.source ? { signup_source: touch.source } : {}),
    ...(touch.campaign ? { signup_campaign: touch.campaign } : {}),
    ...(touch.content ? { signup_content: touch.content } : {}),
    ...(touch.tool ? { signup_tool: touch.tool } : {}),
    attribution_method: touch.method,
  };
}

export function campaignAccessedProperties(touch: CampaignTouch): AnalyticsProperties {
  return {
    ...(touch.source ? { campaign_source: touch.source } : {}),
    ...(touch.campaign ? { campaign_name: touch.campaign } : {}),
    ...(touch.content ? { campaign_content: touch.content } : {}),
    ...(touch.tool ? { campaign_tool: touch.tool } : {}),
    attribution_method: touch.method,
  };
}

type AttributionStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

/** Temporary local holding area. It only ever holds the allowlisted fields. */
export function createCampaignTouchStore(deps: {
  storage: AttributionStorage;
  now: () => number;
  expiryMs: number;
}) {
  async function read(): Promise<StoredCampaignTouch | null> {
    const raw = await deps.storage.getItem(ATTRIBUTION_STORAGE_KEY);
    if (!raw) return null;
    let parsed: StoredCampaignTouch | null = null;
    try {
      parsed = JSON.parse(raw) as StoredCampaignTouch;
    } catch {
      parsed = null;
    }
    const age = parsed ? deps.now() - Number(parsed.storedAt) : Number.NaN;
    if (!parsed || !Number.isFinite(age) || age < 0 || age > deps.expiryMs) {
      await deps.storage.removeItem(ATTRIBUTION_STORAGE_KEY);
      return null;
    }
    return parsed;
  }
  return {
    read,
    /** The first touch stays until it is used or expires. */
    async save(touch: CampaignTouch): Promise<void> {
      if (await read()) return;
      const stored: StoredCampaignTouch = { ...touch, storedAt: deps.now() };
      await deps.storage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(stored));
    },
    async consume(): Promise<StoredCampaignTouch | null> {
      const stored = await read();
      if (stored) await deps.storage.removeItem(ATTRIBUTION_STORAGE_KEY);
      return stored;
    },
  };
}

/**
 * Account old enough that the link cannot belong to its signup. A recent account
 * keeps the touch: its signup confirmation may still be on the way, and an
 * identity provider without a new-account signal must not lose the attribution.
 */
export const SIGNUP_ATTRIBUTION_WINDOW_MS = 2 * 60_000;

export function isEstablishedAccount(creationTime: unknown, nowMs: number): boolean {
  if (typeof creationTime !== 'string') return false;
  const created = Date.parse(creationTime);
  return Number.isFinite(created) && nowMs - created > SIGNUP_ATTRIBUTION_WINDOW_MS;
}

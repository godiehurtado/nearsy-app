/**
 * Campaign attribution from Universal Links of an installed app.
 *
 * Mapping: utm_medium → channel (signup_source), utm_campaign → campaign,
 * utm_content → piece, utm_source → tool. Only those validated values are kept,
 * never the URL. OAuth returns use other schemes and paths and are rejected.
 *
 * String-based on purpose: React Native's global URL is a partial shim.
 *
 * Ordering: nothing writes `unknown` or `organic`. set_once runs only with real
 * values, so attribution that arrives after signup can still fill the original
 * acquisition, and later links can never overwrite it.
 */
import type { StringStore } from './lifecycle';

export type CampaignAttribution = {
  source?: string;
  campaign?: string;
  content?: string;
  tool?: string;
  method: 'universal_link';
  capturedAtMs: number;
};

export const ATTRIBUTION_PATH_PREFIX = '/c/';
export const PENDING_ATTRIBUTION_KEY = 'nearsy.analytics.pendingAttribution.v1';
export const PENDING_ATTRIBUTION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const ACQUISITION_WINDOW_MS = 24 * 60 * 60 * 1000;

const SLUG_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;
/** "organic" and "unknown" are conclusions, a link can never claim them. */
const RESERVED_VALUES = new Set(['organic', 'unknown', 'none', 'null', 'undefined']);

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    return null;
  }
}

function cleanSlug(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const decoded = safeDecode(raw);
  if (decoded === null) return undefined;
  const value = decoded.trim().toLowerCase();
  return SLUG_RE.test(value) && !RESERVED_VALUES.has(value) ? value : undefined;
}

export function parseCampaignLink(
  url: unknown,
  allowedHosts: readonly string[],
  nowMs: number,
): CampaignAttribution | null {
  if (typeof url !== 'string' || url.length > 2048) return null;
  const match = /^https:\/\/([^/?#]+)([^?#]*)(?:\?([^#]*))?/i.exec(url.trim());
  if (!match) return null;
  const host = (match[1] ?? '').toLowerCase();
  // A userinfo or port part is never one of our campaign links.
  if (!allowedHosts.includes(host)) return null;
  const path = match[2] ?? '';
  if (!path.startsWith(ATTRIBUTION_PATH_PREFIX)) return null;

  const params = new Map<string, string>();
  for (const pair of (match[3] ?? '').split('&')) {
    const separator = pair.indexOf('=');
    if (separator <= 0) continue;
    const key = pair.slice(0, separator);
    if (!params.has(key)) params.set(key, pair.slice(separator + 1));
  }

  const source = cleanSlug(params.get('utm_medium'));
  const campaign = cleanSlug(params.get('utm_campaign'));
  if (!source && !campaign) return null;
  const content = cleanSlug(params.get('utm_content'));
  const tool = cleanSlug(params.get('utm_source'));
  return {
    ...(source ? { source } : {}),
    ...(campaign ? { campaign } : {}),
    ...(content ? { content } : {}),
    ...(tool ? { tool } : {}),
    method: 'universal_link',
    capturedAtMs: nowMs,
  };
}

export function acquisitionProperties(
  attribution: CampaignAttribution,
): Record<string, unknown> {
  return {
    signup_source: attribution.source,
    signup_campaign: attribution.campaign,
    signup_content: attribution.content,
    signup_tool: attribution.tool,
    attribution_method: attribution.method,
  };
}

export function campaignAccessProperties(
  attribution: CampaignAttribution,
): Record<string, unknown> {
  return {
    campaign_source: attribution.source,
    campaign_name: attribution.campaign,
    campaign_content: attribution.content,
    campaign_tool: attribution.tool,
    attribution_method: attribution.method,
  };
}

export function createPendingAttributionStore(store: StringStore | null) {
  let memory: CampaignAttribution | null = null;
  return {
    async save(attribution: CampaignAttribution): Promise<void> {
      memory = attribution;
      await store
        ?.setItem(PENDING_ATTRIBUTION_KEY, JSON.stringify(attribution))
        .catch(() => {});
    },
    async take(nowMs: number): Promise<CampaignAttribution | null> {
      let found = memory;
      memory = null;
      if (!found && store) {
        try {
          const raw = await store.getItem(PENDING_ATTRIBUTION_KEY);
          found = raw ? (JSON.parse(raw) as CampaignAttribution) : null;
        } catch {
          found = null;
        }
      }
      await store?.removeItem(PENDING_ATTRIBUTION_KEY).catch(() => {});
      if (!found || typeof found.capturedAtMs !== 'number') return null;
      return nowMs - found.capturedAtMs <= PENDING_ATTRIBUTION_TTL_MS
        ? found
        : null;
    },
  };
}

export type PendingAttributionStore = ReturnType<
  typeof createPendingAttributionStore
>;

/** A fresh account with no recorded acquisition can still receive it. */
export function classifyAttributionAccess(input: {
  creationTime: string | null;
  nowMs: number;
  acquisitionAlreadyRecorded: boolean;
}): 'late_acquisition' | 'campaign_access' {
  const created = input.creationTime ? Date.parse(input.creationTime) : NaN;
  if (
    !input.acquisitionAlreadyRecorded &&
    Number.isFinite(created) &&
    input.nowMs - created >= 0 &&
    input.nowMs - created <= ACQUISITION_WINDOW_MS
  ) {
    return 'late_acquisition';
  }
  return 'campaign_access';
}

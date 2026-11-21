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

/**
 * How the touch was confirmed. Computed by the app, never read from a link.
 * - universal_link: Nearsy's own /c/ link (off unless configured).
 * - onelink_direct: AppsFlyer UDL, isDeferred=false (the OS opened the app with the link).
 * - onelink_deferred: AppsFlyer UDL deferred with a deterministic match only.
 * Probabilistic matches never become a CampaignAttribution (contract nc1, C3).
 */
export const ATTRIBUTION_METHODS = [
  'universal_link',
  'onelink_direct',
  'onelink_deferred',
] as const;
export type AttributionMethod = (typeof ATTRIBUTION_METHODS)[number];

export type CampaignAttribution = {
  source?: string;
  campaign?: string;
  content?: string;
  tool?: string;
  method: AttributionMethod;
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
  return cleanDecodedSlug(decoded);
}

/** Same slug rule for values that arrive already decoded (AppsFlyer UDL). */
export function cleanDecodedSlug(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const value = raw.trim().toLowerCase();
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

/**
 * A touch that reaches a signed-in account (contract nc1, C4/C5).
 *
 * Late acquisition needs every piece of evidence:
 * - the touch was captured before the account was created (a link opened with a
 *   session, or after creation, is an access);
 * - the account was created on this install (after the local install marker);
 * - no other account on this install claimed an acquisition (else nothing: F7);
 * - nothing recorded for this account yet, and at most 24 h since creation
 *   (the window is only a cap, never evidence on its own).
 * Clock note: capture uses the device clock, creation the Auth server clock.
 */
export function classifyAttributionAccess(input: {
  creationTime: string | null;
  nowMs: number;
  capturedAtMs: number;
  acquisitionAlreadyRecorded: boolean;
  installMarkerMs?: number | null;
  installClaimedByOtherAccount?: boolean;
}): 'late_acquisition' | 'campaign_accessed' | 'none' {
  const created = input.creationTime ? Date.parse(input.creationTime) : NaN;
  if (
    input.acquisitionAlreadyRecorded ||
    !Number.isFinite(created) ||
    !(input.capturedAtMs < created)
  ) {
    return 'campaign_accessed';
  }
  if (
    typeof input.installMarkerMs === 'number' &&
    created < input.installMarkerMs
  ) {
    return 'campaign_accessed';
  }
  if (input.installClaimedByOtherAccount) return 'none';
  if (input.nowMs - created < 0 || input.nowMs - created > ACQUISITION_WINDOW_MS) {
    return 'campaign_accessed';
  }
  return 'late_acquisition';
}

/**
 * Per-install record: when this install first ran analytics, and which account
 * generation claimed the install's acquisition. Lives in app storage, so it is
 * gone after an uninstall. Limit: an iCloud device restore can bring it back,
 * which only makes the marker older (the capture-before-creation rule still holds).
 */
export const INSTALL_RECORD_KEY = 'nearsy.analytics.install.v1';

type InstallRecord = { markerMs: number; acquisitionBy?: string };

export function createInstallRecord(store: StringStore | null, nowMs: () => number) {
  let memory: InstallRecord | null = null;
  let chain: Promise<unknown> = Promise.resolve();

  async function load(): Promise<InstallRecord> {
    if (memory) return memory;
    let found: InstallRecord | null = null;
    try {
      const raw = store ? await store.getItem(INSTALL_RECORD_KEY) : null;
      const parsed = raw ? (JSON.parse(raw) as Partial<InstallRecord>) : null;
      if (parsed && typeof parsed.markerMs === 'number' && Number.isFinite(parsed.markerMs)) {
        found = {
          markerMs: parsed.markerMs,
          ...(typeof parsed.acquisitionBy === 'string' ? { acquisitionBy: parsed.acquisitionBy } : {}),
        };
      }
    } catch {
      found = null;
    }
    memory = found ?? { markerMs: nowMs() };
    if (!found) await persist();
    return memory;
  }

  async function persist(): Promise<void> {
    await store?.setItem(INSTALL_RECORD_KEY, JSON.stringify(memory)).catch(() => {});
  }

  function serial<T>(fn: () => Promise<T>): Promise<T> {
    const next = chain.catch(() => {}).then(fn);
    chain = next;
    return next;
  }

  return {
    /** Creates the marker on first use. */
    markerMs: (): Promise<number> => serial(async () => (await load()).markerMs),
    /** True when nobody else claimed this install's acquisition. Does not claim. */
    isFreeFor: (generation: string): Promise<boolean> =>
      serial(async () => {
        const record = await load();
        return !record.acquisitionBy || record.acquisitionBy === generation;
      }),
    /** Claims it for this account generation; false if another one already did. */
    claimFor: (generation: string): Promise<boolean> =>
      serial(async () => {
        const record = await load();
        if (record.acquisitionBy && record.acquisitionBy !== generation) return false;
        if (!record.acquisitionBy) {
          memory = { ...record, acquisitionBy: generation };
          await persist();
        }
        return true;
      }),
  };
}

export type InstallRecordStore = ReturnType<typeof createInstallRecord>;

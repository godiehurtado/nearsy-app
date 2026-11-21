/**
 * AppsFlyer/OneLink campaign contract "nc1", shared by iOS and Android
 * (agreed between both agents on 2026-11-21; provisional until the Owner approves).
 *
 * Nearsy reads ONLY these UDL fields, the only ones present in direct and deferred
 * results alike (deferred UDL nulls media_source/campaign/af_*):
 *   deep_link_value  → navigation destination (closed list, no parameters)
 *   deep_link_sub1   → source   (signup_source / campaign_source)
 *   deep_link_sub2   → campaign (signup_campaign / campaign_name)
 *   deep_link_sub3   → content  (signup_content / campaign_content)
 *   deep_link_sub4   → tool     (signup_tool / campaign_tool)
 *   deep_link_sub5   → contract version, must be "nc1" or nothing is attributed
 * pid, c, af_channel, af_ad and any other key are AppsFlyer reporting only.
 *
 * Three separate outcomes:
 *   - attribution: only when confirmed (direct, or deferred with a deterministic
 *     match). A probabilistic/unknown deferred match is an estimate and is dropped.
 *   - destination: navigation only; it never affects attribution.
 *   - nothing.
 * Pure module: no SDK imports.
 */
import {
  cleanDecodedSlug,
  type CampaignAttribution,
} from '../analytics/attribution';

export const ONELINK_CONTRACT_VERSION = 'nc1';

/** Closed list (C6). Unknown keys are ignored. Product approval pending. */
export const ONELINK_DESTINATIONS = ['home', 'profile', 'alerts'] as const;
export type OneLinkDestination = (typeof ONELINK_DESTINATIONS)[number];

/** Deterministic match types. iOS without IDFA never reports one. */
const CONFIRMED_DEFERRED_MATCH_TYPES = new Set(['referrer']);

/** A touch carrying any of these looks like an OAuth return and is dropped whole. */
const OAUTH_KEYS = [
  'code',
  'state',
  'token',
  'access_token',
  'id_token',
  'refresh_token',
  'transactionid',
  'transaction_id',
  'result',
  'error',
  'mode',
];

export type OneLinkTouch = {
  isDeferred: boolean;
  /** Present only when the touch is confirmed and carries valid fields. */
  attribution: CampaignAttribution | null;
  destination: OneLinkDestination | null;
  /** True for a deferred match that is not deterministic (never attributed). */
  estimated: boolean;
};

function readBool(value: unknown): boolean | null {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return null;
}

function pick(payload: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (payload[key] !== undefined && payload[key] !== null) return payload[key];
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * @param result the object registerDeepLinkListener delivers
 *   ({ status, deepLink: {...}, ... }); field names vary by platform, so both
 *   snake_case and camelCase are read.
 */
export function parseOneLinkResult(result: unknown, nowMs: number): OneLinkTouch | null {
  const outer = asRecord(result);
  if (!outer) return null;
  const status = String(outer.status ?? '').toUpperCase();
  if (status !== 'FOUND') return null;
  const payload = asRecord(outer.deepLink) ?? asRecord(outer.data) ?? null;
  if (!payload) return null;

  const lowerKeys = new Set(Object.keys(payload).map((k) => k.toLowerCase()));
  if (OAUTH_KEYS.some((k) => lowerKeys.has(k))) return null;

  // Unknown delivery mode is treated as deferred: the stricter rule.
  const deferredFlag = readBool(
    pick(payload, 'is_deferred', 'isDeferred') ?? pick(outer, 'is_deferred', 'isDeferred'),
  );
  const isDeferred = deferredFlag !== false;

  const rawDestination = cleanDecodedSlug(pick(payload, 'deep_link_value', 'deepLinkValue'));
  const destination = (ONELINK_DESTINATIONS as readonly string[]).includes(rawDestination ?? '')
    ? (rawDestination as OneLinkDestination)
    : null;

  let confirmed = !isDeferred;
  let estimated = false;
  if (isDeferred) {
    const matchType = String(pick(payload, 'match_type', 'matchType') ?? '').toLowerCase();
    confirmed = CONFIRMED_DEFERRED_MATCH_TYPES.has(matchType);
    estimated = !confirmed;
  }

  let attribution: CampaignAttribution | null = null;
  const version = pick(payload, 'deep_link_sub5', 'deepLinkSub5');
  if (confirmed && version === ONELINK_CONTRACT_VERSION) {
    const source = cleanDecodedSlug(pick(payload, 'deep_link_sub1', 'deepLinkSub1'));
    const campaign = cleanDecodedSlug(pick(payload, 'deep_link_sub2', 'deepLinkSub2'));
    if (source || campaign) {
      const content = cleanDecodedSlug(pick(payload, 'deep_link_sub3', 'deepLinkSub3'));
      const tool = cleanDecodedSlug(pick(payload, 'deep_link_sub4', 'deepLinkSub4'));
      attribution = {
        ...(source ? { source } : {}),
        ...(campaign ? { campaign } : {}),
        ...(content ? { content } : {}),
        ...(tool ? { tool } : {}),
        method: isDeferred ? 'onelink_deferred' : 'onelink_direct',
        capturedAtMs: nowMs,
      };
    }
  }

  if (!attribution && !destination) return null;
  return { isDeferred, attribution, destination, estimated };
}

/**
 * AppsFlyer OneLink contract `nc1`, shared with iOS (provisional until the
 * Owner approves it). Pure rules only; the Android binding is appsflyer.android.ts.
 *
 * - Nearsy reads only `deep_link_value` and `deep_link_sub1..5`. `pid`, `c`,
 *   `af_channel`, `af_ad` and the rest are AppsFlyer reporting, never read here.
 *   sub1 = source, sub2 = campaign, sub3 = content, sub4 = tool, sub5 = contract
 *   version, which must be `nc1` or nothing is attributed.
 * - Three separate outcomes: confirmed acquisition (`signup_*`), a later access
 *   (`campaign_accessed`) and a navigation destination. A destination has no
 *   effect on attribution, and attribution never navigates.
 * - A deferred result counts only with a deterministic match: on Android that is
 *   `match_type = referrer` (Play Install Referrer). Probabilistic, SRN, missing
 *   or unknown matches are dropped; they are never written as acquisition.
 * - Any payload with an OAuth-looking key is discarded whole.
 */
import type { CampaignTouch } from '../analytics/analyticsAttribution.ts';

export const ONELINK_HOST = 'nearsy.onelink.me';
export const ONELINK_TEMPLATE_PATH = '/Uxo6';
export const ONELINK_CONTRACT_VERSION = 'nc1';

export const ONELINK_DESTINATIONS = ['home', 'profile', 'alerts'] as const;
export type OneLinkDestination = (typeof ONELINK_DESTINATIONS)[number];

/** Provisional, shared with iOS (C6). */
export const DIRECT_DESTINATION_TTL_MS = 30 * 60_000;
export const DEFERRED_DESTINATION_TTL_MS = 24 * 3_600_000;
export const DESTINATION_DEDUPE_MS = 10 * 60_000;
/** Late acquisition (signup already sent) is accepted only this long after signup. */
export const ONELINK_LATE_ACQUISITION_CAP_MS = 24 * 3_600_000;

const SLUG = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const RESERVED_VALUES = new Set(['organic', 'unknown', 'none', 'null', 'undefined']);
const FORBIDDEN_KEYS = new Set([
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
]);

/** Exactly the OneLink template, over https. Everything else is not ours to hand over. */
export function isOneLinkUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  const match = /^https:\/\/([^/?#]+)([^?#]*)/i.exec(url.trim());
  if (!match) return false;
  const host = match[1].toLowerCase();
  const path = match[2];
  return (
    host === ONELINK_HOST &&
    (path === ONELINK_TEMPLATE_PATH ||
      path === `${ONELINK_TEMPLATE_PATH}/` ||
      path.startsWith(`${ONELINK_TEMPLATE_PATH}/`))
  );
}

/** Lowercased slug, or nothing. Reserved words are never values. */
export function normalizeOneLinkValue(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const lowered = value.trim().toLowerCase();
  if (!SLUG.test(lowered) || RESERVED_VALUES.has(lowered)) return undefined;
  return lowered;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'string') {
    try {
      return asRecord(JSON.parse(value));
    } catch {
      return null;
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function hasForbiddenKey(payload: Record<string, unknown>): boolean {
  return Object.keys(payload).some((key) => FORBIDDEN_KEYS.has(key.toLowerCase()));
}

function isTrue(value: unknown): boolean {
  return value === true || value === 'true';
}

function lower(value: unknown): string | null {
  return typeof value === 'string' ? value.trim().toLowerCase() : null;
}

function touchFields(payload: Record<string, unknown>): Omit<CampaignTouch, 'method'> | null {
  if (payload.deep_link_sub5 !== ONELINK_CONTRACT_VERSION) return null;
  const source = normalizeOneLinkValue(payload.deep_link_sub1);
  const campaign = normalizeOneLinkValue(payload.deep_link_sub2);
  if (!source && !campaign) return null;
  const content = normalizeOneLinkValue(payload.deep_link_sub3);
  const tool = normalizeOneLinkValue(payload.deep_link_sub4);
  return {
    ...(source ? { source } : {}),
    ...(campaign ? { campaign } : {}),
    ...(content ? { content } : {}),
    ...(tool ? { tool } : {}),
  };
}

function destinationOf(payload: Record<string, unknown>): OneLinkDestination | null {
  const value = lower(payload.deep_link_value);
  return (ONELINK_DESTINATIONS as readonly string[]).includes(value ?? '')
    ? (value as OneLinkDestination)
    : null;
}

export type OneLinkReading = {
  deferred: boolean;
  touch: CampaignTouch | null;
  destination: OneLinkDestination | null;
};

/**
 * A Unified Deep Linking result. Only `FOUND` is read; `NOT_FOUND` and `ERROR`
 * are null. On Android the deep link may arrive as a JSON string.
 */
export function readUnifiedDeepLink(result: unknown): OneLinkReading | null {
  const data = asRecord(result);
  if (!data || data.status !== 'FOUND') return null;
  const payload = asRecord(data.deepLink);
  if (!payload || hasForbiddenKey(payload)) return null;
  // Unknown counts as deferred, the stricter path (same as iOS).
  const flag = payload.is_deferred ?? payload.isDeferred ?? data.isDeferred;
  const deferred = !(flag === false || flag === 'false');
  const fields = touchFields(payload);
  const deterministic = lower(payload.match_type) === 'referrer';
  const touch =
    fields && (!deferred || deterministic)
      ? { ...fields, method: deferred ? ('onelink_deferred' as const) : ('onelink_direct' as const) }
      : null;
  return { deferred, touch, destination: destinationOf(payload) };
}

/**
 * Conversion data, used only as the deferred fallback when UDL found nothing on
 * the first launch. Same rules: first launch of the install, non-organic, not a
 * retargeting conversion, deterministic match, contract `nc1`.
 */
export function readConversionFallback(result: unknown): OneLinkReading | null {
  const payload = asRecord(result);
  if (!payload || hasForbiddenKey(payload)) return null;
  if (!isTrue(payload.is_first_launch)) return null;
  if (lower(payload.af_status) !== 'non-organic') return null;
  if (isTrue(payload.is_retargeting)) return null;
  const fields = touchFields(payload);
  const touch =
    fields && lower(payload.match_type) === 'referrer'
      ? { ...fields, method: 'onelink_deferred' as const }
      : null;
  const destination = destinationOf(payload);
  return touch || destination ? { deferred: true, touch, destination } : null;
}

/**
 * Dedupe of OneLink deliveries (UDL and the cold-start resolution, direct and
 * deferred): only a repeat of the latest touch within 10 min is a duplicate. A
 * map of every recent key would drop A in A, B, A and leave B as the last touch.
 */export function isDuplicateOneLinkTouch(
  latest: { key: string; at: number } | null,
  key: string,
  now: number,
): boolean {
  return latest !== null && latest.key === key && now - latest.at >= 0 && now - latest.at < DESTINATION_DEDUPE_MS;
}

/** Stable key of a touch, for the in-process dedupe of direct and deferred deliveries. */
export function oneLinkTouchKey(touch: CampaignTouch): string {
  // Direct and deferred deliveries of the same touch share the key (nc1 table).
  return [touch.source, touch.campaign, touch.content, touch.tool]
    .map((part) => part ?? '')
    .join('|');
}

/**
 * Extra evidence a OneLink acquisition needs beyond `decideEvidence` (C4):
 * - the account was created after this install and after the touch;
 * - no other account on this install has claimed a OneLink acquisition;
 * - late evidence (signup already sent) only within 24 h of the Firebase
 *   creation time (a cap, never evidence by itself).
 * `installTime` comes from the package manager (first install time), so a
 * restored backup cannot make an old install look new.
 */
export function acceptOneLinkAcquisition(input: {
  touch: CampaignTouch;
  observedAt: number;
  accountCreatedAt: number | null;
  installTime: number | null;
  installClaimedBy: string | null;
  uid: string;
  late: { now: number } | null;
}): boolean {
  const { accountCreatedAt, installTime } = input;
  if (accountCreatedAt === null || installTime === null) return false;
  if (!Number.isFinite(accountCreatedAt) || !Number.isFinite(installTime)) return false;
  if (accountCreatedAt < installTime) return false;
  if (input.observedAt > accountCreatedAt) return false;
  if (input.installClaimedBy !== null) return false;
  if (input.late) {
    const age = input.late.now - accountCreatedAt;
    if (!Number.isFinite(age) || age < 0 || age > ONELINK_LATE_ACQUISITION_CAP_MS) return false;
  }
  return true;
}

type Storage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

export const INSTALL_CLAIM_KEY = 'NEARSY_ONELINK_INSTALL_CLAIM';

/** One OneLink acquisition per install. A claim from another install (backup) is ignored. */
export function createInstallClaim(storage: Storage) {
  return {
    async claimedBy(installTime: number): Promise<string | null> {
      try {
        const parsed = JSON.parse((await storage.getItem(INSTALL_CLAIM_KEY)) ?? 'null') as {
          installTime?: unknown;
          uid?: unknown;
        } | null;
        return parsed && parsed.installTime === installTime && typeof parsed.uid === 'string'
          ? parsed.uid
          : null;
      } catch {
        return null;
      }
    },
    async claim(installTime: number, uid: string): Promise<void> {
      await storage.setItem(INSTALL_CLAIM_KEY, JSON.stringify({ installTime, uid }));
    },
  };
}

export const DESTINATION_KEY = 'NEARSY_ONELINK_DESTINATION';
const DESTINATION_LAST_KEY = 'NEARSY_ONELINK_DESTINATION_LAST';

type PendingDestination = {
  key: OneLinkDestination;
  at: number;
  expiresAt: number;
  uid: string | null;
};

/**
 * Pending navigation, kept apart from attribution (C6). Consumed once, only from
 * the main tabs (signed in, onboarding done). A destination captured with one
 * account is discarded if another account takes it; one captured signed out goes
 * to the first completed session. Sign-out clears it.
 */
export function createDestinationStore(deps: { storage: Storage; now: () => number }) {
  async function readJson<T>(key: string): Promise<T | null> {
    try {
      return JSON.parse((await deps.storage.getItem(key)) ?? 'null') as T | null;
    } catch {
      return null;
    }
  }
  return {
    /** Returns false when ignored as a duplicate of the same key within 10 minutes. */
    async offer(
      key: OneLinkDestination,
      input: { deferred: boolean; uid: string | null },
    ): Promise<boolean> {
      const now = deps.now();
      const last = await readJson<{ key?: unknown; at?: unknown }>(DESTINATION_LAST_KEY);
      if (last && last.key === key && typeof last.at === 'number') {
        const age = now - last.at;
        if (age >= 0 && age < DESTINATION_DEDUPE_MS) return false;
      }
      await deps.storage.setItem(DESTINATION_LAST_KEY, JSON.stringify({ key, at: now }));
      const pending: PendingDestination = {
        key,
        at: now,
        expiresAt: now + (input.deferred ? DEFERRED_DESTINATION_TTL_MS : DIRECT_DESTINATION_TTL_MS),
        uid: input.uid,
      };
      await deps.storage.setItem(DESTINATION_KEY, JSON.stringify(pending));
      return true;
    },
    /** Removes the entry before returning it, so it can never run twice. */
    async take(uid: string): Promise<OneLinkDestination | null> {
      const pending = await readJson<PendingDestination>(DESTINATION_KEY);
      if (!pending) return null;
      await deps.storage.removeItem(DESTINATION_KEY);
      const now = deps.now();
      if (!(ONELINK_DESTINATIONS as readonly string[]).includes(pending.key)) return null;
      if (typeof pending.expiresAt !== 'number' || now > pending.expiresAt) return null;
      if (typeof pending.at !== 'number' || now < pending.at) return null;
      if (pending.uid !== null && pending.uid !== uid) return null;
      return pending.key;
    },
    async clear(): Promise<void> {
      await deps.storage.removeItem(DESTINATION_KEY);
    },
  };
}

export type AppsFlyerSettings = { enabled: true; devKey: string } | { enabled: false };

const DEV_KEY = /^[A-Za-z0-9]{10,64}$/;

/** Runtime check of the build extras. Off unless enabled with a well-formed key. */
export function resolveAppsFlyerSettings(raw: unknown): AppsFlyerSettings {
  const value = asRecord(raw);
  const devKey = typeof value?.devKey === 'string' ? value.devKey.trim() : '';
  return value?.enabled === true && DEV_KEY.test(devKey)
    ? { enabled: true, devKey }
    : { enabled: false };
}

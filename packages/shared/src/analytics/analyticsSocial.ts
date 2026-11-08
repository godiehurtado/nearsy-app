/**
 * Social networks of the active mode as person properties.
 *
 * Manual links come from the profile document. Verified ones come from the
 * Identity callables, so they are known only once the app has asked for them.
 * While any verified status is unknown, the verified list and everything that
 * depends on it are left out of the update; `personKeysToUnset` handles the value
 * already stored.
 */
import type { AnalyticsProperties } from './analyticsContract.ts';

export const VERIFIED_SOCIAL_PLATFORMS = ['instagram', 'youtube', 'tiktok', 'x'] as const;
export type VerifiedSocialPlatform = (typeof VERIFIED_SOCIAL_PLATFORMS)[number];

const MANUAL_BAG_KEYS: Record<string, string> = {
  linkedin: 'linkedin',
  instagram: 'instagram',
  facebook: 'facebook',
  youtube: 'youtube',
  twitter: 'x',
  x: 'x',
  tiktok: 'tiktok',
  snapchat: 'snapchat',
  website: 'website',
};

/** The product stores X as `twitter`; analytics has one name for each network. */
export function toSocialPlatformName(platform: unknown): string | undefined {
  return typeof platform === 'string' ? MANUAL_BAG_KEYS[platform.toLowerCase()] : undefined;
}

function isHttpsUrl(value: unknown): boolean {
  return typeof value === 'string' && /^https:\/\/\S+$/i.test(value.trim());
}

/** An absent bag is empty, as the product reads it; a malformed one is unknown. */
export function readManualPlatforms(
  doc: Record<string, unknown>,
  mode: string,
): string[] | undefined {
  const bag = doc[mode === 'professional' ? 'socialLinksProfessional' : 'socialLinksPersonal'];
  if (bag === undefined || bag === null) return [];
  if (typeof bag !== 'object' || Array.isArray(bag)) return undefined;
  const found = new Set<string>();
  for (const [key, value] of Object.entries(bag as Record<string, unknown>)) {
    const name = MANUAL_BAG_KEYS[key];
    if (name && isHttpsUrl(value)) found.add(name);
  }
  const custom = (bag as { custom?: unknown }).custom;
  if (
    Array.isArray(custom) &&
    custom.some((row) => isHttpsUrl((row as { url?: unknown } | null)?.url))
  ) {
    // A custom network name is free text, so only its presence is reported.
    found.add('custom');
  }
  return [...found].sort();
}

export function socialProperties(
  manual: string[] | undefined,
  verified: string[] | undefined,
): AnalyticsProperties {
  const out: AnalyticsProperties = {};
  if (manual) out.social_platforms_manual = manual;
  if (verified) out.social_platforms_verified = verified;
  if (manual && verified) {
    const connected = [...new Set([...manual, ...verified])].sort();
    out.socials_connected = connected;
    out.has_socials = connected.length > 0;
  }
  return out;
}

export const PENDING_VERIFICATION_KEY = 'NEARSY_ANALYTICS_PENDING_VERIFICATION';

type KeyValueStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

/**
 * Connection attempts not settled yet: an Instagram verification seen pending, or
 * an OAuth attempt (X, YouTube, TikTok) whose finalizer may fail. The attempt can
 * end by a later read, often after the card closed or the process died, so the
 * marker must outlive both. A verified read without a marker is hydration, not a
 * new connection.
 */
export function createPendingVerificationMarkers(storage: KeyValueStorage) {
  // Every operation rewrites one list: run them one at a time.
  let queue: Promise<unknown> = Promise.resolve();
  function serial<T>(run: () => Promise<T>): Promise<T> {
    const next = queue.then(run, run);
    queue = next.catch(() => {});
    return next;
  }
  async function read(): Promise<string[]> {
    try {
      const parsed = JSON.parse((await storage.getItem(PENDING_VERIFICATION_KEY)) ?? '[]');
      return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
    } catch {
      return [];
    }
  }
  return {
    mark(key: string): Promise<void> {
      return serial(async () => {
        const keys = await read();
        if (keys.includes(key)) return;
        await storage.setItem(PENDING_VERIFICATION_KEY, JSON.stringify([...keys, key]));
      });
    },
    /** True once per marker. */
    consume(key: string): Promise<boolean> {
      return serial(async () => {
        const keys = await read();
        if (!keys.includes(key)) return false;
        await storage.setItem(
          PENDING_VERIFICATION_KEY,
          JSON.stringify(keys.filter((item) => item !== key)),
        );
        return true;
      });
    },
    /** Resolves once the operations queued so far are done. */
    idle(): Promise<void> {
      return serial(async () => {});
    },
  };
}

export const CONFIRMED_SOCIALS_KEY_PREFIX = 'NEARSY_ANALYTICS_CONFIRMED_SOCIALS:';

/**
 * Verified networks of the signed-in account, by mode.
 *
 * - A confirmed read, connected or not, is known.
 * - A failed or rejected read (`*_NOT_ENABLED` included) is unknown. It keeps the
 *   last confirmed value of that network, from this process or an earlier one, and
 *   otherwise leaves it out. It never hides the networks that were confirmed.
 * - The list stays unknown until every network of the mode was read once.
 * - `social_linked` (verified) fires once per connection. The direct path and the
 *   reconciliation of a pending attempt share one key.
 * - State belongs to one account. Another account starts clean, and a result
 *   addressed to an account that is no longer signed in is dropped.
 */
export function createVerifiedSocialController(deps: {
  storage: KeyValueStorage;
  currentUid(): string | null;
  emitLinked(uid: string, platform: VerifiedSocialPlatform, mode: string): void;
  /** The verified list of this account may have changed. */
  syncPerson(uid: string): void;
}) {
  const markers = createPendingVerificationMarkers(deps.storage);
  let owner: string | null = null;
  let live = new Map<string, boolean>();
  let failed = new Set<string>();
  let remembered: Map<string, boolean> | null = null;
  let storageQueue: Promise<unknown> = Promise.resolve();
  const linked = new Set<string>();
  const key = (mode: string, platform: string) => `${mode}:${platform}`;
  const markerKey = (uid: string, mode: string, platform: string) =>
    `${uid}:${mode}:${platform}`;

  function load(uid: string): Promise<void> {
    return deps.storage
      .getItem(CONFIRMED_SOCIALS_KEY_PREFIX + uid)
      .then((raw) => {
        const parsed = JSON.parse(raw ?? '{}') as unknown;
        const out = new Map<string, boolean>();
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          for (const [k, v] of Object.entries(parsed)) {
            if (typeof v === 'boolean') out.set(k, v);
          }
        }
        return out;
      })
      .catch(() => new Map<string, boolean>())
      .then((map) => {
        if (owner !== uid) return;
        const modes = new Set([...failed].map((k) => k.split(':')[0]));
        const before = [...modes].map((mode) => verifiedFor(mode));
        remembered = map;
        if ([...modes].some((mode, i) => !sameList(before[i], verifiedFor(mode)))) {
          deps.syncPerson(uid);
        }
      });
  }

  function align(uid: string): void {
    if (owner === uid) return;
    owner = uid;
    live = new Map();
    failed = new Set();
    remembered = null;
    linked.clear();
    storageQueue = load(uid);
  }

  /** The signed-in account, if the result is addressed to it. */
  function ownerFor(expectedUid?: string | null): string | null {
    const uid = deps.currentUid();
    if (!uid || (expectedUid != null && expectedUid !== uid)) return null;
    align(uid);
    return uid;
  }

  function verifiedFor(mode: string, uid?: string): string[] | undefined {
    if (uid !== undefined && uid !== owner) return undefined;
    const out: string[] = [];
    for (const platform of VERIFIED_SOCIAL_PLATFORMS) {
      const k = key(mode, platform);
      const known = live.get(k);
      if (known !== undefined) {
        if (known) out.push(platform);
        continue;
      }
      if (!failed.has(k) || remembered === null) return undefined;
      if (remembered.get(k)) out.push(platform);
    }
    return out.sort();
  }

  function sameList(a: string[] | undefined, b: string[] | undefined): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  function persist(uid: string): void {
    storageQueue = storageQueue
      .then(() => {
        if (owner !== uid || remembered === null) return;
        for (const [k, v] of live) remembered.set(k, v);
        return deps.storage.setItem(
          CONFIRMED_SOCIALS_KEY_PREFIX + uid,
          JSON.stringify(Object.fromEntries(remembered)),
        );
      })
      .catch(() => {});
  }

  function linkOnce(uid: string, mode: string, platform: VerifiedSocialPlatform): void {
    if (owner !== uid || deps.currentUid() !== uid) return;
    const k = key(mode, platform);
    if (linked.has(k)) return;
    linked.add(k);
    deps.emitLinked(uid, platform, mode);
  }

  return {
    verifiedFor,

    /** A confirmed read. */
    note(
      mode: string,
      platform: VerifiedSocialPlatform,
      connected: boolean,
      expectedUid?: string | null,
    ): void {
      const uid = ownerFor(expectedUid);
      if (!uid) return;
      const k = key(mode, platform);
      const before = verifiedFor(mode);
      failed.delete(k);
      live.set(k, connected);
      persist(uid);
      const marker = markerKey(uid, mode, platform);
      if (!connected) {
        linked.delete(k);
        // Instagram reads as not connected while pending: its attempt is still open.
        if (platform !== 'instagram') void markers.consume(marker).catch(() => {});
      } else {
        void markers
          .consume(marker)
          .then((wasPending) => {
            if (wasPending) linkOnce(uid, mode, platform);
          })
          .catch(() => {});
      }
      if (!sameList(before, verifiedFor(mode))) deps.syncPerson(uid);
    },

    /** A failed or rejected read: unknown, never a disconnection. */
    fail(mode: string, platform: VerifiedSocialPlatform, expectedUid?: string | null): void {
      const uid = ownerFor(expectedUid);
      if (!uid) return;
      const k = key(mode, platform);
      if (live.has(k)) return;
      const before = verifiedFor(mode);
      failed.add(k);
      if (!sameList(before, verifiedFor(mode))) deps.syncPerson(uid);
    },

    /** An attempt started; its later confirmed connection counts once. */
    markPending(mode: string, platform: VerifiedSocialPlatform): void {
      const uid = ownerFor();
      if (uid) void markers.mark(markerKey(uid, mode, platform)).catch(() => {});
    },

    /** The direct path confirmed a new connection. */
    linked(mode: string, platform: VerifiedSocialPlatform): void {
      const uid = ownerFor();
      if (uid) linkOnce(uid, mode, platform);
    },

    /** Resolves once queued storage work is done; for tests. */
    async idle(): Promise<void> {
      await storageQueue;
      await markers.idle();
      await Promise.resolve();
    },
  };
}

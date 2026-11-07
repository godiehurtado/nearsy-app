/**
 * Social networks of the active mode as person properties.
 *
 * Manual links come from the profile document. Verified ones come from the
 * Identity callables, so they are known only once the app has asked for them.
 * While any verified status is unknown, the verified list and everything that
 * depends on it are omitted: an unknown state must not clear a stored value.
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

/**
 * Verifications that were seen pending. Instagram ends by a later read, often
 * after the card closed or the process died, so the marker must outlive both.
 * A verified read without a marker is hydration, not a new connection.
 */
export function createPendingVerificationMarkers(storage: {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}) {
  async function read(): Promise<string[]> {
    try {
      const parsed = JSON.parse((await storage.getItem(PENDING_VERIFICATION_KEY)) ?? '[]');
      return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
    } catch {
      return [];
    }
  }
  return {
    async mark(key: string): Promise<void> {
      const keys = await read();
      if (keys.includes(key)) return;
      await storage.setItem(PENDING_VERIFICATION_KEY, JSON.stringify([...keys, key]));
    },
    /** True once per marker. */
    async consume(key: string): Promise<boolean> {
      const keys = await read();
      if (!keys.includes(key)) return false;
      await storage.setItem(
        PENDING_VERIFICATION_KEY,
        JSON.stringify(keys.filter((item) => item !== key)),
      );
      return true;
    },
  };
}

/** Verified status by mode and platform, for the signed-in account. */
export function createVerifiedSocialTracker() {
  const status = new Map<string, boolean>();
  const key = (mode: string, platform: string) => `${mode}:${platform}`;
  return {
    /** Pending or failed reads must not call this: they are still unknown. */
    note(mode: string, platform: VerifiedSocialPlatform, connected: boolean): boolean {
      const previous = status.get(key(mode, platform));
      status.set(key(mode, platform), connected);
      return previous !== connected;
    },
    /** Undefined until all the platforms of this mode are known. */
    verifiedFor(mode: string): string[] | undefined {
      const out: string[] = [];
      for (const platform of VERIFIED_SOCIAL_PLATFORMS) {
        const connected = status.get(key(mode, platform));
        if (connected === undefined) return undefined;
        if (connected) out.push(platform);
      }
      return out.sort();
    },
    clear(): void {
      status.clear();
    },
  };
}

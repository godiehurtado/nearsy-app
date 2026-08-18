import type { SocialCustomLink, SocialLinks } from '../types/profile';
import {
  CRJ_SOCIAL_PLATFORMS,
  emptyCrjSocialDraftValues,
  type CrjSocialDraftValues,
  type CrjSocialPlatformId,
} from './onboardingSocialCatalog';
import {
  normalizeCustomNetworkUrl,
  normalizeSocialInput,
  validateCustomNetworkName,
} from './socialLinkNormalize';

export type CrjSocialPersistencePatch = {
  socialLinksPersonal?: SocialLinks;
  socialLinksProfessional?: SocialLinks;
  profileSetupCompleted: false;
};

function omitUndefinedDeep<T>(value: T): T {
  if (value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map((item) => omitUndefinedDeep(item)) as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      if (nested === undefined) continue;
      out[key] = omitUndefinedDeep(nested);
    }
    return out as T;
  }
  return value;
}

function payloadContainsUndefined(value: unknown): boolean {
  if (value === undefined) return true;
  if (Array.isArray(value)) return value.some(payloadContainsUndefined);
  if (value && typeof value === 'object') {
    return Object.values(value).some(payloadContainsUndefined);
  }
  return false;
}

function sanitizeCustom(
  custom: SocialCustomLink[],
): SocialCustomLink[] | undefined {
  const out: SocialCustomLink[] = [];
  const seen = new Set<string>();
  for (const row of custom) {
    const nameCheck = validateCustomNetworkName(row.name ?? '');
    if (!nameCheck.ok) continue;
    const urlResult = normalizeCustomNetworkUrl(row.url ?? '');
    if (!urlResult.ok || !urlResult.url) continue;
    const name = row.name.trim();
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, url: urlResult.url });
  }
  return out.length > 0 ? out : undefined;
}

/**
 * Build the active-mode SocialLinks write. Reuses production keys.
 * Preserves `website` from existing data (not shown in CRJ).
 * Never writes the opposite mode, visibility, or profileSetupCompleted=true.
 */
export function buildCrjSocialLinksPersistencePatch(
  mode: 'personal' | 'professional',
  values: CrjSocialDraftValues,
  custom: SocialCustomLink[],
  existing?: SocialLinks | null,
): CrjSocialPersistencePatch {
  const links: SocialLinks = {};

  const website = existing?.website?.trim();
  if (website) links.website = website;

  for (const platform of CRJ_SOCIAL_PLATFORMS) {
    const result = normalizeSocialInput(platform.id, values[platform.id] ?? '');
    if (result.ok && result.url) {
      links[platform.storageKey] = result.url;
    }
  }

  const customLinks = sanitizeCustom(custom);
  if (customLinks) links.custom = customLinks;

  const sanitized = omitUndefinedDeep(links);
  if (payloadContainsUndefined(sanitized)) {
    throw new Error('CRJ social patch contained undefined');
  }

  if (mode === 'personal') {
    return {
      profileSetupCompleted: false,
      socialLinksPersonal: sanitized,
    };
  }
  return {
    profileSetupCompleted: false,
    socialLinksProfessional: sanitized,
  };
}

export function readCrjSocialDraft(
  data: Record<string, unknown> | null | undefined,
  mode: 'personal' | 'professional',
): { values: CrjSocialDraftValues; custom: SocialCustomLink[] } {
  const key =
    mode === 'professional' ? 'socialLinksProfessional' : 'socialLinksPersonal';
  const raw = data?.[key];
  const values = emptyCrjSocialDraftValues();
  const custom: SocialCustomLink[] = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { values, custom };
  }
  const links = raw as SocialLinks;
  for (const platform of CRJ_SOCIAL_PLATFORMS) {
    const stored = links[platform.storageKey];
    if (typeof stored === 'string') values[platform.id] = stored;
  }
  if (Array.isArray(links.custom)) {
    for (const row of links.custom) {
      if (!row || typeof row !== 'object') continue;
      if (typeof row.name !== 'string' || typeof row.url !== 'string') continue;
      custom.push({ name: row.name, url: row.url });
    }
  }
  return { values, custom };
}

export function readExistingSocialLinks(
  data: Record<string, unknown> | null | undefined,
  mode: 'personal' | 'professional',
): SocialLinks {
  const key =
    mode === 'professional' ? 'socialLinksProfessional' : 'socialLinksPersonal';
  const raw = data?.[key];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as SocialLinks;
}

/** After Social Media — I8 may later replace this with `gallery`. */
export const POST_SOCIAL_MEDIA_CRJ_STEP = 'location' as const;

export type { CrjSocialPlatformId };

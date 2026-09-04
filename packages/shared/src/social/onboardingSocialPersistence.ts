import type { SocialCustomLink, SocialLinks } from '../types/profile.ts';
import {
  CRJ_SOCIAL_PLATFORMS,
  emptyCrjSocialDraftValues,
  type CrjSocialDraftValues,
  type CrjSocialPlatformId,
} from './onboardingSocialCatalog.ts';
import {
  normalizeCustomNetworkUrl,
  normalizeSocialInput,
  validateCustomNetworkName,
} from './socialLinkNormalize.ts';

/** Field-only social bags — never includes lifecycle keys. */
export type SocialLinksFieldPersistencePatch = {
  socialLinksPersonal?: SocialLinks;
  socialLinksProfessional?: SocialLinks;
};

export type CrjSocialPersistencePatch = SocialLinksFieldPersistencePatch & {
  profileSetupCompleted: false;
};

export type SocialLinksFieldWebsiteMode = 'preserve-existing' | 'draft';

export type BuildSocialLinksFieldInput = {
  values: CrjSocialDraftValues;
  custom: SocialCustomLink[];
  /**
   * `preserve-existing` — CRJ: keep `existing.website` (Website not in wizard).
   * `draft` — post-CRJ: normalize `websiteDraft` as editable Website.
   */
  websiteMode: SocialLinksFieldWebsiteMode;
  websiteDraft?: string;
  existing?: SocialLinks | null;
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

function buildSocialLinksObject(input: BuildSocialLinksFieldInput): SocialLinks {
  const links: SocialLinks = {};

  if (input.websiteMode === 'preserve-existing') {
    const website = input.existing?.website?.trim();
    if (website) links.website = website;
  } else {
    const result = normalizeCustomNetworkUrl(input.websiteDraft ?? '');
    if (result.ok && result.url) {
      links.website = result.url;
    }
  }

  for (const platform of CRJ_SOCIAL_PLATFORMS) {
    const result = normalizeSocialInput(
      platform.id,
      input.values[platform.id] ?? '',
    );
    if (result.ok && result.url) {
      links[platform.storageKey] = result.url;
    }
  }

  const customLinks = sanitizeCustom(input.custom);
  if (customLinks) links.custom = customLinks;

  const sanitized = omitUndefinedDeep(links);
  if (payloadContainsUndefined(sanitized)) {
    throw new Error('Social links field patch contained undefined');
  }
  return sanitized;
}

/**
 * Pure field builder for one mode's SocialLinks bag.
 * Never contaminates the opposite mode; never touches lifecycle.
 */
export function buildSocialLinksFieldPersistencePatch(
  mode: 'personal' | 'professional',
  input: BuildSocialLinksFieldInput,
): SocialLinksFieldPersistencePatch {
  const sanitized = buildSocialLinksObject(input);

  if (mode === 'personal') {
    return { socialLinksPersonal: sanitized };
  }
  return { socialLinksProfessional: sanitized };
}

/**
 * CRJ write — field bag + explicit mid-wizard lifecycle.
 * Preserves `existing.website` (Website not shown in CRJ).
 * Callers: ProfileCompletionScreen only.
 */
export function buildCrjSocialLinksPersistencePatch(
  mode: 'personal' | 'professional',
  values: CrjSocialDraftValues,
  custom: SocialCustomLink[],
  existing?: SocialLinks | null,
): CrjSocialPersistencePatch {
  return {
    ...buildSocialLinksFieldPersistencePatch(mode, {
      values,
      custom,
      websiteMode: 'preserve-existing',
      existing,
    }),
    profileSetupCompleted: false,
  };
}

/**
 * Post-CRJ Own Profile social editor write.
 * Website is editable via `website` (normalized HTTPS).
 * `custom` is the complete replacement set for this save (omit/empty clears).
 * Never includes lifecycle keys.
 */
export function buildPostCrjSocialLinksPersistencePatch(
  mode: 'personal' | 'professional',
  values: CrjSocialDraftValues,
  custom: SocialCustomLink[],
  options?: {
    website?: string;
    existing?: SocialLinks | null;
  },
): SocialLinksFieldPersistencePatch {
  return buildSocialLinksFieldPersistencePatch(mode, {
    values,
    custom,
    websiteMode: 'draft',
    websiteDraft: options?.website,
    existing: options?.existing,
  });
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

/** After Social Media — CRJ-I8 Gallery. */
export const POST_SOCIAL_MEDIA_CRJ_STEP = 'gallery' as const;

export type { CrjSocialPlatformId };

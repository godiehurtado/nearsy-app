import type { SocialCustomLink, SocialLinks } from '../types/profile.ts';
import {
  CRJ_SOCIAL_PLATFORMS,
  VISIBLE_CRJ_SOCIAL_PLATFORMS,
  emptyCrjSocialDraftValues,
  type CrjSocialDraftValues,
  type CrjSocialPlatformId,
} from './onboardingSocialCatalog.ts';
import {
  buildPostCrjSocialLinksPersistencePatch,
  readCrjSocialDraft,
  readExistingSocialLinks,
} from './onboardingSocialPersistence.ts';
import {
  normalizeCustomNetworkUrl,
  normalizeSocialInput,
  type CrjSocialFieldErrors,
} from './socialLinkNormalize.ts';
import type { ProfileMode } from '../profile/profileModeFields.ts';

export {
  parsePostCrjInterestEditorParams as parsePostCrjSocialEditorParams,
  type PostCrjInterestEditorParams as PostCrjSocialEditorParams,
  type ParsedPostCrjInterestEditorParams as ParsedPostCrjSocialEditorParams,
} from '../interests/postCrjInterestEditor.ts';

export type PostCrjSocialCardId = CrjSocialPlatformId | 'website';

/**
 * Post-CRJ editor order: production CRJ catalog + Website.
 * Claude handoff order (IG, LI, X, FB, TT, WA) omits YouTube, Snapchat, Website —
 * cannot adopt without breaking the eight-platform contract.
 */
export const POST_CRJ_SOCIAL_CARD_ORDER: readonly PostCrjSocialCardId[] = [
  ...VISIBLE_CRJ_SOCIAL_PLATFORMS.map((p) => p.id),
  'website',
];

export type PostCrjSocialEditorDraft = {
  values: CrjSocialDraftValues;
  website: string;
  custom: SocialCustomLink[];
  connected: Record<PostCrjSocialCardId, boolean>;
};

export function emptyPostCrjSocialConnectedState(): Record<
  PostCrjSocialCardId,
  boolean
> {
  return {
    linkedin: false,
    instagram: false,
    facebook: false,
    youtube: false,
    x: false,
    tiktok: false,
    snapchat: false,
    website: false,
  };
}

export function readPostCrjSocialEditorDraft(
  data: Record<string, unknown> | null | undefined,
  mode: ProfileMode,
): PostCrjSocialEditorDraft {
  const { values, custom } = readCrjSocialDraft(data, mode);
  const links = readExistingSocialLinks(data, mode);
  const website = typeof links.website === 'string' ? links.website : '';
  const connected = emptyPostCrjSocialConnectedState();

  for (const platform of CRJ_SOCIAL_PLATFORMS) {
    connected[platform.id] = !!(values[platform.id] ?? '').trim();
  }
  connected.website = !!website.trim();

  return {
    values,
    custom,
    website,
    connected,
  };
}

function draftFingerprint(draft: PostCrjSocialEditorDraft): string {
  return JSON.stringify({
    values: draft.values,
    website: draft.website.trim(),
    custom: draft.custom,
    connected: draft.connected,
  });
}

export function arePostCrjSocialDraftsEqual(
  a: PostCrjSocialEditorDraft,
  b: PostCrjSocialEditorDraft,
): boolean {
  return draftFingerprint(a) === draftFingerprint(b);
}

export function isPostCrjSocialEditorDirty(
  snapshot: PostCrjSocialEditorDraft,
  draft: PostCrjSocialEditorDraft,
): boolean {
  return !arePostCrjSocialDraftsEqual(snapshot, draft);
}

/** Own Profile Android ownership cards — never counted from the legacy URL bag. */
export const ANDROID_OWNERSHIP_CARD_IDS = [
  'youtube',
  'tiktok',
  'instagram',
  'x',
] as const satisfies readonly PostCrjSocialCardId[];

export type AndroidOwnershipCardId =
  (typeof ANDROID_OWNERSHIP_CARD_IDS)[number];

export function isAndroidOwnershipCardId(
  id: PostCrjSocialCardId,
): id is AndroidOwnershipCardId {
  return (ANDROID_OWNERSHIP_CARD_IDS as readonly string[]).includes(id);
}

export function countValidPostCrjSocialConnections(
  draft: PostCrjSocialEditorDraft,
  ownershipVerified?: Partial<Record<AndroidOwnershipCardId, boolean>>,
): number {
  let count = 0;
  for (const platform of VISIBLE_CRJ_SOCIAL_PLATFORMS) {
    if (
      ownershipVerified &&
      isAndroidOwnershipCardId(platform.id) &&
      Object.prototype.hasOwnProperty.call(ownershipVerified, platform.id)
    ) {
      if (ownershipVerified[platform.id]) count += 1;
      continue;
    }
    if (!draft.connected[platform.id]) continue;
    const result = normalizeSocialInput(
      platform.id,
      draft.values[platform.id] ?? '',
    );
    if (result.ok && result.url) count += 1;
  }
  if (draft.connected.website) {
    const websiteResult = normalizeCustomNetworkUrl(draft.website);
    if (websiteResult.ok && websiteResult.url) count += 1;
  }
  return count;
}

export type PostCrjSocialValidationResult =
  | { ok: true }
  | {
      ok: false;
      errors: CrjSocialFieldErrors & { website?: string };
    };

export function validatePostCrjSocialDraftForSave(
  draft: PostCrjSocialEditorDraft,
  labels: {
    requiredWhenConnected: string;
    invalidValue: string;
  },
): PostCrjSocialValidationResult {
  const errors: CrjSocialFieldErrors & { website?: string } = {};

  for (const platform of VISIBLE_CRJ_SOCIAL_PLATFORMS) {
    if (!draft.connected[platform.id]) continue;
    const raw = (draft.values[platform.id] ?? '').trim();
    if (!raw) {
      errors[platform.id] = labels.requiredWhenConnected;
      continue;
    }
    const result = normalizeSocialInput(platform.id, raw);
    if (!result.ok) {
      errors[platform.id] = labels.invalidValue;
    }
  }

  if (draft.connected.website) {
    const raw = draft.website.trim();
    if (!raw) {
      errors.website = labels.requiredWhenConnected;
    } else {
      const result = normalizeCustomNetworkUrl(raw);
      if (!result.ok) {
        errors.website = labels.invalidValue;
      }
    }
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }
  return { ok: true };
}

export function buildValuesForPostCrjSocialSave(
  draft: PostCrjSocialEditorDraft,
): CrjSocialDraftValues {
  const values = emptyCrjSocialDraftValues();
  for (const platform of CRJ_SOCIAL_PLATFORMS) {
    if (platform.id === 'snapchat') {
      values.snapchat = draft.values.snapchat ?? '';
      continue;
    }
    if (draft.connected[platform.id]) {
      values[platform.id] = draft.values[platform.id] ?? '';
    }
  }
  return values;
}

export type SocialConnectionCountOptions = {
  /**
   * When true, count verified ownership as one connection and skip the
   * legacy bag URL so Connect + legacy do not double-count.
   */
  youtubeConnected?: boolean;
  tiktokConnected?: boolean;
  instagramConnected?: boolean;
  xConnected?: boolean;
};

export function countConfiguredSocialLinksInBag(
  links: SocialLinks,
  options?: SocialConnectionCountOptions,
): number {
  const youtubeConnected = options?.youtubeConnected === true;
  const tiktokConnected = options?.tiktokConnected === true;
  const instagramConnected = options?.instagramConnected === true;
  const xConnected = options?.xConnected === true;
  let count = 0;
  for (const platform of CRJ_SOCIAL_PLATFORMS) {
    if (platform.id === 'snapchat') continue;
    if (platform.id === 'youtube' && youtubeConnected) continue;
    if (platform.id === 'tiktok' && tiktokConnected) continue;
    if (platform.id === 'instagram' && instagramConnected) continue;
    if (platform.id === 'x' && xConnected) continue;
    const stored = links[platform.storageKey];
    if (typeof stored === 'string' && stored.trim()) {
      count += 1;
    }
  }
  if (typeof links.website === 'string' && links.website.trim()) {
    count += 1;
  }
  if (youtubeConnected) count += 1;
  if (tiktokConnected) count += 1;
  if (instagramConnected) count += 1;
  if (xConnected) count += 1;
  return count;
}

export type OwnProfileSocialSummaryCountOptions = {
  personalYoutubeConnected?: boolean;
  professionalYoutubeConnected?: boolean;
  personalTiktokConnected?: boolean;
  professionalTiktokConnected?: boolean;
  personalInstagramConnected?: boolean;
  professionalInstagramConnected?: boolean;
  personalXConnected?: boolean;
  professionalXConnected?: boolean;
};

export function extractOwnProfileSocialSummaryCounts(
  data: Record<string, unknown> | null | undefined,
  options?: OwnProfileSocialSummaryCountOptions,
): { personal: number; professional: number } {
  return {
    personal: countConfiguredSocialLinksInBag(
      readExistingSocialLinks(data, 'personal'),
      {
        youtubeConnected: options?.personalYoutubeConnected === true,
        tiktokConnected: options?.personalTiktokConnected === true,
        instagramConnected: options?.personalInstagramConnected === true,
        xConnected: options?.personalXConnected === true,
      },
    ),
    professional: countConfiguredSocialLinksInBag(
      readExistingSocialLinks(data, 'professional'),
      {
        youtubeConnected: options?.professionalYoutubeConnected === true,
        tiktokConnected: options?.professionalTiktokConnected === true,
        instagramConnected: options?.professionalInstagramConnected === true,
        xConnected: options?.professionalXConnected === true,
      },
    ),
  };
}

export function applyOwnershipVerifiedChange(
  prev: Partial<Record<AndroidOwnershipCardId, boolean>>,
  id: AndroidOwnershipCardId,
  connected: boolean,
): Partial<Record<AndroidOwnershipCardId, boolean>> {
  if (prev[id] === connected) return prev;
  return { ...prev, [id]: connected };
}

export function shouldReportOwnershipConnectedChange(phase: string): boolean {
  return (
    phase !== 'loading' &&
    phase !== 'connecting' &&
    phase !== 'disconnecting'
  );
}

export { buildPostCrjSocialLinksPersistencePatch };

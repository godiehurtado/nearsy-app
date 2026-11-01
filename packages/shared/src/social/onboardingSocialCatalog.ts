import type { SocialCustomLink, SocialLinks } from '../types/profile.ts';

/**
 * CRJ-I7 Social Media catalog.
 *
 * Display order (CRJ + editor): YouTube → TikTok → Instagram → X →
 * Facebook → LinkedIn → Web. Production `SocialLinks` keys stay storage
 * truth (`twitter` not `x`). Snapchat remains in storage but is hidden.
 */
export type CrjSocialPlatformId =
  | 'linkedin'
  | 'instagram'
  | 'facebook'
  | 'youtube'
  | 'x'
  | 'tiktok'
  | 'snapchat';

export type SocialStorageKey = Exclude<keyof SocialLinks, 'custom'>;

export type CrjSocialPlatform = {
  id: CrjSocialPlatformId;
  storageKey: SocialStorageKey;
  nameKey: CrjSocialPlatformId;
  placeholderKey: CrjSocialPlatformId;
  ionicon: string;
  iconSet: 'ionicons' | 'fontawesome6';
  color: string;
};

export const CRJ_SOCIAL_PLATFORMS: readonly CrjSocialPlatform[] = [
  {
    id: 'youtube',
    storageKey: 'youtube',
    nameKey: 'youtube',
    placeholderKey: 'youtube',
    ionicon: 'logo-youtube',
    iconSet: 'ionicons',
    color: '#FF0000',
  },
  {
    id: 'tiktok',
    storageKey: 'tiktok',
    nameKey: 'tiktok',
    placeholderKey: 'tiktok',
    ionicon: 'logo-tiktok',
    iconSet: 'ionicons',
    color: '#111111',
  },
  {
    id: 'instagram',
    storageKey: 'instagram',
    nameKey: 'instagram',
    placeholderKey: 'instagram',
    ionicon: 'logo-instagram',
    iconSet: 'ionicons',
    color: '#E1306C',
  },
  {
    id: 'x',
    storageKey: 'twitter',
    nameKey: 'x',
    placeholderKey: 'x',
    ionicon: 'x-twitter',
    iconSet: 'fontawesome6',
    color: '#111111',
  },
  {
    id: 'facebook',
    storageKey: 'facebook',
    nameKey: 'facebook',
    placeholderKey: 'facebook',
    ionicon: 'logo-facebook',
    iconSet: 'ionicons',
    color: '#1877F2',
  },
  {
    id: 'linkedin',
    storageKey: 'linkedin',
    nameKey: 'linkedin',
    placeholderKey: 'linkedin',
    ionicon: 'logo-linkedin',
    iconSet: 'ionicons',
    color: '#0A66C2',
  },
  {
    id: 'snapchat',
    storageKey: 'snapchat',
    nameKey: 'snapchat',
    placeholderKey: 'snapchat',
    ionicon: 'logo-snapchat',
    iconSet: 'ionicons',
    color: '#FFFC00',
  },
] as const;

export const MANUAL_CRJ_SOCIAL_PLATFORM_IDS = [
  'facebook',
  'linkedin',
] as const satisfies readonly CrjSocialPlatformId[];

export const CRJ_SOCIAL_PLATFORM_IDS: CrjSocialPlatformId[] =
  CRJ_SOCIAL_PLATFORMS.map((p) => p.id);

/** Visible CRJ/editor platforms. Snapchat stays in storage but is hidden. */
export const VISIBLE_CRJ_SOCIAL_PLATFORMS: readonly CrjSocialPlatform[] =
  CRJ_SOCIAL_PLATFORMS.filter((platform) => platform.id !== 'snapchat');

export const VISIBLE_CRJ_SOCIAL_PLATFORM_IDS: CrjSocialPlatformId[] =
  VISIBLE_CRJ_SOCIAL_PLATFORMS.map((p) => p.id);

export const CUSTOM_NETWORK_NAME_MAX = 22;

export type CrjSocialDraftValues = Record<CrjSocialPlatformId, string>;

export function emptyCrjSocialDraftValues(): CrjSocialDraftValues {
  return {
    linkedin: '',
    instagram: '',
    facebook: '',
    youtube: '',
    x: '',
    tiktok: '',
    snapchat: '',
  };
}

export function getCrjSocialPlatform(
  id: CrjSocialPlatformId,
): CrjSocialPlatform {
  return CRJ_SOCIAL_PLATFORMS.find((p) => p.id === id)!;
}

export function countConnectedSocials(
  values: CrjSocialDraftValues,
  custom: SocialCustomLink[],
  website?: string,
): number {
  const filled = VISIBLE_CRJ_SOCIAL_PLATFORM_IDS.filter(
    (id) => (values[id] ?? '').trim().length > 0,
  ).length;
  const web = (website ?? '').trim().length > 0 ? 1 : 0;
  return filled + custom.length + web;
}

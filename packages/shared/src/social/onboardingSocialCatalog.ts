import type { SocialCustomLink, SocialLinks } from '../types/profile.ts';

/**
 * CRJ-I7 Social Media catalog.
 *
 * Claude wizard order is visual truth. Production `SocialLinks` keys are
 * storage truth (`twitter` not `x`; `website` remains in the model but is
 * not shown in CRJ — it is preserved on persist).
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
    id: 'linkedin',
    storageKey: 'linkedin',
    nameKey: 'linkedin',
    placeholderKey: 'linkedin',
    ionicon: 'logo-linkedin',
    iconSet: 'ionicons',
    color: '#0A66C2',
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
    id: 'facebook',
    storageKey: 'facebook',
    nameKey: 'facebook',
    placeholderKey: 'facebook',
    ionicon: 'logo-facebook',
    iconSet: 'ionicons',
    color: '#1877F2',
  },
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
    id: 'x',
    storageKey: 'twitter',
    nameKey: 'x',
    placeholderKey: 'x',
    ionicon: 'x-twitter',
    iconSet: 'fontawesome6',
    color: '#111111',
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
    id: 'snapchat',
    storageKey: 'snapchat',
    nameKey: 'snapchat',
    placeholderKey: 'snapchat',
    ionicon: 'logo-snapchat',
    iconSet: 'ionicons',
    color: '#FFFC00',
  },
] as const;

export const CRJ_SOCIAL_PLATFORM_IDS: CrjSocialPlatformId[] =
  CRJ_SOCIAL_PLATFORMS.map((p) => p.id);

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
): number {
  const filled = CRJ_SOCIAL_PLATFORM_IDS.filter(
    (id) => (values[id] ?? '').trim().length > 0,
  ).length;
  return filled + custom.length;
}

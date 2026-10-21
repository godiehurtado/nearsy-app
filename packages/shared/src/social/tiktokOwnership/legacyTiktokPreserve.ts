import type { SocialLinks } from '../../types/profile';
import type { SocialLinksFieldPersistencePatch } from '../onboardingSocialPersistence';
import type { ProfileMode } from '../../profile/profileModeFields';

/**
 * Pilot rule: never write a manual TikTok URL as verified ownership, and never
 * delete an existing legacy `tiktok` field when saving other social links.
 */
export function preserveLegacyTiktokInSocialPatch(
  mode: ProfileMode,
  patch: SocialLinksFieldPersistencePatch,
  existing: SocialLinks | null | undefined,
): SocialLinksFieldPersistencePatch {
  const legacy =
    typeof existing?.tiktok === 'string' ? existing.tiktok.trim() : '';
  if (!legacy) return patch;

  const key =
    mode === 'professional' ? 'socialLinksProfessional' : 'socialLinksPersonal';
  const bag = patch[key];
  if (!bag) return patch;

  return {
    ...patch,
    [key]: {
      ...bag,
      tiktok: legacy,
    },
  };
}

/**
 * Strip tiktok from draft values before save so manual entry cannot publish.
 */
export function omitTiktokFromDraftValues<T extends { tiktok?: string }>(
  values: T,
): T {
  const next = { ...values };
  delete next.tiktok;
  return next;
}

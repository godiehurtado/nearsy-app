import type { SocialLinks } from '../../types/profile';
import type { SocialLinksFieldPersistencePatch } from '../onboardingSocialPersistence';
import type { ProfileMode } from '../../profile/profileModeFields';

/**
 * Pilot rule: never write a manual YouTube URL as verified ownership, and never
 * delete an existing legacy `youtube` field when saving other social links.
 */
export function preserveLegacyYoutubeInSocialPatch(
  mode: ProfileMode,
  patch: SocialLinksFieldPersistencePatch,
  existing: SocialLinks | null | undefined,
): SocialLinksFieldPersistencePatch {
  const legacy =
    typeof existing?.youtube === 'string' ? existing.youtube.trim() : '';
  if (!legacy) return patch;

  const key =
    mode === 'professional' ? 'socialLinksProfessional' : 'socialLinksPersonal';
  const bag = patch[key];
  if (!bag) return patch;

  return {
    ...patch,
    [key]: {
      ...bag,
      youtube: legacy,
    },
  };
}

/**
 * Strip youtube from draft values before save so manual entry cannot publish.
 */
export function omitYoutubeFromDraftValues<T extends { youtube?: string }>(
  values: T,
): T {
  const next = { ...values };
  delete next.youtube;
  return next;
}

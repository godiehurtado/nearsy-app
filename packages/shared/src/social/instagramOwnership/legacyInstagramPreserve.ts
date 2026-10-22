import type { SocialLinks } from '../../types/profile';
import type { SocialLinksFieldPersistencePatch } from '../onboardingSocialPersistence';
import type { ProfileMode } from '../../profile/profileModeFields';

/**
 * Pilot rule: never write a manual Instagram URL as verified ownership, and
 * never delete an existing legacy `instagram` field when saving other links.
 */
export function preserveLegacyInstagramInSocialPatch(
  mode: ProfileMode,
  patch: SocialLinksFieldPersistencePatch,
  existing: SocialLinks | null | undefined,
): SocialLinksFieldPersistencePatch {
  const legacy =
    typeof existing?.instagram === 'string' ? existing.instagram.trim() : '';
  if (!legacy) return patch;

  const key =
    mode === 'professional' ? 'socialLinksProfessional' : 'socialLinksPersonal';
  const bag = patch[key];
  if (!bag) return patch;

  return {
    ...patch,
    [key]: {
      ...bag,
      instagram: legacy,
    },
  };
}

export function omitInstagramFromDraftValues<T extends { instagram?: string }>(
  values: T,
): T {
  const next = { ...values };
  delete next.instagram;
  return next;
}

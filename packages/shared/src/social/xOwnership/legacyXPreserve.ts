import type { SocialLinks } from '../../types/profile';
import type { SocialLinksFieldPersistencePatch } from '../onboardingSocialPersistence';
import type { ProfileMode } from '../../profile/profileModeFields';

/**
 * Pilot rule: never write a manual X URL as verified ownership, and never
 * delete an existing legacy `twitter` field when saving other social links.
 * Catalog platform id is `x`; persistence key remains `twitter`.
 */
export function preserveLegacyXInSocialPatch(
  mode: ProfileMode,
  patch: SocialLinksFieldPersistencePatch,
  existing: SocialLinks | null | undefined,
): SocialLinksFieldPersistencePatch {
  const legacy =
    typeof existing?.twitter === 'string' ? existing.twitter.trim() : '';
  if (!legacy) return patch;

  const key =
    mode === 'professional' ? 'socialLinksProfessional' : 'socialLinksPersonal';
  const bag = patch[key];
  if (!bag) return patch;

  return {
    ...patch,
    [key]: {
      ...bag,
      twitter: legacy,
    },
  };
}

/**
 * Strip x from draft values before save so manual entry cannot publish.
 */
export function omitXFromDraftValues<T extends { x?: string }>(values: T): T {
  const next = { ...values };
  delete next.x;
  return next;
}

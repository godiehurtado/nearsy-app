/**
 * Android Own Profile overlay: Identity Get per UID+mode.
 * Does not write the social bag or copy canonicalUrl.
 */
import { VERIFIED_SOCIAL_PLATFORMS } from '../analytics/analyticsSocial.ts';
import { noteSocialOwnership } from '../analytics/analytics';
import { getInstagramOwnershipState } from './instagramOwnership/instagramOwnership.android.ts';
import { getTiktokOwnershipState } from './tiktokOwnership/tiktokOwnership.android.ts';
import { getXOwnershipState } from './xOwnership/xOwnership.android.ts';
import { getYoutubeOwnershipState } from './youtubeOwnership/youtubeOwnership.android.ts';
import type { ProfileMode } from '../profile/profileModeFields.ts';
import type { AndroidOwnershipCardId } from './postCrjSocialEditor.ts';
import {
  emptyOwnershipPresenceByMode,
  presenceFromOwnershipGetResult,
  type OwnershipPresenceByMode,
  type OwnershipPresenceStatus,
} from './ownProfileSocialSummary.ts';

export type OwnProfileSocialOwnershipGetter = (
  mode: ProfileMode,
) => Promise<{ result: string }>;

export type OwnProfileSocialOwnershipGetters = {
  getYoutube?: OwnProfileSocialOwnershipGetter;
  getTiktok?: OwnProfileSocialOwnershipGetter;
  getInstagram?: OwnProfileSocialOwnershipGetter;
  getX?: OwnProfileSocialOwnershipGetter;
};

async function presenceForMode(
  getState: OwnProfileSocialOwnershipGetter,
  mode: ProfileMode,
): Promise<OwnershipPresenceStatus> {
  try {
    const state = await getState(mode);
    return presenceFromOwnershipGetResult(state.result, false);
  } catch {
    return presenceFromOwnershipGetResult(undefined, true);
  }
}

async function presenceByMode(
  getState: OwnProfileSocialOwnershipGetter,
): Promise<Record<ProfileMode, OwnershipPresenceStatus>> {
  const [personal, professional] = await Promise.all([
    presenceForMode(getState, 'personal'),
    presenceForMode(getState, 'professional'),
  ]);
  return { personal, professional };
}

export const OWN_PROFILE_SOCIAL_OVERLAY_SOURCE = 'android-identity-gets' as const;

export async function loadOwnProfileSocialOwnershipOverlay(
  getters?: OwnProfileSocialOwnershipGetters,
): Promise<OwnershipPresenceByMode> {
  const [youtube, tiktok, instagram, x] = await Promise.all([
    presenceByMode(getters?.getYoutube ?? getYoutubeOwnershipState),
    presenceByMode(getters?.getTiktok ?? getTiktokOwnershipState),
    presenceByMode(getters?.getInstagram ?? getInstagramOwnershipState),
    presenceByMode(getters?.getX ?? getXOwnershipState),
  ]);
  const out = emptyOwnershipPresenceByMode();
  const assign = (
    id: AndroidOwnershipCardId,
    byMode: Record<ProfileMode, OwnershipPresenceStatus>,
  ) => {
    out.personal[id] = byMode.personal;
    out.professional[id] = byMode.professional;
  };
  assign('youtube', youtube);
  assign('tiktok', tiktok);
  assign('instagram', instagram);
  assign('x', x);
  for (const mode of ['personal', 'professional'] as const) {
    for (const platform of VERIFIED_SOCIAL_PLATFORMS) {
      const status = out[mode][platform];
      // An error stays unknown: it must not clear a stored network.
      if (status === 'verified' || status === 'not_linked') {
        noteSocialOwnership(mode, platform, status === 'verified');
      }
    }
  }
  return out;
}

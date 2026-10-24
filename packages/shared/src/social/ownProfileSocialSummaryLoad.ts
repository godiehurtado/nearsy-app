/**
 * Non-Android stub — Own Profile ownership overlay is Android-only.
 */
import {
  bagOnlyOwnershipPresenceByMode,
  type OwnershipPresenceByMode,
} from './ownProfileSocialSummary.ts';

export const OWN_PROFILE_SOCIAL_OVERLAY_SOURCE = 'stub-bag-only' as const;

export async function loadOwnProfileSocialOwnershipOverlay(): Promise<OwnershipPresenceByMode> {
  return bagOnlyOwnershipPresenceByMode();
}

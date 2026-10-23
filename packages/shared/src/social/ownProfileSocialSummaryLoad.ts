/**
 * Non-Android stub — Own Profile ownership overlay is Android-only.
 */
import {
  bagOnlyOwnershipPresenceByMode,
  type OwnershipPresenceByMode,
} from './ownProfileSocialSummary.ts';

export async function loadOwnProfileSocialOwnershipOverlay(): Promise<OwnershipPresenceByMode> {
  return bagOnlyOwnershipPresenceByMode();
}

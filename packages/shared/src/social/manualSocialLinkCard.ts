/**
 * Facebook, LinkedIn and Website: links the user saves, never verified accounts.
 * Same states, actions and writes in the CRJ and in the post-CRJ editor. No RN or
 * Firebase, so the contract is testable as is.
 */
import type { ProfileMode } from '../profile/profileModeFields.ts';
import {
  normalizeCustomNetworkUrl,
  normalizeSocialInput,
} from './socialLinkNormalize.ts';

export type ManualSocialLinkId = 'facebook' | 'linkedin' | 'website';

/** Order after the ownership networks (YouTube → TikTok → Instagram → X). */
export const MANUAL_SOCIAL_LINK_ORDER: readonly ManualSocialLinkId[] = [
  'facebook',
  'linkedin',
  'website',
];

export function isManualSocialLinkId(id: string): id is ManualSocialLinkId {
  return (MANUAL_SOCIAL_LINK_ORDER as readonly string[]).includes(id);
}

export type ManualSocialLinkCardState = {
  saved: boolean;
  statusKey: 'profile.social.linkSaved' | 'profile.social.noLinkSaved';
  /** Connect opens the modal; Disconnect withdraws the link. */
  actionLabelKey: 'profile.social.connect' | 'profile.social.disconnect';
  actionA11yKey: 'profile.social.connectA11y' | 'profile.social.disconnectA11y';
  showEdit: boolean;
};

export function manualSocialLinkCardState(
  url: string | null | undefined,
): ManualSocialLinkCardState {
  const saved = (url ?? '').trim().length > 0;
  return saved
    ? {
        saved,
        statusKey: 'profile.social.linkSaved',
        actionLabelKey: 'profile.social.disconnect',
        actionA11yKey: 'profile.social.disconnectA11y',
        showEdit: true,
      }
    : {
        saved,
        statusKey: 'profile.social.noLinkSaved',
        actionLabelKey: 'profile.social.connect',
        actionA11yKey: 'profile.social.connectA11y',
        showEdit: false,
      };
}

/**
 * The merge payload for one link. It holds a single key, so other links, historical
 * custom links and the other mode cannot be touched. Removing needs the delete
 * sentinel: in a merge, simply leaving a key out keeps its stored value.
 */
export function buildManualSocialLinkWrite(
  mode: ProfileMode,
  field: ManualSocialLinkId,
  url: string | null,
  deleteSentinel: unknown,
): Record<string, Record<string, unknown>> {
  const bag =
    mode === 'professional' ? 'socialLinksProfessional' : 'socialLinksPersonal';
  return { [bag]: { [field]: url ?? deleteSentinel } };
}

export type ManualSocialLinkSaveResult =
  | { status: 'saved'; url: string | null }
  /** Nothing was sent: the value is not a valid link for this network. */
  | { status: 'invalid' }
  | { status: 'failed' }
  /** The screen or session this was for is gone; the server result stands. */
  | { status: 'stale' };

/** `raw` null removes the link. Sends only a normalized value, and reports for the caller. */
export async function saveManualSocialLink(input: {
  field: ManualSocialLinkId;
  raw: string | null;
  persist: (field: ManualSocialLinkId, url: string | null) => Promise<void>;
  isCurrent: () => boolean;
}): Promise<ManualSocialLinkSaveResult> {
  let url: string | null = null;
  if (input.raw != null) {
    const result =
      input.field === 'website'
        ? normalizeCustomNetworkUrl(input.raw)
        : normalizeSocialInput(input.field, input.raw);
    if (!result.ok || !result.url) return { status: 'invalid' };
    url = result.url;
  }
  try {
    await input.persist(input.field, url);
  } catch {
    return input.isCurrent() ? { status: 'failed' } : { status: 'stale' };
  }
  return input.isCurrent() ? { status: 'saved', url } : { status: 'stale' };
}

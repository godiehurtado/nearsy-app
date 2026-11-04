/**
 * Manual URL networks (Facebook, LinkedIn, Website): shared state/actions for
 * the CRJ and the post-CRJ editor cards. A saved URL is a link, never a
 * verified account: there is no ownership badge and no OAuth.
 *
 * Pure TS so the contract is testable without React Native.
 */

export type ManualSocialLinkId = 'facebook' | 'linkedin' | 'website';

/** Card order after the verified networks (YouTube → TikTok → Instagram → X). */
export const MANUAL_SOCIAL_LINK_ORDER: readonly ManualSocialLinkId[] = [
  'facebook',
  'linkedin',
  'website',
];

export type ManualSocialLinkCardState = {
  saved: boolean;
  /** i18n key for the status line under the network name. */
  statusKey: 'profile.social.linkSaved' | 'profile.social.noLinkSaved';
  /** Blue pill: Connect when empty, Edit when saved (both open the sheet). */
  primary: {
    labelKey: 'profile.social.connect' | 'profile.social.editLink';
    a11yKey: 'profile.social.connectA11y' | 'profile.social.editLinkA11y';
  };
  /** Disconnect (removes the link) is offered only for a saved link. */
  showRemove: boolean;
};

export function manualSocialLinkCardState(
  url: string | null | undefined,
): ManualSocialLinkCardState {
  const saved = (url ?? '').trim().length > 0;
  return {
    saved,
    statusKey: saved ? 'profile.social.linkSaved' : 'profile.social.noLinkSaved',
    primary: saved
      ? { labelKey: 'profile.social.editLink', a11yKey: 'profile.social.editLinkA11y' }
      : { labelKey: 'profile.social.connect', a11yKey: 'profile.social.connectA11y' },
    showRemove: saved,
  };
}

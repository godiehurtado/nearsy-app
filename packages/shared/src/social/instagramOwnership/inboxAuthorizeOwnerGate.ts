/**
 * Temporary production Owner gate for Instagram inbox authorization.
 * Backend INSTAGRAM_INBOX_ADMIN_UIDS remains the authority.
 */

export const INSTAGRAM_INBOX_PRODUCTION_OWNER_UID =
  'ATuSeZ1dR7dtMUUo0FWzcy7seO43' as const;

export const INSTAGRAM_INBOX_PRODUCTION_PROJECT_ID = 'nearsy-pj' as const;

export type InstagramInboxAuthorizeOwnerGateInput = {
  platform: string;
  firebaseEnvironment: string | null | undefined;
  firebaseProjectId: string | null | undefined;
  uid: string | null | undefined;
};

function isProductionFirebaseEnv(raw: string | null | undefined): boolean {
  const value = String(raw ?? '')
    .trim()
    .toLowerCase();
  return value === 'production' || value === 'prod';
}

/**
 * Show only on iOS production against nearsy-pj for the production Owner UID.
 * Other UIDs, development, and nearsy-dev never see the action.
 */
export function shouldShowInstagramInboxAuthorizeOwnerAction(
  input: InstagramInboxAuthorizeOwnerGateInput,
): boolean {
  if (String(input.platform).toLowerCase() !== 'ios') return false;
  if (!isProductionFirebaseEnv(input.firebaseEnvironment)) return false;
  if (
    String(input.firebaseProjectId ?? '')
      .trim()
      .toLowerCase() !== INSTAGRAM_INBOX_PRODUCTION_PROJECT_ID
  ) {
    return false;
  }
  if (input.uid !== INSTAGRAM_INBOX_PRODUCTION_OWNER_UID) return false;
  return true;
}

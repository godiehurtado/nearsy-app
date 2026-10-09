/**
 * LinkedIn signs in through the A3 custom-token flow and has no Firebase
 * AuthCredential for `reauthenticateWithCredential`. Delete Account never
 * starts LinkedIn: a LinkedIn session either is still recent enough for
 * `deleteMyAccount`, or the user is asked to sign in again themselves.
 */

/** Deterministic UID prefix minted by nearsy-identity-functions for LinkedIn. */
export const LINKEDIN_UID_PREFIX = 'li_';

export const LINKEDIN_DELETION_SIGN_IN_AGAIN_KEY = 'settings.deleteAccount.linkedInSignInAgain';

export function isLinkedInDeterministicUid(uid: string | null | undefined): boolean {
  return typeof uid === 'string' && uid.startsWith(LINKEDIN_UID_PREFIX) && uid.length > 3;
}

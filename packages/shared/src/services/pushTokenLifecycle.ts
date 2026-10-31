/**
 * This-device Expo push token lifecycle (pure).
 * Deletes only users/{uid}/pushTokens/{thisDeviceToken} — never sibling device docs.
 *
 * Firestore (client-enforced counterpart of owner rules, which live in Functions
 * and are not in this repo): a users/{userId}/** write/delete is allowed only
 * when request.auth != null && request.auth.uid == userId. After a session
 * replace the listener may already observe B, so it must not delete A's doc.
 */

export type PushTokenAssociation = {
  uid: string;
  token: string;
};

export type PushAuthSyncPlan =
  | { action: 'none' }
  | { action: 'register' };

export type PushTokenReleaseOutcome =
  | { status: 'released'; uid: string; token: string }
  | { status: 'nothing-to-release' }
  | { status: 'failed'; reason: string; uid?: string };

export type PushTokenAuthReplacePreparation = {
  previousUid: string | null;
  released: boolean;
};

/**
 * App-initiated A→B must not replace the Firebase session while this device
 * is still registered under A. Logged-out first login (no previousUid) may proceed.
 */
export function mayReplaceFirebaseSession(
  prepared: PushTokenAuthReplacePreparation,
): boolean {
  if (!prepared.previousUid) return true;
  return prepared.released === true;
}

export function shouldApplyPushTokenRegisterResult(input: {
  requestGeneration: number;
  currentGeneration: number;
  requestUid: string;
  currentUid: string | null;
}): boolean {
  return (
    input.requestGeneration === input.currentGeneration &&
    input.currentUid != null &&
    input.currentUid === input.requestUid
  );
}

/**
 * Owner rule: mutate users/{targetUid}/pushTokens/{token} only as targetUid.
 */
export function authenticatedIdentityCanMutatePushTokenDoc(
  authenticatedUid: string | null,
  targetUid: string,
): boolean {
  return authenticatedUid != null && authenticatedUid === targetUid;
}

export function planPushTokenAuthSync(input: {
  previousUid: string | null;
  nextUid: string | null;
}): PushAuthSyncPlan {
  if (!input.nextUid) {
    return { action: 'none' };
  }
  return { action: 'register' };
}

export function resolveThisDeviceTokenForRelease(input: {
  uid: string;
  association: PushTokenAssociation | null;
}): { token: string; source: 'association' } | { token: null; source: 'unknown' } {
  if (input.association && input.association.uid === input.uid) {
    return { token: input.association.token, source: 'association' };
  }
  return { token: null, source: 'unknown' };
}

/** Register under the next uid only after this-device release is confirmed. */
export function mayRegisterAfterRelease(
  release: PushTokenReleaseOutcome,
): boolean {
  return release.status !== 'failed';
}

/**
 * Do not write B while this device is still associated with A, and do not
 * recreate docs after account deletion has started or completed.
 */
export function mayRegisterThisDeviceUnderUid(input: {
  nextUid: string;
  association: PushTokenAssociation | null;
  registrationAllowed: boolean;
}): boolean {
  if (!input.registrationAllowed) return false;
  if (input.association && input.association.uid !== input.nextUid) {
    return false;
  }
  return true;
}

export function thisDevicePushTokenDoc(uid: string, token: string): {
  userId: string;
  tokenId: string;
} {
  return { userId: uid, tokenId: token };
}

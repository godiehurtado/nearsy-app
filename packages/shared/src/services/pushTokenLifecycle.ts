/**
 * This-device Expo push token lifecycle (pure).
 * Deletes only users/{uid}/pushTokens/{thisDeviceToken} — never sibling device docs.
 */

export type PushTokenAssociation = {
  uid: string;
  token: string;
};

export type PushAuthSyncPlan =
  | { action: 'none' }
  | { action: 'register' }
  | { action: 'release-then-register'; previousUid: string };

export type PushTokenReleaseOutcome =
  | { status: 'released'; uid: string; token: string }
  | { status: 'nothing-to-release' }
  | { status: 'failed'; reason: string; uid?: string };

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

export function planPushTokenAuthSync(input: {
  previousUid: string | null;
  nextUid: string | null;
}): PushAuthSyncPlan {
  if (!input.nextUid) {
    return { action: 'none' };
  }
  if (input.previousUid && input.previousUid !== input.nextUid) {
    return {
      action: 'release-then-register',
      previousUid: input.previousUid,
    };
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

export function thisDevicePushTokenDoc(uid: string, token: string): {
  userId: string;
  tokenId: string;
} {
  return { userId: uid, tokenId: token };
}

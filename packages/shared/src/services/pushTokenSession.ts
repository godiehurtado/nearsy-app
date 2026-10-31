import {
  authenticatedIdentityCanMutatePushTokenDoc,
  mayRegisterThisDeviceUnderUid,
  planPushTokenAuthSync,
  resolveThisDeviceTokenForRelease,
  shouldApplyPushTokenRegisterResult,
  type PushTokenAssociation,
  type PushTokenAuthReplacePreparation,
  type PushTokenReleaseOutcome,
} from './pushTokenLifecycle';

export type RegisterPushTokenResult =
  | { ok: true; token: string }
  | { ok: false; reason: string };

export type SyncPushTokenAuthResult =
  | { ok: true; registered: boolean }
  | { ok: false; reason: string; registered: false };

export type PushTokenSessionIO = {
  getCurrentUid: () => string | null;
  getPermissionGranted: () => Promise<boolean>;
  getExpoPushToken: () => Promise<string | null>;
  writeThisDeviceToken: (uid: string, token: string) => Promise<void>;
  deleteThisDeviceToken: (uid: string, token: string) => Promise<void>;
  isRegistrationAllowed?: (uid: string) => boolean;
};

type PendingMutation = {
  uid: string;
  token: string;
  done: Promise<void>;
};

export function createPushTokenSession(io: PushTokenSessionIO) {
  let generation = 0;
  let association: PushTokenAssociation | null = null;
  let submitted: PushTokenAssociation | null = null;
  let pendingMutations: PendingMutation[] = [];

  function bumpGeneration(): number {
    generation += 1;
    return generation;
  }

  function trackMutation(uid: string, token: string, op: Promise<void>): Promise<void> {
    const entry: PendingMutation = { uid, token, done: Promise.resolve() };
    const done = op.finally(() => {
      pendingMutations = pendingMutations.filter((item) => item !== entry);
    });
    entry.done = done;
    pendingMutations.push(entry);
    return done;
  }

  async function awaitPendingMutationsFor(uid: string): Promise<void> {
    const pending = pendingMutations.filter((item) => item.uid === uid);
    await Promise.all(pending.map((item) => item.done.catch(() => undefined)));
  }

  function registrationAllowed(uid: string): boolean {
    return io.isRegistrationAllowed ? io.isRegistrationAllowed(uid) : true;
  }

  function snapshotApply(requestGeneration: number, requestUid: string): boolean {
    return shouldApplyPushTokenRegisterResult({
      requestGeneration,
      currentGeneration: generation,
      requestUid,
      currentUid: io.getCurrentUid(),
    });
  }

  async function resolveTokenForUid(uid: string): Promise<string | null> {
    const fromAssoc = resolveThisDeviceTokenForRelease({ uid, association });
    if (fromAssoc.token) return fromAssoc.token;
    if (submitted?.uid === uid) return submitted.token;
    const granted = await io.getPermissionGranted();
    if (!granted) return null;
    return io.getExpoPushToken();
  }

  async function releaseForUid(uid: string): Promise<PushTokenReleaseOutcome> {
    bumpGeneration();
    if (!authenticatedIdentityCanMutatePushTokenDoc(io.getCurrentUid(), uid)) {
      return { status: 'failed', reason: 'identity-mismatch', uid };
    }
    await awaitPendingMutationsFor(uid);
    let token: string | null;
    try {
      token = await resolveTokenForUid(uid);
    } catch {
      return { status: 'failed', reason: 'token-unresolved', uid };
    }
    if (!token) {
      if (association?.uid === uid) association = null;
      if (submitted?.uid === uid) submitted = null;
      return { status: 'nothing-to-release' };
    }
    try {
      await io.deleteThisDeviceToken(uid, token);
    } catch {
      return { status: 'failed', reason: 'delete-failed', uid };
    }
    if (association?.uid === uid && association.token === token) {
      association = null;
    }
    if (submitted?.uid === uid && submitted.token === token) {
      submitted = null;
    }
    return { status: 'released', uid, token };
  }

  async function register(): Promise<RegisterPushTokenResult> {
    const requestUid = io.getCurrentUid();
    if (!requestUid) return { ok: false, reason: 'no-user' };
    if (!registrationAllowed(requestUid)) {
      bumpGeneration();
      return { ok: false, reason: 'registration-suppressed' };
    }
    if (
      !mayRegisterThisDeviceUnderUid({
        nextUid: requestUid,
        association,
        registrationAllowed: true,
      })
    ) {
      return { ok: false, reason: 'previous-release-unconfirmed' };
    }
    const requestGeneration = generation;

    let granted: boolean;
    try {
      granted = await io.getPermissionGranted();
    } catch {
      return { ok: false, reason: 'exception' };
    }
    if (!granted) return { ok: false, reason: 'permission-not-granted' };

    let token: string | null;
    try {
      token = await io.getExpoPushToken();
    } catch {
      return { ok: false, reason: 'exception' };
    }
    if (!token) return { ok: false, reason: 'no-token' };

    if (!snapshotApply(requestGeneration, requestUid)) {
      return { ok: false, reason: 'stale' };
    }

    submitted = { uid: requestUid, token };
    try {
      await trackMutation(
        requestUid,
        token,
        io.writeThisDeviceToken(requestUid, token),
      );
    } catch {
      return { ok: false, reason: 'exception' };
    }

    if (!snapshotApply(requestGeneration, requestUid)) {
      // Release serializes this write then deletes while still A. Do not
      // compensate here: after the session is B, owner rules forbid deleting A.
      return { ok: false, reason: 'stale' };
    }

    association = { uid: requestUid, token };
    return { ok: true, token };
  }

  async function releaseForCurrentUser(): Promise<PushTokenReleaseOutcome> {
    const uid = io.getCurrentUid();
    if (!uid) {
      bumpGeneration();
      return { status: 'failed', reason: 'no-user' };
    }
    return releaseForUid(uid);
  }

  async function prepareForIncomingAuth(): Promise<PushTokenAuthReplacePreparation> {
    const uid = io.getCurrentUid();
    if (!uid) {
      bumpGeneration();
      return { previousUid: null, released: false };
    }
    const release = await releaseForCurrentUser();
    return {
      previousUid: uid,
      released: release.status !== 'failed',
    };
  }

  async function restoreAfterAbortedAuth(
    prepared: PushTokenAuthReplacePreparation,
  ): Promise<RegisterPushTokenResult | { ok: true; registered: false }> {
    if (!prepared.previousUid) {
      return { ok: true, registered: false };
    }
    if (io.getCurrentUid() !== prepared.previousUid) {
      return { ok: true, registered: false };
    }
    const result = await register();
    if (!result.ok) {
      return result;
    }
    return { ok: true, token: result.token };
  }

  async function syncAuth(
    previousUid: string | null,
    nextUid: string | null,
  ): Promise<SyncPushTokenAuthResult> {
    const plan = planPushTokenAuthSync({ previousUid, nextUid });
    bumpGeneration();
    if (plan.action === 'none' || !nextUid) {
      return { ok: true, registered: false };
    }
    if (!registrationAllowed(nextUid)) {
      return {
        ok: false,
        reason: 'registration-suppressed',
        registered: false,
      };
    }
    if (
      !mayRegisterThisDeviceUnderUid({
        nextUid,
        association,
        registrationAllowed: true,
      })
    ) {
      return {
        ok: false,
        reason: 'previous-release-unconfirmed',
        registered: false,
      };
    }
    const result = await register();
    if (!result.ok) {
      return { ok: false, reason: result.reason, registered: false };
    }
    return { ok: true, registered: true };
  }

  return {
    register,
    releaseForUid,
    releaseForCurrentUser,
    prepareForIncomingAuth,
    restoreAfterAbortedAuth,
    syncAuth,
    getAssociation: () => association,
    getGeneration: () => generation,
  };
}

export type PushTokenSession = ReturnType<typeof createPushTokenSession>;

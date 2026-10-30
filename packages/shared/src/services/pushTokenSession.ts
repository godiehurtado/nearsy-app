import {
  mayRegisterAfterRelease,
  planPushTokenAuthSync,
  resolveThisDeviceTokenForRelease,
  shouldApplyPushTokenRegisterResult,
  type PushTokenAssociation,
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
};

export function createPushTokenSession(io: PushTokenSessionIO) {
  let generation = 0;
  let association: PushTokenAssociation | null = null;

  function bumpGeneration(): number {
    generation += 1;
    return generation;
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
    const granted = await io.getPermissionGranted();
    if (!granted) return null;
    return io.getExpoPushToken();
  }

  async function releaseForUid(uid: string): Promise<PushTokenReleaseOutcome> {
    bumpGeneration();
    let token: string | null;
    try {
      token = await resolveTokenForUid(uid);
    } catch {
      return { status: 'failed', reason: 'token-unresolved', uid };
    }
    if (!token) {
      if (association?.uid === uid) association = null;
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
    return { status: 'released', uid, token };
  }

  async function register(): Promise<RegisterPushTokenResult> {
    const requestUid = io.getCurrentUid();
    if (!requestUid) return { ok: false, reason: 'no-user' };
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

    try {
      await io.writeThisDeviceToken(requestUid, token);
    } catch {
      return { ok: false, reason: 'exception' };
    }

    if (!snapshotApply(requestGeneration, requestUid)) {
      try {
        await io.deleteThisDeviceToken(requestUid, token);
      } catch {
        // Compensating delete failed; caller must not treat register as confirmed.
      }
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

  async function syncAuth(
    previousUid: string | null,
    nextUid: string | null,
  ): Promise<SyncPushTokenAuthResult> {
    const plan = planPushTokenAuthSync({ previousUid, nextUid });
    if (plan.action === 'none') {
      bumpGeneration();
      return { ok: true, registered: false };
    }
    if (plan.action === 'release-then-register') {
      const release = await releaseForUid(plan.previousUid);
      if (!mayRegisterAfterRelease(release)) {
        return {
          ok: false,
          reason: 'release-unconfirmed',
          registered: false,
        };
      }
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
    syncAuth,
    getAssociation: () => association,
    getGeneration: () => generation,
  };
}

export type PushTokenSession = ReturnType<typeof createPushTokenSession>;

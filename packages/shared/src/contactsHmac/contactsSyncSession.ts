/**
 * One owner for Contacts operations in this process, for one signed-in account.
 * It lives outside the screen so leaving More cannot lose a request or allow a
 * duplicate. Foreground only: no background task, and the book is never stored.
 */
import {
  DISABLE_CONTACTS_SYNC,
  ENABLE_CONTACTS_SYNC,
  REFRESH_VERIFIED_ACTOR_KEYS,
  REMOVE_CONTACT_SOURCE,
  SYNC_CONTACT_HASHES,
} from './contactsHmacContract.ts';
import {
  ContactsFlowStateError,
  ContactsHmacError,
  ContactsSyncAfterEnableError,
  contactsHmacErrorToI18nKey,
  isContactsOutcomeUncertain,
  mapContactsCallableError,
  parseContactsWireResult,
  shouldScheduleReevaluate,
  type ContactsErrorI18nKey,
  type ContactsHmacFunctionsPort,
} from './contactsHmacCore.ts';
import {
  loadContactsLocalState,
  loadOrCreateSourceIdForUid,
  persistContactsLocalState,
  type KvStore,
} from './contactsSource.ts';
import {
  CONTACTS_STATUS_SIGNED_OUT,
  contactsEnablementFromState,
  contactsSnapshotFromState,
  mergeUserDocIntoState,
  type ContactsOperationKind,
  type ContactsSyncStatus,
} from './contactsSyncStatus.ts';
import {
  applyLateIdentityResult,
  runDisable,
  runEnableThenSync,
  runRefreshKeys,
  runResyncGrantedBook,
  runSyncRetry,
  type ContactsBookPort,
  type ContactsEnableStage,
  type ContactsFlowOutcome,
  type ContactsLocalState,
  type ContactsPermissionStatus,
  type ContactsStateSaver,
} from './contactsSyncFlow.ts';

export type ContactsOpResult =
  | { status: 'ok'; outcome: ContactsFlowOutcome }
  /** An earlier request is still running; nothing was sent. */
  | { status: 'in_flight' }
  /** The account changed; this result was dropped. */
  | { status: 'stale' }
  /** The server may have written: show pending, do not revert. */
  | { status: 'uncertain'; error: ContactsHmacError }
  | { status: 'failed'; error: ContactsHmacError };

export type ContactsUserDocFacts = {
  contactsSyncEnabled: boolean;
  contactsEpoch: number;
};

export type ContactsSessionDeps = {
  currentUid: () => string | null;
  store: KvStore;
  randomBytes: () => Uint8Array | Promise<Uint8Array>;
  region: string;
  /** Raw Identity call: no timeout, no retry. */
  callIdentity: (name: string, data: unknown) => Promise<unknown>;
  createBook: () => ContactsBookPort;
  ensureAppCheck: () => Promise<void>;
  scheduleReevaluate: () => void;
  timeoutMs: number;
};

type Session = {
  uid: string;
  state: ContactsLocalState;
  ready: Promise<void>;
  operation: ContactsOperationKind | null;
  stage: ContactsEnableStage | null;
  liveRequests: number;
  osPermission: ContactsSyncStatus['osPermission'];
  errorKey: ContactsErrorI18nKey | null;
  notifyEffective: boolean | null;
  resultSeq: number;
};

type IdentityOp = 'enable' | 'sync' | 'remove' | 'disable' | 'refresh';

const IDENTITY_OP_BY_CALLABLE: Record<string, IdentityOp> = {
  [ENABLE_CONTACTS_SYNC]: 'enable',
  [SYNC_CONTACT_HASHES]: 'sync',
  [REMOVE_CONTACT_SOURCE]: 'remove',
  [DISABLE_CONTACTS_SYNC]: 'disable',
  [REFRESH_VERIFIED_ACTOR_KEYS]: 'refresh',
};

function sessionChangedError(): ContactsHmacError {
  return new ContactsHmacError(
    'contacts-unauthenticated',
    'Authentication changed during Contacts sync. (contacts-unauthenticated)',
  );
}

export function createContactsSyncSession(deps: ContactsSessionDeps) {
  const listeners = new Set<(status: ContactsSyncStatus) => void>();
  /** Two loads for one account must not mint two sources. */
  const stateLoads = new Map<string, Promise<ContactsLocalState>>();
  /** Per account, not per session: a new session must read past older writes. */
  const saveChains = new Map<string, Promise<void>>();
  let session: Session | null = null;

  function buildStatus(): ContactsSyncStatus {
    if (!session || deps.currentUid() !== session.uid) {
      return CONTACTS_STATUS_SIGNED_OUT;
    }
    return {
      uid: session.uid,
      osPermission: session.osPermission,
      consent: session.state.userConsent === true,
      enablement: contactsEnablementFromState(session.state),
      snapshot: contactsSnapshotFromState(session.state),
      operation: session.operation,
      stage: session.stage,
      awaitingLateResult: session.liveRequests > 0 && !session.operation,
      errorKey: session.errorKey,
      notifyEffective: session.notifyEffective,
      resultSeq: session.resultSeq,
    };
  }

  function emit(): void {
    const status = buildStatus();
    for (const listener of listeners) listener(status);
  }

  function isCurrent(s: Session): boolean {
    return session === s && deps.currentUid() === s.uid;
  }

  function loadState(uid: string): Promise<ContactsLocalState> {
    const running = stateLoads.get(uid);
    if (running) return running;
    const load = (async () => {
      await saveChains.get(uid)?.catch(() => {});
      const sourceId = await loadOrCreateSourceIdForUid(
        deps.store,
        uid,
        deps.randomBytes,
      );
      return loadContactsLocalState(deps.store, uid, sourceId);
    })().finally(() => stateLoads.delete(uid));
    stateLoads.set(uid, load);
    return load;
  }

  function currentSession(): Session | null {
    const uid = deps.currentUid();
    if (!uid) {
      if (session) {
        session = null;
        emit();
      }
      return null;
    }
    if (session?.uid === uid) return session;

    const created: Session = {
      uid,
      state: {
        sourceId: '',
        contactsEpoch: 0,
        lastAckedVersion: null,
        lastAckedFingerprint: null,
        removedSnapshotFloor: null,
      },
      ready: Promise.resolve(),
      operation: null,
      stage: null,
      liveRequests: 0,
      osPermission: 'unknown',
      errorKey: null,
      notifyEffective: null,
      resultSeq: 0,
    };
    created.ready = loadState(uid).then(
      (loaded) => {
        created.state = loaded;
      },
      (err) => {
        // Storage failed: let the next attempt load again.
        if (session === created) session = null;
        throw err;
      },
    );
    session = created;
    return created;
  }

  function persist(s: Session): Promise<void> {
    const snapshot = s.state;
    const write = (saveChains.get(s.uid) ?? Promise.resolve())
      .catch(() => {})
      .then(() => persistContactsLocalState(deps.store, s.uid, snapshot));
    saveChains.set(s.uid, write);
    return write;
  }

  /** Confirmed results stand even if local storage fails afterwards. */
  function persistBestEffort(s: Session): void {
    void persist(s).catch(() => {});
  }

  const saveIntent =
    (s: Session): ContactsStateSaver =>
    async (next) => {
      if (!isCurrent(s)) throw sessionChangedError();
      s.state = next;
      await persist(s);
      if (!isCurrent(s)) throw sessionChangedError();
    };

  /**
   * A reevaluate problem never undoes a committed Identity write. Whether more is
   * still owed is the state's call: a write in doubt stays owed after this fires.
   */
  function fireReevaluate(s: Session, owed: boolean): void {
    if (!owed) return;
    try {
      deps.scheduleReevaluate();
    } catch {
      s.state = { ...s.state, reevaluateOwed: true };
    }
  }

  function noteResult(s: Session, notify: boolean | undefined): void {
    if (typeof notify === 'boolean') s.notifyEffective = notify;
    s.resultSeq += 1;
  }

  function applyLateResult(
    s: Session,
    op: IdentityOp,
    sentVersion: number | undefined,
    raw: unknown,
  ): void {
    if (!isCurrent(s)) return;
    try {
      const result = parseContactsWireResult(raw);
      const owedBefore = s.state.reevaluateOwed === true;
      s.state = applyLateIdentityResult(s.state, op, result, sentVersion);
      const settled = !s.state.uncertainOp;
      if (settled) s.state = { ...s.state, reevaluateOwed: false };
      fireReevaluate(
        s,
        shouldScheduleReevaluate(result) || (settled && owedBefore),
      );
      s.errorKey = null;
      noteResult(s, result.notifyNearbyContactsEffective);
      persistBestEffort(s);
    } catch {
      /* Unreadable reply proves nothing: the pending state stays. */
    }
    emit();
  }

  function applyLateError(s: Session, op: IdentityOp, err: unknown): void {
    if (!isCurrent(s)) return;
    const mapped = mapContactsCallableError(err);
    if (!isContactsOutcomeUncertain(mapped.reason)) {
      // Identity refused: this write did not land.
      if (s.state.uncertainOp === op) {
        s.state = { ...s.state, uncertainOp: null };
        persistBestEffort(s);
      }
      s.errorKey = contactsHmacErrorToI18nKey(mapped.reason);
    }
    emit();
  }

  /**
   * The timeout frees the UI, not the operation: the request counts as live until
   * it actually settles, however long that takes, because time passing proves
   * nothing about it. So within a session no later operation can overlap it or be
   * overwritten by its reply. If it never settles the section stays pending until
   * the next session (sign-out or restart), whose replies are separate.
   * The identifiers are not retained: only name and version stay in scope.
   */
  function trackRequest(
    s: Session,
    name: string,
    sentVersion: number | undefined,
    request: Promise<unknown>,
  ): Promise<unknown> {
    const op = IDENTITY_OP_BY_CALLABLE[name];
    s.liveRequests += 1;
    return new Promise((resolve, reject) => {
      let timedOut = false;
      const timeoutTimer = setTimeout(() => {
        timedOut = true;
        reject(
          new ContactsHmacError(
            'contacts-transport-uncertain',
            'Contacts could not confirm the result in time. (contacts-timeout)',
          ),
        );
      }, deps.timeoutMs);

      const settle = (deliver: () => void, deliverLate: () => void) => {
        clearTimeout(timeoutTimer);
        s.liveRequests = Math.max(0, s.liveRequests - 1);
        if (!timedOut) deliver();
        else if (op) deliverLate();
      };
      request.then(
        (value) =>
          settle(
            () => resolve(value),
            () => applyLateResult(s, op, sentVersion, value),
          ),
        (err) =>
          settle(
            () => reject(err),
            () => applyLateError(s, op, err),
          ),
      );
    });
  }

  function functionsPort(s: Session): ContactsHmacFunctionsPort {
    return {
      region: deps.region,
      async call(name, data) {
        // The token follows the signed-in user: never send one account's book
        // or epoch under another account's credentials.
        if (!isCurrent(s)) throw sessionChangedError();
        const sentVersion =
          name === SYNC_CONTACT_HASHES
            ? (data as { snapshotVersion?: number } | undefined)?.snapshotVersion
            : undefined;
        return trackRequest(
          s,
          name,
          sentVersion,
          (async () => deps.callIdentity(name, data ?? {}))(),
        );
      },
    };
  }

  function guardedBook(s: Session): ContactsBookPort {
    const book = deps.createBook();
    const guard = <T>(step: () => Promise<T>) => async () => {
      if (!isCurrent(s)) throw sessionChangedError();
      const value = await step();
      if (!isCurrent(s)) throw sessionChangedError();
      return value;
    };
    return {
      getPermission: guard(() => book.getPermission()),
      requestPermission: guard(() => book.requestPermission()),
      readRecords: guard(() => book.readRecords()),
    };
  }

  function applyOutcome(s: Session, outcome: ContactsFlowOutcome): void {
    s.state = outcome.state;
    if (outcome.permission) s.osPermission = outcome.permission;
    fireReevaluate(s, outcome.scheduleReevaluate);
    s.errorKey = null;
    noteResult(s, outcome.result?.notifyNearbyContactsEffective);
    persistBestEffort(s);
  }

  function applyFailure(
    s: Session,
    kind: ContactsOperationKind,
    err: unknown,
  ): ContactsOpResult {
    const error = mapContactsCallableError(err);
    if (err instanceof ContactsFlowStateError) {
      s.state = err.state;
      if (err.permission) s.osPermission = err.permission as ContactsPermissionStatus;
      fireReevaluate(s, err.scheduleReevaluate);
    }
    if (err instanceof ContactsSyncAfterEnableError) {
      noteResult(s, err.enableResult.notifyNearbyContactsEffective);
    }
    const uncertain = isContactsOutcomeUncertain(error.reason);
    // Enable refused and nothing landed: the consent tap led nowhere.
    if (
      kind === 'enable' &&
      !uncertain &&
      s.state.enablementConfirmed !== true &&
      s.state.uncertainOp !== 'enable'
    ) {
      s.state = { ...s.state, userConsent: false };
    }
    if (kind !== 'refresh') {
      s.errorKey = contactsHmacErrorToI18nKey(error.reason);
    }
    persistBestEffort(s);
    return uncertain ? { status: 'uncertain', error } : { status: 'failed', error };
  }

  async function run(
    kind: ContactsOperationKind,
    exec: (
      s: Session,
      ctx: {
        functions: ContactsHmacFunctionsPort;
        saveState: ContactsStateSaver;
        onStage: (stage: ContactsEnableStage) => void;
      },
    ) => Promise<ContactsFlowOutcome>,
  ): Promise<ContactsOpResult> {
    const s = currentSession();
    if (!s) {
      return {
        status: 'failed',
        error: new ContactsHmacError(
          'contacts-unauthenticated',
          'Authentication is required. (contacts-unauthenticated)',
        ),
      };
    }
    // Set before any await: a second tap cannot pass this check.
    if (s.operation || s.liveRequests > 0) return { status: 'in_flight' };
    s.operation = kind;
    s.stage = null;
    s.errorKey = null;
    emit();
    try {
      await s.ready;
      if (!isCurrent(s)) return { status: 'stale' };
      await deps.ensureAppCheck();
      if (!isCurrent(s)) return { status: 'stale' };
      const outcome = await exec(s, {
        functions: functionsPort(s),
        saveState: saveIntent(s),
        onStage: (stage) => {
          s.stage = stage;
          if (isCurrent(s)) emit();
        },
      });
      if (!isCurrent(s)) return { status: 'stale' };
      applyOutcome(s, outcome);
      return { status: 'ok', outcome };
    } catch (err) {
      if (!isCurrent(s)) return { status: 'stale' };
      return applyFailure(s, kind, err);
    } finally {
      s.operation = null;
      s.stage = null;
      if (isCurrent(s)) emit();
    }
  }

  const enableThenSync = () =>
    run('enable', async (s, ctx) => {
      if (s.state.uncertainOp === 'disable') {
        // A disable may still be in transit from an earlier session. Repeating it
        // moves the epoch past it, so it can no longer land on top of this enable.
        const fenced = await runDisable({
          functions: ctx.functions,
          state: s.state,
          saveState: ctx.saveState,
        });
        s.state = fenced.state;
        fireReevaluate(s, fenced.scheduleReevaluate);
      }
      // Explicit user action; saved with the intent, before anything is sent.
      s.state = { ...s.state, userConsent: true };
      return runEnableThenSync({
        functions: ctx.functions,
        book: guardedBook(s),
        state: s.state,
        onStage: ctx.onStage,
        saveState: ctx.saveState,
      });
    });

  const retrySync = () =>
    run('enable', (s, ctx) => {
      s.state = { ...s.state, userConsent: true };
      return runSyncRetry({
        functions: ctx.functions,
        book: guardedBook(s),
        state: s.state,
        onStage: ctx.onStage,
        saveState: ctx.saveState,
      });
    });

  const disable = () =>
    run('disable', (s, ctx) =>
      runDisable({
        functions: ctx.functions,
        state: s.state,
        saveState: ctx.saveState,
      }),
    );

  const reconcile = () =>
    run('reconcile', (s, ctx) =>
      runResyncGrantedBook({
        functions: ctx.functions,
        book: guardedBook(s),
        state: s.state,
        saveState: ctx.saveState,
      }),
    );

  return {
    getStatus: () => buildStatus(),
    subscribe(listener: (status: ContactsSyncStatus) => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    /** Call on every auth change, so sign-out + same uid is a new session too. */
    handleAuthChanged(nextUid: string | null): void {
      if (session && session.uid !== nextUid) {
        session = null;
        emit();
      }
    },
    /** User tapped to enable, or to retry an enable or a pending sync. */
    enableThenSync,
    disable,
    /** User-facing retry of whatever is still unconfirmed. */
    async retry(): Promise<ContactsOpResult> {
      const s = currentSession();
      // Decide on what was saved: right after a restart it may still be loading.
      await s?.ready.catch(() => {});
      const state = s?.state;
      if (state?.uncertainOp === 'disable') return disable();
      if (state?.enablementConfirmed === true && state.epochStale !== true) {
        return retrySync();
      }
      return enableThenSync();
    },
    refreshKeys: () =>
      run('refresh', (s, ctx) =>
        runRefreshKeys({ functions: ctx.functions, state: s.state }),
      ),
    /**
     * Facts read from users/{uid}. May settle an uncertain enable or disable, and
     * re-send an unconfirmed upload for an account that consented on this device.
     * Never prompts and never removes a source.
     */
    async bindUserDoc(uid: string, doc: ContactsUserDocFacts): Promise<void> {
      const s = currentSession();
      if (!s || s.uid !== uid) return;
      await s.ready;
      if (!isCurrent(s)) return;
      try {
        s.osPermission = await deps.createBook().getPermission();
      } catch {
        s.osPermission = 'unknown';
      }
      if (!isCurrent(s)) return;
      if (s.operation || s.liveRequests > 0) {
        emit();
        return;
      }
      s.state = mergeUserDocIntoState(s.state, doc);
      if (!s.state.uncertainOp && s.state.reevaluateOwed === true) {
        s.state = { ...s.state, reevaluateOwed: false };
        fireReevaluate(s, true);
      }
      persistBestEffort(s);
      emit();
      if (
        s.state.uncertainOp === 'sync' &&
        s.state.userConsent === true &&
        s.state.enablementConfirmed === true &&
        s.osPermission === 'granted'
      ) {
        void reconcile();
      }
    },
  };
}

export type ContactsSyncSession = ReturnType<typeof createContactsSyncSession>;

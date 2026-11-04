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
  withConfirmedEpoch,
  withDisableIntent,
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

/** The user accepted the in-app disclosure, just now. Only the screen can say so. */
export type ContactsDisclosureAcceptance = { disclosureAccepted: true };

export type ContactsOpResult =
  | { status: 'ok'; outcome: ContactsFlowOutcome }
  /** Needs the disclosure accepted first: no permission, Identity call or book read. */
  | { status: 'needs_disclosure' }
  /** An earlier request is still running; nothing was sent. */
  | { status: 'in_flight' }
  /** The account changed; this result was dropped. */
  | { status: 'stale' }
  /** The user turned off meanwhile; this flow stopped and its result was dropped. */
  | { status: 'cancelled' }
  /** The account's state has not been read yet: nothing was sent. */
  | { status: 'not_ready' }
  /** The server may have written: show pending, do not revert. */
  | { status: 'uncertain'; error: ContactsHmacError }
  | { status: 'failed'; error: ContactsHmacError };

export type ContactsUserDocFacts = {
  contactsSyncEnabled: boolean;
  /** Null when the document has no such field: that is not epoch 0. */
  contactsEpoch: number | null;
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
  /** A read of the account was applied; until then "off" would be a guess. */
  bound: boolean;
  readFailed: boolean;
  readDeadline: ReturnType<typeof setTimeout> | null;
  /** Read that arrived during an operation, applied once it settles. */
  deferredDoc: ContactsUserDocFacts | null;
  /** The automatic resend runs at most once per session. */
  reconcileTried: boolean;
  /** Each accepted operation takes one; a disable invalidates the one running. */
  token: number;
  liveDisables: number;
};

type IdentityOp = 'enable' | 'sync' | 'remove' | 'disable' | 'refresh';

const IDENTITY_OP_BY_CALLABLE: Record<string, IdentityOp> = {
  [ENABLE_CONTACTS_SYNC]: 'enable',
  [SYNC_CONTACT_HASHES]: 'sync',
  [REMOVE_CONTACT_SOURCE]: 'remove',
  [DISABLE_CONTACTS_SYNC]: 'disable',
  [REFRESH_VERIFIED_ACTOR_KEYS]: 'refresh',
};

function operationCancelledError(): ContactsHmacError {
  return new ContactsHmacError('generic', 'Contacts operation was cancelled.');
}

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
      stateConfirmed: session.bound,
      readFailed: session.readFailed,
      disableInFlight:
        session.operation === 'disable' || session.liveDisables > 0,
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
      bound: false,
      readFailed: false,
      readDeadline: null,
      deferredDoc: null,
      reconcileTried: false,
      token: 0,
      liveDisables: 0,
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

  /** Stops the flow holding this token if the account changed or the user turned off. */
  function assertLive(s: Session, token: number): void {
    if (!isCurrent(s)) throw sessionChangedError();
    if (s.token !== token) throw operationCancelledError();
  }

  const saveIntent =
    (s: Session, token: number): ContactsStateSaver =>
    async (next) => {
      assertLive(s, token);
      s.state = next;
      await persist(s);
      assertLive(s, token);
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

  /**
   * A reply to a cancelled flow (contract §14.5): it may only raise the epoch. It is
   * not on, not consent, and starts nothing. What it did on the server may still
   * owe a reevaluate.
   */
  function applyCancelledReply(s: Session, raw: unknown): void {
    if (!isCurrent(s)) return;
    try {
      const result = parseContactsWireResult(raw);
      s.state = withConfirmedEpoch(s.state, result.contactsEpoch);
      if (result.syncCommitted && result.reevaluateRequired) {
        if (s.state.uncertainOp) s.state = { ...s.state, reevaluateOwed: true };
        else fireReevaluate(s, true);
      }
      persistBestEffort(s);
    } catch {
      /* Unreadable: nothing to learn from it. */
    }
    emit();
  }

  /** A read that arrived mid-operation applies once nothing is in the air. */
  function applyDeferredDoc(s: Session): void {
    if (!isCurrent(s) || s.operation || s.liveRequests > 0 || !s.deferredDoc) return;
    const doc = s.deferredDoc;
    s.deferredDoc = null;
    applyUserDoc(s, doc);
  }

  function clearReadDeadline(s: Session): void {
    if (s.readDeadline) clearTimeout(s.readDeadline);
    s.readDeadline = null;
  }

  function applyUserDoc(
    s: Session,
    doc: ContactsUserDocFacts,
    mayResend = true,
  ): void {
    clearReadDeadline(s);
    s.state = mergeUserDocIntoState(s.state, doc);
    s.bound = true;
    s.readFailed = false;
    if (!s.state.uncertainOp && s.state.reevaluateOwed === true) {
      s.state = { ...s.state, reevaluateOwed: false };
      fireReevaluate(s, true);
    }
    persistBestEffort(s);
    emit();
    if (
      mayResend &&
      !s.reconcileTried &&
      s.state.uncertainOp === 'sync' &&
      s.state.userConsent === true &&
      s.state.enablementConfirmed === true &&
      s.osPermission === 'granted'
    ) {
      s.reconcileTried = true;
      void reconcile();
    }
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
    token: number,
    name: string,
    sentVersion: number | undefined,
    request: Promise<unknown>,
  ): Promise<unknown> {
    const op = IDENTITY_OP_BY_CALLABLE[name];
    s.liveRequests += 1;
    if (op === 'disable') s.liveDisables += 1;
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
        if (op === 'disable') s.liveDisables = Math.max(0, s.liveDisables - 1);
        if (!timedOut) deliver();
        else if (op) deliverLate();
        applyDeferredDoc(s);
      };
      request.then(
        (value) => {
          if (s.token !== token) applyCancelledReply(s, value);
          settle(
            () => resolve(value),
            () => {
              if (s.token === token) applyLateResult(s, op, sentVersion, value);
            },
          );
        },
        (err) =>
          settle(
            () => reject(err),
            () => {
              if (s.token === token) applyLateError(s, op, err);
              else if (isCurrent(s)) emit();
            },
          ),
      );
    });
  }

  function functionsPort(s: Session, token: number): ContactsHmacFunctionsPort {
    return {
      region: deps.region,
      async call(name, data) {
        // The token follows the signed-in user: never send one account's book
        // or epoch under another account's credentials.
        assertLive(s, token);
        const sentVersion =
          name === SYNC_CONTACT_HASHES
            ? (data as { snapshotVersion?: number } | undefined)?.snapshotVersion
            : undefined;
        return trackRequest(
          s,
          token,
          name,
          sentVersion,
          (async () => deps.callIdentity(name, data ?? {}))(),
        );
      },
    };
  }

  function guardedBook(s: Session, token: number): ContactsBookPort {
    const book = deps.createBook();
    const guard = <T>(step: () => Promise<T>) => async () => {
      assertLive(s, token);
      const value = await step();
      assertLive(s, token);
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
    // Nothing is on and nothing may be: the consent tap led nowhere.
    if (
      kind === 'enable' &&
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
        book: () => ContactsBookPort;
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
    // All set before any await: a second tap cannot pass these checks.
    if (kind === 'disable') {
      // Turning off goes ahead of whatever is running, and cancels it.
      if (s.operation === 'disable' || s.liveDisables > 0) {
        return { status: 'in_flight' };
      }
      if (!s.bound) return { status: 'not_ready' };
    } else {
      if (s.operation || s.liveRequests > 0) return { status: 'in_flight' };
      if (kind === 'enable' && !s.bound) return { status: 'not_ready' };
      // A turn-off that is still unresolved comes first. Nothing goes on around it.
      if (
        (kind === 'enable' || kind === 'reconcile') &&
        s.state.uncertainOp === 'disable'
      ) {
        return { status: 'not_ready' };
      }
    }
    const token = (s.token += 1);
    s.operation = kind;
    s.stage = null;
    s.errorKey = null;
    emit();
    const dropped = (): ContactsOpResult =>
      isCurrent(s) ? { status: 'cancelled' } : { status: 'stale' };
    try {
      await s.ready;
      if (kind === 'disable') {
        // Recorded at once: from here no pending intent can come back.
        s.state = {
          ...withDisableIntent(s.state),
          // Only what was already owed: this call's own need is decided by its reply.
          reevaluateOwed: s.state.reevaluateOwed === true,
        };
        await persist(s);
      }
      if (!isCurrent(s) || s.token !== token) return dropped();
      await deps.ensureAppCheck();
      if (!isCurrent(s) || s.token !== token) return dropped();
      const outcome = await exec(s, {
        functions: functionsPort(s, token),
        saveState: saveIntent(s, token),
        book: () => guardedBook(s, token),
        onStage: (stage) => {
          if (s.token !== token) return;
          s.stage = stage;
          if (isCurrent(s)) emit();
        },
      });
      if (!isCurrent(s) || s.token !== token) return dropped();
      applyOutcome(s, outcome);
      return { status: 'ok', outcome };
    } catch (err) {
      if (!isCurrent(s) || s.token !== token) return dropped();
      return applyFailure(s, kind, err);
    } finally {
      if (s.token === token) {
        s.operation = null;
        s.stage = null;
        if (isCurrent(s)) {
          emit();
          applyDeferredDoc(s);
        }
      }
    }
  }

  const enableThenSync = (mayEnable = true) =>
    run('enable', async (s, ctx) => {
      // Explicit user action; saved with the intent, before anything is sent.
      s.state = { ...s.state, userConsent: true };
      return runEnableThenSync({
        functions: ctx.functions,
        book: ctx.book(),
        state: s.state,
        onStage: ctx.onStage,
        saveState: ctx.saveState,
        mayEnable,
      });
    });

  const retrySync = () =>
    run('enable', (s, ctx) => {
      s.state = { ...s.state, userConsent: true };
      return runSyncRetry({
        functions: ctx.functions,
        book: ctx.book(),
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
        book: ctx.book(),
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
    /** User accepted the disclosure and asked to turn on. */
    enableThenSync: async (
      acceptance?: ContactsDisclosureAcceptance,
    ): Promise<ContactsOpResult> =>
      acceptance?.disclosureAccepted === true
        ? enableThenSync()
        : { status: 'needs_disclosure' },
    disable,
    /** User-facing retry of whatever is still unconfirmed. */
    async retry(
      acceptance?: ContactsDisclosureAcceptance,
    ): Promise<ContactsOpResult> {
      const s = currentSession();
      // Decide on what was saved: right after a restart it may still be loading.
      await s?.ready.catch(() => {});
      if (!s?.bound) return { status: 'not_ready' };
      const state = s.state;
      if (state.uncertainOp === 'disable') return disable();
      const bookPath =
        state.enablementConfirmed === true || state.uncertainOp === 'enable';
      // On from another install, say: consent on this device has not happened yet.
      if (
        bookPath &&
        state.userConsent !== true &&
        acceptance?.disclosureAccepted !== true
      ) {
        return { status: 'needs_disclosure' };
      }
      if (state.enablementConfirmed === true) {
        // After a mismatch this reads the state first: if it reads off, it stays
        // off, because retrying a sync is not a request to turn on.
        return state.epochStale === true ? enableThenSync(false) : retrySync();
      }
      // Only an enable still in doubt is retried. Off stays off until the user acts.
      if (state.uncertainOp === 'enable') return enableThenSync();
      return { status: 'not_ready' };
    },
    refreshKeys: () =>
      run('refresh', (s, ctx) =>
        runRefreshKeys({ functions: ctx.functions, state: s.state }),
      ),
    /**
     * A read of the account is on its way. It gets one deadline, so "checking" always
     * ends; nothing here reads again by itself.
     */
    expectUserDocRead(uid: string): void {
      const s = currentSession();
      if (!s || s.uid !== uid || s.bound) return;
      clearReadDeadline(s);
      s.readFailed = false;
      s.readDeadline = setTimeout(() => {
        s.readDeadline = null;
        if (!isCurrent(s) || s.bound) return;
        s.readFailed = true;
        emit();
      }, deps.timeoutMs);
      emit();
    },
    reportUserDocReadFailed(uid: string): void {
      const s = currentSession();
      if (!s || s.uid !== uid || s.bound) return;
      clearReadDeadline(s);
      s.readFailed = true;
      emit();
    },
    /**
     * Facts read from users/{uid}. May settle an uncertain enable or disable, and
     * re-send an unconfirmed upload for an account that consented on this device,
     * unless the caller only asked to read. Never prompts or removes a source.
     */
    async bindUserDoc(
      uid: string,
      doc: ContactsUserDocFacts,
      options?: { readOnly?: boolean },
    ): Promise<void> {
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
        s.deferredDoc = doc;
        emit();
        return;
      }
      applyUserDoc(s, doc, options?.readOnly !== true);
    },
  };
}

export type ContactsSyncSession = ReturnType<typeof createContactsSyncSession>;

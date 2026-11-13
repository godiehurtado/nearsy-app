/**
 * Central analytics client. Rules:
 * - Disabled config: nothing is created, stored, queued or sent.
 * - Every SDK call is isolated, sync and async failures never reach the app.
 * - Operations run in call order, so an event cannot overtake an identity
 *   change. Until the transport is ready they wait in a small bounded queue.
 * - Account-scoped events name their uid and are dropped if the session moved.
 * - PostHog distinct_id = analyticsDistinctId(uid, creationTime) (Functions
 *   proposal G). The same-account checks stay on the UID.
 */
import {
  EVENT_RULES,
  PERSON_PROPERTY_RULES,
  SUPER_PROPERTY_RULES,
  TRACKING_PLAN_VERSION,
  type AnalyticsEventName,
  type PropertyRuleMap,
} from './contract';
import type { AnalyticsConfig } from './config';
import { deviceAnalyticsDistinctId } from './distinctId';
import { sanitizeProperties } from './sanitize';
import {
  silentAnalyticsLogger,
  type AnalyticsLogger,
  type AnalyticsProps,
  type AnalyticsTransport,
  type AnalyticsTransportFactory,
} from './transport';

export type AuthSnapshot = {
  uid: string;
  email: string | null;
  creationTime: string | null;
};

export type AppBinaryInfo = {
  appVersion: string | null;
  appBuild: string | null;
};

export type AnalyticsClientDeps = {
  config: AnalyticsConfig;
  createTransport: AnalyticsTransportFactory;
  binary: () => AppBinaryInfo;
  /** Live Firebase session; sign-in can complete before the auth listener runs. */
  readSession?: () => AuthSnapshot | null;
  logger?: AnalyticsLogger;
  /**
   * PostHog distinct_id for a session; null = cannot be identified yet (an
   * li_ account without a readable creation time after the cutover).
   * Defaults to the shared contract function.
   */
  distinctIdFor?: (session: AuthSnapshot) => string | null;
};

const MAX_PENDING_OPS = 100;

type Op = (transport: AnalyticsTransport) => void;

export function toIsoCreationTime(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : 'unknown';
}

export type AnalyticsClient = ReturnType<typeof createAnalyticsClient>;

export function createAnalyticsClient(deps: AnalyticsClientDeps) {
  const log = deps.logger ?? silentAnalyticsLogger;
  const enabled = deps.config.enabled;

  let transport: AnalyticsTransport | null = null;
  let starting: Promise<void> | null = null;
  let failed = false;
  let pending: Op[] = [];

  /** Latest Firebase session known to the client; undefined until first report. */
  let auth: AuthSnapshot | null | undefined;
  let identifiedUid: string | null = null;
  /** Ids this process identified each UID with (UID itself or its nag1_ id). */
  const distinctIdsByUid = new Map<string, Set<string>>();
  let afterAuthReady: (() => void)[] = [];
  /** Account generation closed by deletion. A recreated account is not it. */
  let closedAccount: { uid: string; creationTime: string | null } | null = null;
  /** Deletion requested and not resolved: this account's new events are dropped. */
  let heldUid: string | null = null;

  function isClosed(session: AuthSnapshot): boolean {
    return (
      closedAccount?.uid === session.uid &&
      closedAccount.creationTime === session.creationTime
    );
  }

  /** Identity operations pass the cap: losing one could mix two accounts. */
  function run(op: Op, essential = false): void {
    if (!enabled || failed) return;
    if (!transport) {
      if (!essential && pending.length >= MAX_PENDING_OPS) {
        log('queue_full');
        return;
      }
      pending.push(op);
      return;
    }
    try {
      op(transport);
    } catch (error) {
      log('sdk_call_failed', { name: errorName(error) });
    }
  }

  function start(): Promise<void> {
    if (!enabled || failed) return Promise.resolve();
    if (starting) return starting;
    starting = (async () => {
      try {
        const created = await deps.createTransport();
        if (!created) {
          failed = true;
          pending = [];
          return;
        }
        transport = created;
        const queued = pending;
        pending = [];
        queued.forEach((op) => run(op));
      } catch (error) {
        failed = true;
        pending = [];
        log('sdk_start_failed', { name: errorName(error) });
      }
    })();
    return starting;
  }

  function safeBinary(): AppBinaryInfo {
    try {
      return deps.binary();
    } catch {
      return { appVersion: null, appBuild: null };
    }
  }

  function superProperties(): AnalyticsProps {
    const binary = safeBinary();
    return sanitizeProperties(SUPER_PROPERTY_RULES, {
      platform: 'iOS',
      app_version: binary.appVersion,
      app_build: binary.appBuild,
      environment: deps.config.environment,
      distribution_channel: deps.config.distributionChannel,
      // Never false: a build outside Beta cannot clear this on a person.
      is_test_user: deps.config.isTestInstall ? true : undefined,
      tracking_plan_version: TRACKING_PLAN_VERSION,
    }).values;
  }

  function resolveDistinctId(session: AuthSnapshot): string | null {
    try {
      const resolve =
        deps.distinctIdFor ??
        ((s: AuthSnapshot) =>
          deviceAnalyticsDistinctId(
            s.uid,
            s.creationTime,
            deps.config.generationIdSinceMs ?? null,
          ));
      const id = resolve(session);
      return typeof id === 'string' && id.length > 0 ? id : null;
    } catch {
      return null;
    }
  }

  function rememberDistinctId(uid: string, id: string): void {
    const ids = distinctIdsByUid.get(uid) ?? new Set<string>();
    ids.add(id);
    distinctIdsByUid.set(uid, ids);
  }

  /** Every id this UID's events may be queued under on this device. */
  function distinctIdsFor(uid: string, session?: AuthSnapshot | null): string[] {
    const ids = new Set<string>([uid, ...(distinctIdsByUid.get(uid) ?? [])]);
    if (session?.uid === uid) {
      const derived = resolveDistinctId(session);
      if (derived) ids.add(derived);
    }
    return [...ids];
  }

  /**
   * Aligns SDK identity with the session. Reset always precedes A→B. An account
   * that cannot be identified yet stays anonymous (never under its UID) and is
   * retried on the next report.
   */
  function applyIdentity(next: AuthSnapshot | null): void {
    const nextUid = next?.uid ?? null;
    if (nextUid === identifiedUid && nextUid !== null) return;
    const nextId = next ? resolveDistinctId(next) : null;
    run((t) => {
      const persisted = t.getIdentifiedId();
      if (persisted && persisted !== nextId) t.reset();
    }, true);
    if (next && !nextId) {
      identifiedUid = null;
      log('identity_pending');
      return;
    }
    identifiedUid = nextUid;
    if (!next || !nextId) return;
    rememberDistinctId(next.uid, nextId);
    const createdAt = toIsoCreationTime(next.creationTime);
    const { values: set } = sanitizeProperties(PERSON_PROPERTY_RULES, {
      ...superProperties(),
      user_id: next.uid,
      email: next.email?.trim() || undefined,
    });
    const { values: setOnce } = sanitizeProperties(PERSON_PROPERTY_RULES, {
      account_created_at: createdAt ?? undefined,
    });
    run((t) => t.identify(nextId, set, setOnce), true);
  }

  /** Adopts the live session when it already owns this uid. */
  function sessionOwnedBy(uid: string): boolean {
    if (auth && auth.uid === uid) return true;
    const live = deps.readSession?.() ?? null;
    if (live?.uid !== uid || isClosed(live)) return false;
    reportAuthState(live);
    return true;
  }

  function guarded(fn: () => void): void {
    try {
      fn();
    } catch (error) {
      log('callback_failed', { name: errorName(error) });
    }
  }

  function reportAuthState(reported: AuthSnapshot | null): void {
    if (!enabled) return;
    // A deleted account can stay in Firebase until sign-out finishes.
    const next = reported && isClosed(reported) ? null : reported;
    auth = next;
    applyIdentity(next);
    const ready = afterAuthReady;
    afterAuthReady = [];
    ready.forEach((fn) => guarded(fn));
  }

  function runWhenAuthKnown(fn: () => void): void {
    if (!enabled) return;
    if (auth !== undefined) {
      guarded(fn);
      return;
    }
    afterAuthReady.push(fn);
  }

  function buildEvent(
    event: AnalyticsEventName,
    properties: Readonly<Record<string, unknown>> | undefined,
  ): AnalyticsProps {
    const rules: PropertyRuleMap = EVENT_RULES[event];
    const { values, droppedNames } = sanitizeProperties(rules, properties);
    if (droppedNames.length > 0) {
      log('properties_dropped', { event, names: droppedNames.join(',') });
    }
    return { ...values, ...superProperties() };
  }

  /** Device-level event, may be anonymous. Waits until the session is known. */
  function captureDeviceEvent(
    event: AnalyticsEventName,
    properties?: Readonly<Record<string, unknown>>,
  ): void {
    runWhenAuthKnown(() => {
      if (heldUid && auth?.uid === heldUid) {
        log('event_dropped_account_deleting', { event });
        return;
      }
      const payload = buildEvent(event, properties);
      run((t) => t.capture(event, payload));
    });
  }

  /** Account event: dropped unless `uid` still owns the session. */
  function captureForUser(
    uid: string,
    event: AnalyticsEventName,
    properties?: Readonly<Record<string, unknown>>,
  ): boolean {
    if (!enabled || !uid) return false;
    if (uid === heldUid) {
      log('event_dropped_account_deleting', { event });
      return false;
    }
    if (!sessionOwnedBy(uid) || !auth) {
      log('event_dropped_session_mismatch', { event });
      return false;
    }
    applyIdentity(auth);
    if (identifiedUid !== uid) {
      log('event_dropped_identity_pending', { event });
      return false;
    }
    const payload = buildEvent(event, properties);
    run((t) => t.capture(event, payload));
    return true;
  }

  /** Account event for whoever owns the session once it is known. */
  function captureForCurrentUser(
    event: AnalyticsEventName,
    properties?: Readonly<Record<string, unknown>>,
  ): void {
    runWhenAuthKnown(() => {
      if (auth) captureForUser(auth.uid, event, properties);
    });
  }

  function setPersonProperties(
    uid: string,
    set: Readonly<Record<string, unknown>>,
    setOnce: Readonly<Record<string, unknown>> = {},
    unset: readonly string[] = [],
  ): boolean {
    if (!enabled || !uid) return false;
    if (uid === heldUid) return false;
    if (!sessionOwnedBy(uid) || !auth) {
      log('person_update_dropped_session_mismatch');
      return false;
    }
    applyIdentity(auth);
    if (identifiedUid !== uid) {
      log('person_update_dropped_identity_pending');
      return false;
    }
    const cleanSet = sanitizeProperties(PERSON_PROPERTY_RULES, set);
    const cleanOnce = sanitizeProperties(PERSON_PROPERTY_RULES, setOnce);
    const dropped = [...cleanSet.droppedNames, ...cleanOnce.droppedNames];
    if (dropped.length > 0) {
      log('person_properties_dropped', { names: dropped.join(',') });
    }
    const unsetNames = unset.filter((name) =>
      Object.prototype.hasOwnProperty.call(PERSON_PROPERTY_RULES, name),
    );
    if (
      Object.keys(cleanSet.values).length > 0 ||
      Object.keys(cleanOnce.values).length > 0
    ) {
      run((t) => t.setPersonProperties(cleanSet.values, cleanOnce.values));
    }
    if (unsetNames.length > 0) {
      run((t) => t.unsetPersonProperties(unsetNames));
    }
    return true;
  }

  /**
   * The account was deleted: reset does not empty the SDK queue, so its events
   * are removed explicitly and nothing more is accepted for this generation.
   * Events of other identities stay queued. Never throws into the deletion flow.
   */
  function discardAccount(uid: string): void {
    if (!enabled || !uid) return;
    const live = auth?.uid === uid ? auth : (deps.readSession?.() ?? null);
    const session = live?.uid === uid ? live : null;
    // Later closure phases repeat the uid, often after the session is gone.
    if (closedAccount?.uid === uid && (!session || isClosed(session))) return;
    const ids = distinctIdsFor(uid, session);
    closedAccount = { uid, creationTime: session?.creationTime ?? null };
    if (auth?.uid === uid) auth = null;
    if (identifiedUid === uid) identifiedUid = null;
    if (heldUid === uid) heldUid = null;
    run((t) => {
      for (const id of ids) {
        void Promise.resolve(t.discardQueuedEventsFor(id)).catch((error: unknown) => {
          log('discard_failed', { name: errorName(error) });
        });
      }
      const identified = t.getIdentifiedId();
      if (identified && ids.includes(identified)) t.reset();
    }, true);
  }

  /**
   * Deletion requested (or left uncertain): new events of this account are
   * dropped, queued ones wait for the outcome. null releases it: cancelled.
   */
  function holdAccount(uid: string | null): void {
    if (!enabled) return;
    heldUid = uid || null;
  }

  /**
   * The closure ended: a later sign-in, or a sign-out of a deletion that was never
   * confirmed. Returns whether an account was closed until now.
   */
  function clearClosedAccount(): boolean {
    const wasClosed = closedAccount !== null;
    closedAccount = null;
    return wasClosed;
  }

  return {
    isEnabled: () => enabled && !failed,
    discardAccount,
    clearClosedAccount,
    holdAccount,
    /** UID plus every derived id seen for it, for durable deletion records. */
    distinctIdsFor: (uid: string): string[] =>
      distinctIdsFor(uid, auth?.uid === uid ? auth : (deps.readSession?.() ?? null)),
    start,
    reportAuthState,
    runWhenAuthKnown,
    captureDeviceEvent,
    captureForUser,
    captureForCurrentUser,
    setPersonProperties,
    currentAuth: (): AuthSnapshot | null => auth ?? null,
    /** Session snapshot for this uid, adopting the live session if needed. */
    sessionFor: (uid: string): AuthSnapshot | null =>
      enabled && sessionOwnedBy(uid) ? (auth ?? null) : null,
    /** Null until the SDK runs: sessions are the SDK's, never invented here. */
    getSessionId(): string | null {
      if (!transport) return null;
      try {
        return transport.getSessionId();
      } catch {
        return null;
      }
    },
    flush(): void {
      run((t) => {
        void Promise.resolve(t.flush()).catch((error: unknown) => {
          log('flush_failed', { name: errorName(error) });
        });
      });
    },
  };
}

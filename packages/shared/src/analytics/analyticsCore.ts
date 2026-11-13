/**
 * Analytics session: identity, ordering and failure isolation.
 *
 * Every operation runs on one serial chain and reads the current Firebase user
 * when it executes, so identify always precedes the events of that account and
 * a late callback cannot write onto a different one. Failures stop here: no
 * method throws or returns a rejected promise to the caller.
 */
import {
  computeCompletionTimeMin,
  type AnalyticsEventName,
  type AnalyticsProperties,
} from './analyticsContract.ts';

export type AnalyticsTransport = {
  /** Identified id persisted by a previous run; null when anonymous. */
  getIdentifiedDistinctId(): string | null;
  getSessionId(): string | undefined;
  identify(uid: string, properties: AnalyticsProperties): void | Promise<void>;
  setPersonProperties(
    properties: AnalyticsProperties,
    propertiesOnce?: AnalyticsProperties,
  ): void | Promise<void>;
  unsetPersonProperties(names: string[]): void | Promise<void>;
  reset(): void | Promise<void>;
  register(properties: AnalyticsProperties): void | Promise<void>;
  capture(
    event: AnalyticsEventName,
    properties?: AnalyticsProperties,
  ): void | Promise<void>;
  /** Removes queued events of these distinct ids; returns how many. */
  purgeQueued?(distinctIds: string[]): Promise<number>;
};

export type AnalyticsAuthUser = {
  uid: string;
  email?: string | null;
  /** Firebase Auth `metadata.creationTime`, as reported; the only source for G. */
  creationTime?: unknown;
  /** Firebase Auth `metadata.lastSignInTime`, as reported. */
  lastSignInTime?: unknown;
};

/** What the deletion guard says about a signed-in account. */
export type AccountGate = { blocked: true } | { blocked: false; purge: string[] };

export type BuiltAnalyticsEvent = {
  event: AnalyticsEventName;
  properties?: AnalyticsProperties;
  /** Dedupes for this account during the life of the process. */
  onceKey?: string;
};

export type AnalyticsEventContext = { sessionId: string | undefined };

export function createAnalyticsSession(deps: {
  loadTransport: () => Promise<AnalyticsTransport>;
  getAuthUser: () => AnalyticsAuthUser | null;
  /** May throw: RNFirebase's metadata getter throws when the date is missing. */
  readCreationTime: () => unknown;
  buildBaseProperties: (user: AnalyticsAuthUser) => AnalyticsProperties;
  buildProfileProperties: (
    user: AnalyticsAuthUser,
    doc: unknown,
  ) => AnalyticsProperties | null;
  /** Stored values that `properties` shows can no longer be right. */
  profileKeysToUnset?: (
    user: AnalyticsAuthUser,
    doc: unknown,
    properties: AnalyticsProperties,
  ) => string[] | Promise<string[]>;
  /** The update of this document was handed to the SDK. */
  onProfileSynced?: (user: AnalyticsAuthUser, doc: unknown) => void | Promise<void>;
  superProperties: AnalyticsProperties;
  now: () => number;
  /**
   * Set_once on each account this build signs in, once per process. It covers an
   * identity restored from an earlier run, which never goes through identify.
   */
  accountClassification?: AnalyticsProperties;
  /**
   * The PostHog distinct_id of the account (proposal G), or null when it must not
   * be identified yet. Defaults to the UID.
   */
  resolveDistinctId?: (user: AnalyticsAuthUser) => Promise<string | null> | string | null;
  /** Account deletion guard. Blocked: no identify, no account event, no person update. */
  gateAccount?: (user: AnalyticsAuthUser) => Promise<AccountGate> | AccountGate;
}) {
  let transportPromise: Promise<AnalyticsTransport | null> | null = null;
  let chain: Promise<void> = Promise.resolve();
  /** Distinct id the SDK is identified with (persisted by the SDK across runs). */
  let identifiedId: string | null = null;
  /** UID that `identifiedId` belongs to, once confirmed in this process. */
  let identifiedUid: string | null = null;
  /** Derived once per sign-in (contract §3); cleared on reset. */
  const derivedIds = new Map<string, string>();
  let classifiedId: string | null = null;
  let lastPersonFingerprint: string | null = null;
  const lastDirectPersonValues = new Map<string, string>();
  const emittedOnce = new Set<string>();

  function loadTransport(): Promise<AnalyticsTransport | null> {
    transportPromise ??= (async () => {
      try {
        const transport = await deps.loadTransport();
        identifiedId = transport.getIdentifiedDistinctId();
        try {
          await transport.register(deps.superProperties);
        } catch {
          // Events can still be sent without the technical properties.
        }
        return transport;
      } catch {
        return null;
      }
    })();
    return transportPromise;
  }

  function enqueue(
    operation: (transport: AnalyticsTransport) => Promise<void> | void,
  ): void {
    chain = chain.then(async () => {
      try {
        const transport = await loadTransport();
        if (transport) await operation(transport);
      } catch {
        // Analytics must never interrupt the product flow.
      }
    });
  }

  async function resetIdentity(transport: AnalyticsTransport) {
    await transport.reset();
    identifiedId = null;
    identifiedUid = null;
    derivedIds.clear();
    classifiedId = null;
    lastPersonFingerprint = null;
    lastDirectPersonValues.clear();
    // reset() clears registered properties.
    await transport.register(deps.superProperties);
  }

  async function distinctIdFor(user: AnalyticsAuthUser): Promise<string | null> {
    const known = derivedIds.get(user.uid);
    if (known !== undefined) return known;
    let id: string | null;
    try {
      id = deps.resolveDistinctId ? await deps.resolveDistinctId(user) : user.uid;
    } catch {
      id = null;
    }
    if (typeof id !== 'string' || !id) return null;
    derivedIds.set(user.uid, id);
    return id;
  }

  /**
   * - identified: the SDK is identified as this account.
   * - pending:    (G) its id cannot be derived yet. The SDK stays anonymous:
   *               account events and person updates are dropped, device events
   *               go out anonymously. Never under the UID or another account.
   * - blocked:    the account is held or deleted. Nothing of it is sent.
   */
  async function ensureIdentity(
    transport: AnalyticsTransport,
    user: AnalyticsAuthUser,
  ): Promise<'identified' | 'pending' | 'blocked'> {
    let gate: AccountGate = { blocked: false, purge: [] };
    try {
      gate = (await deps.gateAccount?.(user)) ?? gate;
    } catch {
      gate = { blocked: true };
    }
    if (gate.blocked) {
      if (identifiedId !== null && identifiedUid !== user.uid) await resetIdentity(transport);
      return 'blocked';
    }
    // A record this session ended: older events of that account go first.
    if (gate.purge.length > 0) await transport.purgeQueued?.(gate.purge);
    const id = await distinctIdFor(user);
    if (id === null) {
      if (identifiedId !== null) await resetIdentity(transport);
      return 'pending';
    }
    if (identifiedId !== id) {
      if (identifiedId !== null) await resetIdentity(transport);
      derivedIds.set(user.uid, id);
      await transport.identify(id, deps.buildBaseProperties(user));
      identifiedId = id;
    }
    identifiedUid = user.uid;
    if (deps.accountClassification && classifiedId !== user.uid) {
      await transport.setPersonProperties({}, deps.accountClassification);
      classifiedId = user.uid;
    }
    return 'identified';
  }

  /** Signed out counts as anonymous, as before. */
  async function alignWithAuth(
    transport: AnalyticsTransport,
  ): Promise<'identified' | 'pending' | 'blocked' | 'anonymous'> {
    const user = deps.getAuthUser();
    if (user) return ensureIdentity(transport, user);
    if (identifiedId !== null) await resetIdentity(transport);
    return 'anonymous';
  }

  /** The user the operation was requested for, if still the signed-in one. */
  function currentUserMatching(uid: string): AnalyticsAuthUser | null {
    const user = deps.getAuthUser();
    return user?.uid === uid ? user : null;
  }

  function readSessionId(transport: AnalyticsTransport): string | undefined {
    try {
      return transport.getSessionId();
    } catch {
      return undefined;
    }
  }

  async function send(
    transport: AnalyticsTransport,
    uid: string,
    built: BuiltAnalyticsEvent,
  ) {
    if (built.onceKey !== undefined) {
      const key = `${uid}:${built.onceKey}`;
      if (emittedOnce.has(key)) return;
      emittedOnce.add(key);
    }
    await transport.capture(built.event, built.properties);
  }

  return {
    noteAuthChange(): void {
      enqueue(alignWithAuth);
    },

    /**
     * Event of the requesting account; dropped if it is no longer signed in.
     * `build` runs on the chain with the SDK session of that moment and may
     * return null to skip.
     */
    trackForUser(
      uid: string,
      build: (context: AnalyticsEventContext) => BuiltAnalyticsEvent | null,
    ): void {
      enqueue(async (transport) => {
        const user = currentUserMatching(uid);
        if (!user) return;
        if ((await ensureIdentity(transport, user)) !== 'identified') return;
        const built = build({ sessionId: readSessionId(transport) });
        if (built) await send(transport, uid, built);
      });
    },

    /** Event of whoever is signed in now, or anonymous when nobody is. */
    trackForCurrent(
      build: (context: AnalyticsEventContext) => BuiltAnalyticsEvent | null,
    ): void {
      enqueue(async (transport) => {
        if ((await alignWithAuth(transport)) === 'blocked') return;
        const built = build({ sessionId: readSessionId(transport) });
        if (built) await send(transport, deps.getAuthUser()?.uid ?? '', built);
      });
    },

    trackAppOpened(): void {
      enqueue(async (transport) => {
        if ((await alignWithAuth(transport)) === 'blocked') return;
        const sessionId = readSessionId(transport);
        await transport.capture(
          'app_opened',
          sessionId ? { session_id: sessionId } : {},
        );
      });
    },

    /**
     * Call only when the account creation is confirmed. Acquisition evidence is
     * resolved in order, so the event carries it and the person gets it once.
     */
    trackSignupCompleted(
      uid: string,
      resolveAttribution?: () => Promise<AnalyticsProperties | null>,
      /** Dedupe within the account; a recreated account with the same UID has another. */
      onceKey = 'signup_completed',
    ): void {
      enqueue(async (transport) => {
        const user = currentUserMatching(uid);
        if (!user) return;
        if ((await ensureIdentity(transport, user)) !== 'identified') return;
        if (emittedOnce.has(`${uid}:${onceKey}`)) return;
        let attribution: AnalyticsProperties | null = null;
        try {
          attribution = (await resolveAttribution?.()) ?? null;
        } catch {
          attribution = null;
        }
        await send(transport, uid, {
          event: 'signup_completed',
          onceKey,
          properties: attribution ?? {},
        });
        if (attribution) await transport.setPersonProperties({}, attribution);
      });
    },

    /** Call only after the final profile state was saved. */
    trackProfileCompleted(uid: string): void {
      const completedAtMs = deps.now();
      enqueue(async (transport) => {
        const user = currentUserMatching(uid);
        if (!user) return;
        if ((await ensureIdentity(transport, user)) !== 'identified') return;
        let creationTime: unknown;
        try {
          creationTime = deps.readCreationTime();
        } catch {
          creationTime = undefined;
        }
        const minutes = computeCompletionTimeMin(creationTime, completedAtMs);
        await send(transport, uid, {
          event: 'profile_completed',
          onceKey: 'profile_completed',
          properties: minutes === undefined ? {} : { completion_time_min: minutes },
        });
      });
    },

    syncPersonProfile(uid: string, doc: unknown): void {
      enqueue(async (transport) => {
        const user = currentUserMatching(uid);
        if (!user) return;
        if ((await ensureIdentity(transport, user)) !== 'identified') return;
        const properties = deps.buildProfileProperties(user, doc);
        if (!properties) return;
        const unset = (await deps.profileKeysToUnset?.(user, doc, properties)) ?? [];
        const fingerprint = JSON.stringify([
          Object.entries(properties).sort(([a], [b]) => a.localeCompare(b)),
          unset,
        ]);
        if (fingerprint === lastPersonFingerprint) return;
        await transport.setPersonProperties(properties);
        if (unset.length > 0) await transport.unsetPersonProperties(unset);
        lastPersonFingerprint = fingerprint;
        await deps.onProfileSynced?.(user, doc);
      });
    },

    /**
     * Writes only the keys whose value changed since this person was last
     * written. `once` goes as set_once: PostHog keeps the first value received.
     */
    setPersonForUser(
      uid: string,
      properties: AnalyticsProperties,
      once?: AnalyticsProperties,
    ): void {
      enqueue(async (transport) => {
        const user = currentUserMatching(uid);
        if (!user) return;
        if ((await ensureIdentity(transport, user)) !== 'identified') return;
        const changed: AnalyticsProperties = {};
        const serialized: Array<[string, string]> = [];
        for (const [key, value] of Object.entries(properties)) {
          const text = JSON.stringify(value);
          if (lastDirectPersonValues.get(key) === text) continue;
          changed[key] = value;
          serialized.push([key, text]);
        }
        const hasOnce = !!once && Object.keys(once).length > 0;
        if (serialized.length === 0 && !hasOnce) return;
        await transport.setPersonProperties(changed, hasOnce ? once : undefined);
        for (const [key, text] of serialized) {
          lastDirectPersonValues.set(key, text);
        }
      });
    },

    /**
     * Every distinct id this account may have used: the UID and its own id (G).
     * Runs off the chain so a deletion never waits for queued analytics work.
     */
    async accountIds(user: AnalyticsAuthUser): Promise<string[]> {
      const ids = new Set([user.uid]);
      if (identifiedUid === user.uid && identifiedId) ids.add(identifiedId);
      const derived = await distinctIdFor(user);
      if (derived) ids.add(derived);
      return [...ids];
    },

    /**
     * After a confirmed deletion: queued events of these ids are removed, then the
     * SDK is reset if it was this account (contract: purge, then reset()).
     */
    forgetAccount(uid: string, distinctIds: string[]): void {
      enqueue(async (transport) => {
        await transport.purgeQueued?.(distinctIds);
        if (
          identifiedUid === uid ||
          (identifiedId !== null && distinctIds.includes(identifiedId))
        ) {
          await resetIdentity(transport);
        }
      });
    },

    /** Resolves when queued work has finished; never rejects. Used by tests. */
    settled(): Promise<void> {
      return chain;
    },
  };
}

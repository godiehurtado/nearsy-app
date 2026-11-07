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
};

export type AnalyticsAuthUser = { uid: string; email?: string | null };

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
}) {
  let transportPromise: Promise<AnalyticsTransport | null> | null = null;
  let chain: Promise<void> = Promise.resolve();
  let identifiedId: string | null = null;
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
    classifiedId = null;
    lastPersonFingerprint = null;
    lastDirectPersonValues.clear();
    // reset() clears registered properties.
    await transport.register(deps.superProperties);
  }

  async function ensureIdentity(
    transport: AnalyticsTransport,
    user: AnalyticsAuthUser,
  ): Promise<void> {
    if (identifiedId !== user.uid) {
      if (identifiedId !== null) await resetIdentity(transport);
      await transport.identify(user.uid, deps.buildBaseProperties(user));
      identifiedId = user.uid;
    }
    if (deps.accountClassification && classifiedId !== user.uid) {
      await transport.setPersonProperties({}, deps.accountClassification);
      classifiedId = user.uid;
    }
  }

  async function alignWithAuth(transport: AnalyticsTransport): Promise<void> {
    const user = deps.getAuthUser();
    if (user) {
      await ensureIdentity(transport, user);
    } else if (identifiedId !== null) {
      await resetIdentity(transport);
    }
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
        await ensureIdentity(transport, user);
        const built = build({ sessionId: readSessionId(transport) });
        if (built) await send(transport, uid, built);
      });
    },

    /** Event of whoever is signed in now, or anonymous when nobody is. */
    trackForCurrent(
      build: (context: AnalyticsEventContext) => BuiltAnalyticsEvent | null,
    ): void {
      enqueue(async (transport) => {
        await alignWithAuth(transport);
        const built = build({ sessionId: readSessionId(transport) });
        if (built) await send(transport, deps.getAuthUser()?.uid ?? '', built);
      });
    },

    trackAppOpened(): void {
      enqueue(async (transport) => {
        await alignWithAuth(transport);
        const sessionId = readSessionId(transport);
        await transport.capture(
          'app_opened',
          sessionId ? { session_id: sessionId } : {},
        );
      });
    },

    /** Call only when the account creation is confirmed. */
    trackSignupCompleted(uid: string): void {
      enqueue(async (transport) => {
        const user = currentUserMatching(uid);
        if (!user) return;
        await ensureIdentity(transport, user);
        await send(transport, uid, {
          event: 'signup_completed',
          onceKey: 'signup_completed',
        });
      });
    },

    /** Call only after the final profile state was saved. */
    trackProfileCompleted(uid: string): void {
      const completedAtMs = deps.now();
      enqueue(async (transport) => {
        const user = currentUserMatching(uid);
        if (!user) return;
        await ensureIdentity(transport, user);
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
        await ensureIdentity(transport, user);
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
        await ensureIdentity(transport, user);
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

    /** Resolves when queued work has finished; never rejects. Used by tests. */
    settled(): Promise<void> {
      return chain;
    },
  };
}

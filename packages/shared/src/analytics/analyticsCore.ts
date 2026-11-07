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
  setPersonProperties(properties: AnalyticsProperties): void | Promise<void>;
  reset(): void | Promise<void>;
  register(properties: AnalyticsProperties): void | Promise<void>;
  capture(
    event: AnalyticsEventName,
    properties?: AnalyticsProperties,
  ): void | Promise<void>;
};

export type AnalyticsAuthUser = { uid: string; email?: string | null };

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
  superProperties: AnalyticsProperties;
  now: () => number;
}) {
  let transportPromise: Promise<AnalyticsTransport | null> | null = null;
  let chain: Promise<void> = Promise.resolve();
  let identifiedUid: string | null = null;
  let lastPersonFingerprint: string | null = null;
  const emittedOnce = new Set<string>();

  function loadTransport(): Promise<AnalyticsTransport | null> {
    transportPromise ??= (async () => {
      try {
        const transport = await deps.loadTransport();
        identifiedUid = transport.getIdentifiedDistinctId();
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
    identifiedUid = null;
    lastPersonFingerprint = null;
    // reset() clears registered properties.
    await transport.register(deps.superProperties);
  }

  async function ensureIdentity(
    transport: AnalyticsTransport,
    user: AnalyticsAuthUser,
  ) {
    if (identifiedUid === user.uid) return;
    if (identifiedUid !== null) await resetIdentity(transport);
    await transport.identify(user.uid, deps.buildBaseProperties(user));
    identifiedUid = user.uid;
  }

  async function alignWithAuth(transport: AnalyticsTransport) {
    const user = deps.getAuthUser();
    if (user) await ensureIdentity(transport, user);
    else if (identifiedUid !== null) await resetIdentity(transport);
  }

  /** The user the operation was requested for, if still the signed-in one. */
  function currentUserMatching(uid: string): AnalyticsAuthUser | null {
    const user = deps.getAuthUser();
    return user?.uid === uid ? user : null;
  }

  async function captureOnce(
    transport: AnalyticsTransport,
    event: AnalyticsEventName,
    uid: string,
    properties?: AnalyticsProperties,
  ) {
    const key = `${event}:${uid}`;
    if (emittedOnce.has(key)) return;
    emittedOnce.add(key);
    await transport.capture(event, properties);
  }

  return {
    noteAuthChange(): void {
      enqueue(alignWithAuth);
    },

    trackAppOpened(): void {
      enqueue(async (transport) => {
        await alignWithAuth(transport);
        let sessionId: string | undefined;
        try {
          sessionId = transport.getSessionId();
        } catch {
          sessionId = undefined;
        }
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
        await captureOnce(transport, 'signup_completed', uid);
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
        await captureOnce(
          transport,
          'profile_completed',
          uid,
          minutes === undefined ? {} : { completion_time_min: minutes },
        );
      });
    },

    syncPersonProfile(uid: string, doc: unknown): void {
      enqueue(async (transport) => {
        const user = currentUserMatching(uid);
        if (!user) return;
        await ensureIdentity(transport, user);
        const properties = deps.buildProfileProperties(user, doc);
        if (!properties) return;
        const fingerprint = JSON.stringify(
          Object.entries(properties).sort(([a], [b]) => a.localeCompare(b)),
        );
        if (fingerprint === lastPersonFingerprint) return;
        await transport.setPersonProperties(properties);
        lastPersonFingerprint = fingerprint;
      });
    },

    /** Resolves when queued work has finished; never rejects. Used by tests. */
    settled(): Promise<void> {
      return chain;
    },
  };
}

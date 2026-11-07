/**
 * Handles a tap on an alert push, including a cold start.
 *
 * The same tap can arrive twice, from the initial response and from the
 * listener, so it is claimed by id. It waits until the navigator can reach the
 * Home tab, which also covers a signed-out or still-hydrating app.
 */
export const PUSH_OPEN_MAX_WAIT_MS = 5 * 60_000;

const ALERT_ID = /^[A-Za-z0-9_-]{1,64}$/;

export type PushOpen = {
  responseId: string;
  actorUid: string | null;
  alertId: string | undefined;
};

/** `alertId` is optional and never derived from anything else. */
export function parsePushResponse(response: unknown): PushOpen | null {
  const request = (
    response as {
      notification?: {
        date?: unknown;
        request?: { identifier?: unknown; content?: { data?: unknown } };
      };
    } | null
  )?.notification;
  const data = (request?.request?.content?.data ?? {}) as Record<string, unknown>;
  const actorUid =
    typeof data.actorUid === 'string' && data.actorUid.trim()
      ? data.actorUid.trim()
      : null;
  const alertId =
    typeof data.alertId === 'string' && ALERT_ID.test(data.alertId)
      ? data.alertId
      : undefined;
  if (!actorUid && !alertId) return null;
  const identifier = request?.request?.identifier;
  const responseId =
    typeof identifier === 'string' && identifier
      ? identifier
      : `${String(request?.date)}:${actorUid ?? alertId}`;
  return { responseId, actorUid, alertId };
}

/** True when a route named `name` exists anywhere in the navigation state. */
export function isRouteReachable(state: unknown, name: string): boolean {
  const node = state as {
    routeNames?: unknown;
    routes?: Array<{ name?: unknown; state?: unknown }>;
  } | null | undefined;
  if (!node) return false;
  if (Array.isArray(node.routeNames) && node.routeNames.includes(name)) return true;
  return (node.routes ?? []).some(
    (route) => route.name === name || isRouteReachable(route.state, name),
  );
}

export function createPushOpenCoordinator(deps: {
  now: () => number;
  canNavigate: () => boolean;
  openProfile: (actorUid: string) => void;
  emitOpened: (alertId: string | undefined) => void;
  /** Stored id of the last handled tap, to survive a process restart. */
  readLastHandledId: () => Promise<string | null>;
  writeLastHandledId: (id: string) => Promise<void>;
}) {
  const claimed = new Set<string>();
  let pending: (PushOpen & { receivedAt: number }) | null = null;

  function claim(open: PushOpen): void {
    if (claimed.has(open.responseId)) return;
    claimed.add(open.responseId);
    pending = { ...open, receivedAt: deps.now() };
    deps.writeLastHandledId(open.responseId).catch(() => {});
    flush();
  }

  function flush(): void {
    if (!pending) return;
    if (deps.now() - pending.receivedAt > PUSH_OPEN_MAX_WAIT_MS) {
      pending = null;
      return;
    }
    if (!deps.canNavigate()) return;
    const open = pending;
    pending = null;
    try {
      deps.emitOpened(open.alertId);
    } catch {
      // Analytics must never block opening the profile.
    }
    if (open.actorUid) deps.openProfile(open.actorUid);
  }

  return {
    /** A tap reported by the listener while the process runs. */
    handleResponse(response: unknown): void {
      const open = parsePushResponse(response);
      if (open) claim(open);
    },
    /** The response that launched the app; ignored if a previous run handled it. */
    async handleInitialResponse(response: unknown): Promise<void> {
      const open = parsePushResponse(response);
      if (!open || claimed.has(open.responseId)) return;
      let lastHandled: string | null = null;
      try {
        lastHandled = await deps.readLastHandledId();
      } catch {
        lastHandled = null;
      }
      if (lastHandled === open.responseId) return;
      claim(open);
    },
    /** Call whenever navigation becomes ready or changes. */
    flush,
    hasPending: () => pending !== null,
  };
}

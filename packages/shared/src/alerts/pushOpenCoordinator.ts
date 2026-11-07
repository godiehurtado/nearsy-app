/**
 * One path for notification taps, warm or cold. The listener and the launch
 * response can report the same tap, so each notification is processed once. If
 * the app is not ready to show a profile yet, the destination waits briefly.
 *
 * Pure module: navigation and analytics arrive as ports.
 */
import { parseEncounterNotifyPayload } from './encounterNotifyPayload';

export const PUSH_NAVIGATION_PENDING_TTL_MS = 30_000;

export type PushResponseLike = {
  notification?: {
    request?: {
      identifier?: unknown;
      content?: { data?: unknown };
    };
    date?: unknown;
  };
};

export type PushOpenTarget = {
  actorUid: string | null;
  /** Only from the payload. Old payloads have none and none is made up. */
  alertId?: string;
  motive?: string;
};

export function parsePushOpenTarget(data: unknown): PushOpenTarget {
  const row =
    data && typeof data === 'object' && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};
  const parsed = parseEncounterNotifyPayload(row);
  const rawActor =
    parsed?.actorUid ??
    (typeof row.actorUid === 'string' ? row.actorUid : null);
  const alertId =
    typeof row.alertId === 'string' && row.alertId.trim()
      ? row.alertId.trim()
      : undefined;
  return {
    actorUid: rawActor,
    ...(alertId ? { alertId } : {}),
    ...(parsed?.motive ? { motive: parsed.motive } : {}),
  };
}

export type PushOpenCoordinatorDeps = {
  canNavigate: () => boolean;
  navigateToProfile: (uid: string) => void;
  onAlertOpened: (target: PushOpenTarget) => void;
  now: () => number;
};

export function createPushOpenCoordinator(deps: PushOpenCoordinatorDeps) {
  const processed = new Set<string>();
  let pending: { uid: string; atMs: number } | null = null;

  function flush(): void {
    if (!pending) return;
    if (deps.now() - pending.atMs > PUSH_NAVIGATION_PENDING_TTL_MS) {
      pending = null;
      return;
    }
    if (!deps.canNavigate()) return;
    const { uid } = pending;
    pending = null;
    deps.navigateToProfile(uid);
  }

  return {
    handleResponse(response: PushResponseLike | null | undefined): void {
      const request = response?.notification?.request;
      if (!request) return;
      const key =
        typeof request.identifier === 'string' && request.identifier
          ? request.identifier
          : `date:${String(response?.notification?.date)}`;
      if (processed.has(key)) return;
      processed.add(key);

      const target = parsePushOpenTarget(request.content?.data);
      if (!target.actorUid) return;
      deps.onAlertOpened(target);
      pending = { uid: target.actorUid, atMs: deps.now() };
      flush();
    },
    /** Call when navigation becomes ready or its state changes. */
    flush,
    /** A signed-out session must not inherit the destination. */
    clearPending(): void {
      pending = null;
    },
  };
}

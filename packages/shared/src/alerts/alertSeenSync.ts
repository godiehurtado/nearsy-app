/**
 * Alerts read state shared by every useNearbyAlerts instance (QA 2.1.0).
 *
 * The bell badge (RootTabs) and the Alerts screen each run their own hook, so
 * an open must reach both at once, not on the badge's next 30 s refresh.
 *
 * Read criterion (iOS; same as proposed to Android): an alert is read when its
 * detail is opened, from the inbox row or from its push. The badge counts the
 * alerts that are unread for the signed-in account only.
 *
 * Pure module apart from in-memory state; no Firestore here.
 */
import { buildAlertSeenWrite, type AlertSeenRecord } from './alertAppearance';

export type AlertOpenedEvent = {
  viewerUid: string;
  peerUid: string;
  record: AlertSeenRecord;
};

type Listener = (event: AlertOpenedEvent) => void;

const listeners = new Set<Listener>();

export function subscribeAlertOpened(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function publishAlertOpened(event: AlertOpenedEvent): void {
  for (const listener of [...listeners]) {
    try {
      listener(event);
    } catch {
      // One listener never blocks the others.
    }
  }
}

/**
 * A loaded seen map never undoes a newer local open (its write may still be in
 * flight when a refresh reads Firestore). Per peer, the newer seenAt wins.
 */
export function mergeSeenMaps(
  loaded: Record<string, AlertSeenRecord>,
  local: Record<string, AlertSeenRecord>,
): Record<string, AlertSeenRecord> {
  const out: Record<string, AlertSeenRecord> = { ...loaded };
  for (const [peer, record] of Object.entries(local)) {
    const current = out[peer];
    if (!current || record.seenAt > current.seenAt) out[peer] = record;
  }
  return out;
}

/** A push open waits this long for its alert to appear in the list. */
export const PENDING_PUSH_OPEN_TTL_MS = 10 * 60 * 1000;

/** viewerUid → peerUid → time the push was opened. */
const pendingPushOpens = new Map<string, Map<string, number>>();

/** Push opened for an alert from peerUid; resolved against the live list. */
export function notePushAlertOpened(viewerUid: string, peerUid: string, atMs: number): void {
  if (!viewerUid || !peerUid) return;
  const peers = pendingPushOpens.get(viewerUid) ?? new Map<string, number>();
  peers.set(peerUid, atMs);
  pendingPushOpens.set(viewerUid, peers);
}

/**
 * Consumes pending push opens for this viewer that match a listed alert and
 * returns their seen records (stamped with the alert's live appearanceKey).
 * Expired entries are dropped; other viewers' entries are never touched.
 */
export function takeResolvedPushOpens(
  viewerUid: string,
  items: ReadonlyArray<{ uid?: string; appearanceKey?: string }>,
  nowMs: number,
): Array<{ peerUid: string; record: AlertSeenRecord }> {
  const peers = pendingPushOpens.get(viewerUid);
  if (!peers) return [];
  const out: Array<{ peerUid: string; record: AlertSeenRecord }> = [];
  for (const [peer, atMs] of [...peers]) {
    if (nowMs - atMs > PENDING_PUSH_OPEN_TTL_MS) {
      peers.delete(peer);
      continue;
    }
    const item = items.find((row) => row.uid === peer);
    if (!item) continue;
    peers.delete(peer);
    out.push({ peerUid: peer, record: buildAlertSeenWrite(item.appearanceKey, atMs) });
  }
  if (peers.size === 0) pendingPushOpens.delete(viewerUid);
  return out;
}

/** Test helper. */
export function resetAlertSeenSyncForTests(): void {
  listeners.clear();
  pendingPushOpens.clear();
}

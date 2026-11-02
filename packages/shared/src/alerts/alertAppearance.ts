/**
 * Alerts appearance identity (Functions #40 @ 60d33ba).
 * Server appearanceKey = peerUid + ':' + appearanceSeq.
 * Do not use confirmedAt or Expo acceptedAt.
 */

export type AlertSeenRecord = {
  appearanceKey?: string;
  seenAt: number;
};

export function parseAppearanceKey(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const key = value.trim();
  return key.length > 0 ? key : undefined;
}

export function isAlertUnseen(
  liveAppearanceKey: string | undefined,
  seen: AlertSeenRecord | null | undefined,
): boolean {
  if (!seen) return true;
  if (!liveAppearanceKey) {
    return typeof seen.seenAt !== 'number' || !Number.isFinite(seen.seenAt);
  }
  return seen.appearanceKey !== liveAppearanceKey;
}

export function buildAlertSeenWrite(
  liveAppearanceKey: string | undefined,
  seenAt: number,
): AlertSeenRecord {
  return liveAppearanceKey
    ? { appearanceKey: liveAppearanceKey, seenAt }
    : { seenAt };
}

export function countUnseenAlerts(
  items: ReadonlyArray<{ appearanceKey?: string; uid?: string }>,
  seenByPeer: Record<string, AlertSeenRecord | undefined>,
): number {
  let count = 0;
  for (const item of items) {
    const peer = item.uid;
    if (!peer) continue;
    if (isAlertUnseen(item.appearanceKey, seenByPeer[peer])) count += 1;
  }
  return count;
}

/** Truncated/error/partial Nearby pages are not a leave. */
export function shouldHonorNearbyLeave(input: {
  complete?: boolean;
  truncated?: boolean;
}): boolean {
  return input.complete === true && input.truncated !== true;
}

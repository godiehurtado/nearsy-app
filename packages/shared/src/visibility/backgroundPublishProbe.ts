/**
 * Lightweight BG publish probe for Owner physical QA (BUG-DISC-05).
 * Persists last attempt outcome so silent task failures are observable
 * without relying on Metro logs alone. Not used for Discovery freshness.
 */

export const BG_PUBLISH_PROBE_KEY = 'NEARSY_BG_PUBLISH_PROBE' as const;

export type BgPublishProbeSnapshot = {
  lastAttemptAt: number;
  lastOk: boolean;
  /** publishLocationFlow kind or 'callable' / 'exception' when failed */
  lastKind: string | null;
  /** Server confirmedAt when last publish succeeded */
  lastConfirmedAt: number | null;
  okCount: number;
  failCount: number;
};

export function emptyBgPublishProbe(): BgPublishProbeSnapshot {
  return {
    lastAttemptAt: 0,
    lastOk: false,
    lastKind: null,
    lastConfirmedAt: null,
    okCount: 0,
    failCount: 0,
  };
}

export function parseBgPublishProbe(raw: string | null): BgPublishProbeSnapshot {
  if (!raw) return emptyBgPublishProbe();
  try {
    const parsed = JSON.parse(raw) as Partial<BgPublishProbeSnapshot>;
    return {
      lastAttemptAt:
        typeof parsed.lastAttemptAt === 'number' && Number.isFinite(parsed.lastAttemptAt)
          ? parsed.lastAttemptAt
          : 0,
      lastOk: parsed.lastOk === true,
      lastKind: typeof parsed.lastKind === 'string' ? parsed.lastKind : null,
      lastConfirmedAt:
        typeof parsed.lastConfirmedAt === 'number' &&
        Number.isFinite(parsed.lastConfirmedAt)
          ? parsed.lastConfirmedAt
          : null,
      okCount:
        typeof parsed.okCount === 'number' && Number.isFinite(parsed.okCount)
          ? Math.max(0, Math.floor(parsed.okCount))
          : 0,
      failCount:
        typeof parsed.failCount === 'number' && Number.isFinite(parsed.failCount)
          ? Math.max(0, Math.floor(parsed.failCount))
          : 0,
    };
  } catch {
    return emptyBgPublishProbe();
  }
}

export function applyBgPublishProbeAttempt(
  prev: BgPublishProbeSnapshot,
  input: {
    nowMs: number;
    ok: boolean;
    kind: string | null;
    confirmedAt?: number | null;
  },
): BgPublishProbeSnapshot {
  const next: BgPublishProbeSnapshot = {
    ...prev,
    lastAttemptAt: input.nowMs,
    lastOk: input.ok,
    lastKind: input.kind,
  };
  if (input.ok) {
    next.okCount = prev.okCount + 1;
    next.lastConfirmedAt =
      typeof input.confirmedAt === 'number' && Number.isFinite(input.confirmedAt)
        ? input.confirmedAt
        : prev.lastConfirmedAt;
  } else {
    next.failCount = prev.failCount + 1;
  }
  return next;
}

/** True when confirmedAt advanced during the BG window (for QA assertions). */
export function didConfirmedAtRenewDuringWindow(input: {
  confirmedAtBefore: number | null | undefined;
  confirmedAtAfter: number | null | undefined;
}): boolean {
  const before = input.confirmedAtBefore;
  const after = input.confirmedAtAfter;
  if (after == null || !Number.isFinite(after)) return false;
  if (before == null || !Number.isFinite(before)) return true;
  return after > before;
}

/**
 * Lightweight BG publish probe for Owner physical QA (BUG-DISC-05).
 * Persists accepted-publish timestamps so silent gaps vs a 5-minute TTL are measurable.
 * Evidence must never include coordinates or UID.
 */

import { LOCATION_TTL_MS } from './constants';

export const BG_PUBLISH_PROBE_KEY = 'NEARSY_BG_PUBLISH_PROBE' as const;

/** Cap ring so a long Always session cannot unbounded-grow AsyncStorage. */
export const BG_PUBLISH_PROBE_MAX_ACCEPTED = 64;

export type BgPublishProbeSnapshot = {
  lastAttemptAt: number;
  lastOk: boolean;
  /** publishLocationFlow kind or 'callable' / 'exception' when failed */
  lastKind: string | null;
  /** Server confirmedAt when last publish succeeded (epoch ms; not a coordinate). */
  lastConfirmedAt: number | null;
  okCount: number;
  failCount: number;
  /**
   * Epoch ms of accepted publishLocation successes only (oldest→newest, capped).
   * Appended exclusively when publishLocationFlow returns ok:true — prefers
   * response.confirmedAt; falls back to client attempt time if confirmedAt missing.
   * Failures / soft-fails never append here.
   */
  acceptedAts: number[];
};

export type BgPublishWindowSummary = {
  acceptedAtsInWindow: number[];
  acceptedCount: number;
  /** Max gap between consecutive accepted publishes in-window; null if <2. */
  maxInterPublishGapMs: number | null;
  /** Gap from last accepted-in-window to windowEndMs; null if none. */
  gapToWindowEndMs: number | null;
  /** max(inter gaps, gap to end); null if no accepted publishes. */
  maxGapMs: number | null;
  /** True when maxGapMs is defined and ≤ LOCATION_TTL_MS (inclusive). */
  sustainsTtl: boolean;
};

export function emptyBgPublishProbe(): BgPublishProbeSnapshot {
  return {
    lastAttemptAt: 0,
    lastOk: false,
    lastKind: null,
    lastConfirmedAt: null,
    okCount: 0,
    failCount: 0,
    acceptedAts: [],
  };
}

function sanitizeAcceptedAts(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const out: number[] = [];
  for (const v of raw) {
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
      out.push(Math.floor(v));
    }
  }
  out.sort((a, b) => a - b);
  if (out.length <= BG_PUBLISH_PROBE_MAX_ACCEPTED) return out;
  return out.slice(out.length - BG_PUBLISH_PROBE_MAX_ACCEPTED);
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
      acceptedAts: sanitizeAcceptedAts(parsed.acceptedAts),
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
    acceptedAts: [...prev.acceptedAts],
  };
  if (input.ok) {
    next.okCount = prev.okCount + 1;
    next.lastConfirmedAt =
      typeof input.confirmedAt === 'number' && Number.isFinite(input.confirmedAt)
        ? input.confirmedAt
        : prev.lastConfirmedAt;
    const stamp =
      typeof input.confirmedAt === 'number' && Number.isFinite(input.confirmedAt)
        ? Math.floor(input.confirmedAt)
        : Math.floor(input.nowMs);
    next.acceptedAts = sanitizeAcceptedAts([...next.acceptedAts, stamp]);
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

/**
 * Summarize accepted-publish timestamps inside [windowStartMs, windowEndMs].
 * okCount ≥ 1 alone is insufficient: maxGapMs must be ≤ TTL to sustain Discovery.
 */
export function summarizeBgPublishWindow(input: {
  acceptedAts: number[];
  windowStartMs: number;
  windowEndMs: number;
  ttlMs?: number;
}): BgPublishWindowSummary {
  const ttlMs = input.ttlMs ?? LOCATION_TTL_MS;
  const start = input.windowStartMs;
  const end = input.windowEndMs;
  const inWindow = sanitizeAcceptedAts(input.acceptedAts).filter(
    (t) => t >= start && t <= end,
  );

  let maxInter: number | null = null;
  for (let i = 1; i < inWindow.length; i += 1) {
    const gap = inWindow[i]! - inWindow[i - 1]!;
    maxInter = maxInter == null ? gap : Math.max(maxInter, gap);
  }

  const last = inWindow.length > 0 ? inWindow[inWindow.length - 1]! : null;
  const gapToEnd = last != null ? end - last : null;

  let maxGap: number | null = null;
  if (maxInter != null) maxGap = maxInter;
  if (gapToEnd != null) {
    maxGap = maxGap == null ? gapToEnd : Math.max(maxGap, gapToEnd);
  }

  const sustainsTtl =
    inWindow.length >= 2 &&
    maxGap != null &&
    Number.isFinite(ttlMs) &&
    maxGap <= ttlMs;

  return {
    acceptedAtsInWindow: inWindow,
    acceptedCount: inWindow.length,
    maxInterPublishGapMs: maxInter,
    gapToWindowEndMs: gapToEnd,
    maxGapMs: maxGap,
    sustainsTtl,
  };
}

/**
 * QA evidence payload — timestamps only. Never include coordinates or UID.
 */
export function formatBgPublishProbeEvidence(input: {
  windowStartMs: number;
  windowEndMs: number;
  probe: BgPublishProbeSnapshot;
  ttlMs?: number;
}): {
  windowStartMs: number;
  windowEndMs: number;
  windowDurationMs: number;
  okCount: number;
  failCount: number;
  lastKind: string | null;
  lastConfirmedAt: number | null;
  summary: BgPublishWindowSummary;
} {
  const summary = summarizeBgPublishWindow({
    acceptedAts: input.probe.acceptedAts,
    windowStartMs: input.windowStartMs,
    windowEndMs: input.windowEndMs,
    ttlMs: input.ttlMs,
  });
  return {
    windowStartMs: input.windowStartMs,
    windowEndMs: input.windowEndMs,
    windowDurationMs: input.windowEndMs - input.windowStartMs,
    okCount: input.probe.okCount,
    failCount: input.probe.failCount,
    lastKind: input.probe.lastKind,
    lastConfirmedAt: input.probe.lastConfirmedAt,
    summary,
  };
}

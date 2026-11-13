/** Pure Discovery measurement rules. */
import { matchScoreRange } from './contract';

/**
 * One discovery_opened per entry. Refreshes (interval, foreground, pull) do not
 * re-arm it. Coming back from a profile opened from the list is the same entry.
 * An error leaves it armed, so the next successful load reports the entry.
 */
export function createDiscoveryEntryTracker() {
  let armed = true;
  let returningFromChild = false;
  return {
    onFocus(): void {
      if (returningFromChild) {
        returningFromChild = false;
        return;
      }
      armed = true;
    },
    onOpenChild(): void {
      returningFromChild = true;
    },
    /** True when this successful load is the one to report. */
    consumeSuccess(): boolean {
      if (!armed) return false;
      armed = false;
      return true;
    },
  };
}

export function buildScoreProperties(
  score: number | null | undefined,
): Record<string, unknown> {
  if (typeof score !== 'number') return {};
  const range = matchScoreRange(score);
  return range ? { match_score: score, match_score_range: range } : {};
}

/**
 * Initial rule: one match_made per viewer, profile and SDK session. A new session
 * can count again, and each account has its own count. The other user's UID is
 * only a local dedupe key: it never leaves the device, not even hashed.
 */
export function createMatchSessionDedupe() {
  const seen = new Set<string>();
  return {
    claim(sessionId: string, viewerUid: string, otherUid: string): boolean {
      const key = `${sessionId}|${viewerUid}|${otherUid}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    },
  };
}


/**
 * DEV / Owner QA helper — read BG publish probe evidence (BUG-DISC-05).
 * Never includes coordinates or UID.
 *
 * `acceptedAts` are appended only after publishLocationFlow returns ok:true
 * (preferring response.confirmedAt; otherwise client attempt time).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  BG_PUBLISH_PROBE_KEY,
  formatBgPublishProbeEvidence,
  parseBgPublishProbe,
  type BgPublishProbeSnapshot,
} from './backgroundPublishProbe';

export const BG_PROBE_WINDOW_START_KEY = 'NEARSY_BG_PROBE_WINDOW_START' as const;

export async function readBgPublishProbeSnapshot(): Promise<BgPublishProbeSnapshot> {
  const raw = await AsyncStorage.getItem(BG_PUBLISH_PROBE_KEY);
  return parseBgPublishProbe(raw);
}

/**
 * Clears probe + records windowStartMs. Tap this in More (DEV) before entering BG.
 */
export async function startBgPublishProbeWindow(
  nowMs: number = Date.now(),
): Promise<{ windowStartMs: number }> {
  await AsyncStorage.removeItem(BG_PUBLISH_PROBE_KEY);
  await AsyncStorage.setItem(BG_PROBE_WINDOW_START_KEY, String(nowMs));
  return { windowStartMs: nowMs };
}

export async function readBgProbeWindowStartMs(): Promise<number | null> {
  const raw = await AsyncStorage.getItem(BG_PROBE_WINDOW_START_KEY);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Build evidence for the stored window (or explicit bounds).
 * Prefer the More → DEV “Read BG probe” row over manual imports.
 */
export async function readBgPublishProbeEvidence(input?: {
  windowStartMs?: number;
  windowEndMs?: number;
}): Promise<ReturnType<typeof formatBgPublishProbeEvidence>> {
  const storedStart = await readBgProbeWindowStartMs();
  const windowStartMs = input?.windowStartMs ?? storedStart ?? Date.now();
  const probe = await readBgPublishProbeSnapshot();
  return formatBgPublishProbeEvidence({
    windowStartMs,
    windowEndMs: input?.windowEndMs ?? Date.now(),
    probe,
  });
}

/** Clears probe counters between QA runs (optional). */
export async function clearBgPublishProbeForQa(): Promise<void> {
  await AsyncStorage.removeItem(BG_PUBLISH_PROBE_KEY);
  await AsyncStorage.removeItem(BG_PROBE_WINDOW_START_KEY);
}

/** Compact multi-line text for Alert (no coords / UID). */
export function formatBgPublishProbeEvidenceForAlert(
  evidence: ReturnType<typeof formatBgPublishProbeEvidence>,
): string {
  const s = evidence.summary;
  const lines = [
    `windowMs=${evidence.windowDurationMs}`,
    `ok=${evidence.okCount} fail=${evidence.failCount}`,
    `lastKind=${evidence.lastKind ?? 'null'}`,
    `lastConfirmedAt=${evidence.lastConfirmedAt ?? 'null'}`,
    `acceptedInWindow=${s.acceptedCount}`,
    `acceptedAts=${JSON.stringify(s.acceptedAtsInWindow)}`,
    `maxInterGapMs=${s.maxInterPublishGapMs ?? 'null'}`,
    `gapToEndMs=${s.gapToWindowEndMs ?? 'null'}`,
    `maxGapMs=${s.maxGapMs ?? 'null'}`,
    `sustainsTtl=${s.sustainsTtl}`,
  ];
  return lines.join('\n');
}

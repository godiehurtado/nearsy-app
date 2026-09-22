/**
 * DEV / Owner QA helper — read BG publish probe evidence (BUG-DISC-05).
 * Never includes coordinates or UID.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  BG_PUBLISH_PROBE_KEY,
  formatBgPublishProbeEvidence,
  parseBgPublishProbe,
  type BgPublishProbeSnapshot,
} from './backgroundPublishProbe';

export async function readBgPublishProbeSnapshot(): Promise<BgPublishProbeSnapshot> {
  const raw = await AsyncStorage.getItem(BG_PUBLISH_PROBE_KEY);
  return parseBgPublishProbe(raw);
}

/**
 * Build the physical-QA evidence object for a BG window.
 * Call from Metro console after returning from background, e.g.:
 *   const { readBgPublishProbeEvidence } = require('...')
 *   await readBgPublishProbeEvidence({ windowStartMs, windowEndMs: Date.now() })
 */
export async function readBgPublishProbeEvidence(input: {
  windowStartMs: number;
  windowEndMs?: number;
}): Promise<ReturnType<typeof formatBgPublishProbeEvidence>> {
  const probe = await readBgPublishProbeSnapshot();
  return formatBgPublishProbeEvidence({
    windowStartMs: input.windowStartMs,
    windowEndMs: input.windowEndMs ?? Date.now(),
    probe,
  });
}

/** Clears probe counters between QA runs (optional). */
export async function clearBgPublishProbeForQa(): Promise<void> {
  await AsyncStorage.removeItem(BG_PUBLISH_PROBE_KEY);
}

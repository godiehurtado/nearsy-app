import { Share } from 'react-native';

export type CopyInstagramChallengeResult =
  | { ok: true; method: 'clipboard' }
  | { ok: false; reason: 'empty' }
  | {
      ok: false;
      reason: 'native-module-unavailable';
      alternative: 'ios-share-sheet';
    };

export function isCopyInstagramChallengeFailure(
  result: CopyInstagramChallengeResult,
): result is Extract<CopyInstagramChallengeResult, { ok: false }> {
  return result.ok === false;
}

type ClipboardWriter = {
  setStringAsync: (value: string) => Promise<unknown>;
};

function isClipboardWriter(value: unknown): value is ClipboardWriter {
  if (value === null || typeof value !== 'object') return false;
  if (!('setStringAsync' in value)) return false;
  return typeof value.setStringAsync === 'function';
}

function loadClipboardWriter(): ClipboardWriter | null {
  try {
    const loaded: unknown = require('expo-clipboard');
    return isClipboardWriter(loaded) ? loaded : null;
  } catch {
    return null;
  }
}

/**
 * Copy the reverse-DM code to the system clipboard via expo-clipboard.
 * Never treats the iOS Share sheet as a successful copy.
 */
export async function copyInstagramChallengeCode(
  code: string,
): Promise<CopyInstagramChallengeResult> {
  const value = code.trim();
  if (!value) return { ok: false, reason: 'empty' };
  const clipboard = loadClipboardWriter();
  if (!clipboard) {
    return {
      ok: false,
      reason: 'native-module-unavailable',
      alternative: 'ios-share-sheet',
    };
  }
  try {
    await clipboard.setStringAsync(value);
    return { ok: true, method: 'clipboard' };
  } catch {
    return {
      ok: false,
      reason: 'native-module-unavailable',
      alternative: 'ios-share-sheet',
    };
  }
}

/** Explicit Share-sheet path. Call only from a control labeled Share. */
export async function shareInstagramChallengeCode(code: string): Promise<void> {
  const value = code.trim();
  if (!value) return;
  await Share.share({ message: value });
}

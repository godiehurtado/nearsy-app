import { Share } from 'react-native';

export type CopyInstagramChallengeResult = 'copied' | 'shared';

/**
 * Copy the reverse-DM code without logging it.
 * Prefer the clipboard when the native module is present in this binary;
 * otherwise fall back to the iOS share sheet.
 */
export async function copyInstagramChallengeCode(
  code: string,
): Promise<CopyInstagramChallengeResult> {
  const value = code.trim();
  if (!value) return 'shared';
  try {
    const clipboard = require('expo-clipboard') as {
      setStringAsync?: (text: string) => Promise<boolean>;
    };
    if (typeof clipboard?.setStringAsync === 'function') {
      await clipboard.setStringAsync(value);
      return 'copied';
    }
  } catch {
    // Module not linked in this binary — share sheet remains available.
  }
  await Share.share({ message: value });
  return 'shared';
}

/** @deprecated Use copyInstagramChallengeCode. Kept for existing call sites. */
export async function shareInstagramChallengeCode(code: string): Promise<void> {
  await copyInstagramChallengeCode(code);
}

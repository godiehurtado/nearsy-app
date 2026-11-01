import { Share } from 'react-native';

export type CopyTextResult = 'copied' | 'shared' | 'failed';

/**
 * Copy without adding a new icon library. expo-clipboard is used when the
 * native module is present; otherwise the system share sheet is the fallback.
 */
export async function copyTextToClipboard(text: string): Promise<CopyTextResult> {
  const value = text.trim();
  if (!value) return 'failed';
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const clipboard = require('expo-clipboard') as {
      setStringAsync?: (next: string) => Promise<void>;
      setString?: (next: string) => void;
    };
    if (typeof clipboard.setStringAsync === 'function') {
      await clipboard.setStringAsync(value);
      return 'copied';
    }
    if (typeof clipboard.setString === 'function') {
      clipboard.setString(value);
      return 'copied';
    }
  } catch {
    // Native module may be absent until the next AAB.
  }
  try {
    await Share.share({ message: value });
    return 'shared';
  } catch {
    return 'failed';
  }
}

import { Share } from 'react-native';

export type CopyTextResult = 'copied' | 'unavailable' | 'failed';
export type ShareTextResult = 'shared' | 'dismissed' | 'failed';

type ExpoClipboardModule = {
  setStringAsync?: (
    next: string,
    options?: { android?: { isSensitive?: boolean } },
  ) => Promise<boolean | void>;
  setString?: (next: string) => void;
};

function loadExpoClipboard(): ExpoClipboardModule | null {
  try {
    // Declared dependency; keep require so Metro still resolves after install.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-clipboard') as ExpoClipboardModule;
  } catch {
    return null;
  }
}

/**
 * Real clipboard copy only. Never falls back to Share — callers must offer
 * shareTextViaSystemShare as an explicit alternative when this returns
 * `unavailable` (legacy binary without the native module).
 */
export async function copyTextToClipboard(
  text: string,
  opts?: { sensitive?: boolean },
): Promise<CopyTextResult> {
  const value = text.trim();
  if (!value) return 'failed';
  const clipboard = loadExpoClipboard();
  if (!clipboard) return 'unavailable';
  try {
    if (typeof clipboard.setStringAsync === 'function') {
      await clipboard.setStringAsync(
        value,
        opts?.sensitive ? { android: { isSensitive: true } } : undefined,
      );
      return 'copied';
    }
    if (typeof clipboard.setString === 'function') {
      clipboard.setString(value);
      return 'copied';
    }
    return 'unavailable';
  } catch {
    return 'failed';
  }
}

/** Explicit Share-sheet alternative — never used as a silent Copy substitute. */
export async function shareTextViaSystemShare(
  text: string,
): Promise<ShareTextResult> {
  const value = text.trim();
  if (!value) return 'failed';
  try {
    const result = await Share.share({ message: value });
    if (
      result &&
      typeof result === 'object' &&
      'action' in result &&
      result.action === Share.dismissedAction
    ) {
      return 'dismissed';
    }
    return 'shared';
  } catch {
    return 'failed';
  }
}

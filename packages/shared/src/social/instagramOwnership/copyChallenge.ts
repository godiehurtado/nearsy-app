import { Share } from 'react-native';

/**
 * Share the reverse-DM code without logging it.
 * No clipboard module is linked in this Dev Client; the share sheet is the
 * existing iOS path. The UI label must be "Share code", not "Copy code".
 */
export async function shareInstagramChallengeCode(code: string): Promise<void> {
  const value = code.trim();
  if (!value) return;
  await Share.share({ message: value });
}

import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Local-only first-launch Welcome gate.
 * Independent of theme selection, auth UID, and profileSetupCompleted.
 * Cleared naturally on app uninstall (AsyncStorage).
 */
export const HAS_SEEN_WELCOME_STORAGE_KEY = 'nearsy.hasSeenWelcome';

export async function loadHasSeenWelcome(): Promise<boolean> {
  try {
    const stored = await AsyncStorage.getItem(HAS_SEEN_WELCOME_STORAGE_KEY);
    return stored === 'true';
  } catch {
    return false;
  }
}

export async function markWelcomeSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(HAS_SEEN_WELCOME_STORAGE_KEY, 'true');
  } catch {
    /* local persistence only — failures are non-fatal */
  }
}

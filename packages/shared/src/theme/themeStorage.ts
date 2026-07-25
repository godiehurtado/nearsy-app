import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ThemeName } from './colors';

/** Local-only appearance preference key (no backend sync in this sprint). */
export const APPEARANCE_STORAGE_KEY = 'nearsy.appearance';

export async function loadAppearance(): Promise<ThemeName | null> {
  try {
    const stored = await AsyncStorage.getItem(APPEARANCE_STORAGE_KEY);
    if (stored === 'clear' || stored === 'dark') return stored;
    return null;
  } catch {
    return null;
  }
}

export async function saveAppearance(theme: ThemeName): Promise<void> {
  try {
    await AsyncStorage.setItem(APPEARANCE_STORAGE_KEY, theme);
  } catch {
    /* local persistence only — failures are non-fatal */
  }
}

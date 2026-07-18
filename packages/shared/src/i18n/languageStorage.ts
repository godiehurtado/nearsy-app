import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  isSupportedLanguage,
  type SupportedLanguage,
} from './supportedLanguages';

export const LANGUAGE_STORAGE_KEY = 'NEARSY_LANGUAGE';

export async function getPersistedLanguage(): Promise<SupportedLanguage | null> {
  try {
    const value = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isSupportedLanguage(value) ? value : null;
  } catch {
    return null;
  }
}

export async function setPersistedLanguage(
  language: SupportedLanguage,
): Promise<void> {
  await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, language);
}

export async function clearPersistedLanguage(): Promise<void> {
  await AsyncStorage.removeItem(LANGUAGE_STORAGE_KEY);
}

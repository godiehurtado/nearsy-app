import * as Localization from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import { es } from './locales/es';
import { en } from './locales/en';
import { getPersistedLanguage, persistLanguage } from './languageStorage';
import {
  DEFAULT_LANGUAGE,
  isSupportedLanguage,
  type SupportedLanguage,
} from './supportedLanguages';

function resolveDeviceLanguage(): SupportedLanguage {
  const deviceCode =
    Localization.getLocales()[0]?.languageCode ?? DEFAULT_LANGUAGE;
  return isSupportedLanguage(deviceCode) ? deviceCode : DEFAULT_LANGUAGE;
}

export async function resolveInitialLanguage(): Promise<SupportedLanguage> {
  const persisted = await getPersistedLanguage();
  if (persisted) return persisted;

  return resolveDeviceLanguage();
}

export async function initI18n(): Promise<typeof i18n> {
  const lng = await resolveInitialLanguage();

  if (i18n.isInitialized) {
    await i18n.changeLanguage(lng);
    return i18n;
  }

  await i18n.use(initReactI18next).init({
    lng,
    fallbackLng: DEFAULT_LANGUAGE,
    resources: {
      en: { translation: en },
      es: { translation: es },
    },
    interpolation: {
      escapeValue: false,
    },
    compatibilityJSON: 'v4',
  });

  return i18n;
}

export async function changeAppLanguage(
  language: string,
): Promise<SupportedLanguage> {
  if (!isSupportedLanguage(language)) {
    throw new Error(`Unsupported language: ${language}`);
  }

  await i18n.changeLanguage(language);
  await persistLanguage(language);
  return language;
}

export { i18n };

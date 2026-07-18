import * as Localization from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import { getPersistedLanguage, setPersistedLanguage } from './languageStorage';
import en from './locales/en';
import es from './locales/es';
import {
  DEFAULT_LANGUAGE,
  isSupportedLanguage,
  type SupportedLanguage,
} from './supportedLanguages';

function getDeviceLanguage(): SupportedLanguage | null {
  const locales = Localization.getLocales();
  const primary = locales[0];

  const candidates = [
    primary?.languageCode,
    primary?.languageTag?.split('-')[0],
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (isSupportedLanguage(candidate)) {
      return candidate;
    }
  }

  return null;
}

export async function resolveInitialLanguage(): Promise<SupportedLanguage> {
  const persisted = await getPersistedLanguage();
  if (persisted) return persisted;

  const deviceLanguage = getDeviceLanguage();
  if (deviceLanguage) return deviceLanguage;

  return DEFAULT_LANGUAGE;
}

export async function initI18n(): Promise<typeof i18n> {
  const language = await resolveInitialLanguage();

  if (!i18n.isInitialized) {
    await i18n.use(initReactI18next).init({
      resources: {
        en: { translation: en },
        es: { translation: es },
      },
      lng: language,
      fallbackLng: DEFAULT_LANGUAGE,
      supportedLngs: ['en', 'es'],
      interpolation: {
        escapeValue: false,
      },
      compatibilityJSON: 'v4',
    });
  } else if (i18n.language !== language) {
    await i18n.changeLanguage(language);
  }

  return i18n;
}

export async function changeAppLanguage(
  language: SupportedLanguage,
): Promise<void> {
  await setPersistedLanguage(language);
  await i18n.changeLanguage(language);
}

export { i18n };

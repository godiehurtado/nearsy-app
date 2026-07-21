export {
  changeAppLanguage,
  initI18n,
  resolveInitialLanguage,
  i18n,
} from './config';
export {
  clearPersistedLanguage,
  getPersistedLanguage,
  LANGUAGE_STORAGE_KEY,
  persistLanguage,
} from './languageStorage';
export {
  DEFAULT_LANGUAGE,
  isSupportedLanguage,
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
} from './supportedLanguages';
export type { TranslationResources } from './locales/en';

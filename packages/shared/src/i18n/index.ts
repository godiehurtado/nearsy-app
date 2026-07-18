export {
  changeAppLanguage,
  i18n,
  initI18n,
  resolveInitialLanguage,
} from './config';

export {
  clearPersistedLanguage,
  getPersistedLanguage,
  LANGUAGE_STORAGE_KEY,
  setPersistedLanguage,
} from './languageStorage';

export {
  DEFAULT_LANGUAGE,
  isSupportedLanguage,
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
} from './supportedLanguages';

export type { TranslationResources } from './locales/en';

export { useTranslation } from 'react-i18next';

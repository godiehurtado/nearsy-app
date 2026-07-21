export const DEFAULT_LANGUAGE = 'en' as const;

export const SUPPORTED_LANGUAGES = ['en', 'es'] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export function isSupportedLanguage(
  value: string | null | undefined,
): value is SupportedLanguage {
  if (!value) return false;
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

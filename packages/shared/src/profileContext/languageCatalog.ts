/**
 * Searchable language catalog for Profile Context (ENH-PROFILE-01).
 * Canonical persisted values: BCP-47-compatible language tags (lowercase).
 * UI labels: deterministic EN/ES static maps (Hermes-safe; no Intl.DisplayNames).
 */

import { normalizeSearchQuery } from '../visibility/interestSearchCatalog';
import {
  LANGUAGE_DISPLAY_NAMES_EN,
  LANGUAGE_DISPLAY_NAMES_ES,
} from './languageDisplayNames';

export const MAX_PROFILE_LANGUAGE_CODES = 10;
export const MIN_CRJ_LANGUAGE_CODES = 1;

export type LanguageCatalogEntry = {
  code: string;
  /** English display label (also used as search haystack seed). */
  enFallback: string;
};

export const LANGUAGE_CATALOG: readonly LanguageCatalogEntry[] = [
  { code: 'en', enFallback: 'English' },
  { code: 'es', enFallback: 'Spanish' },
  { code: 'pt', enFallback: 'Portuguese' },
  { code: 'fr', enFallback: 'French' },
  { code: 'de', enFallback: 'German' },
  { code: 'it', enFallback: 'Italian' },
  { code: 'nl', enFallback: 'Dutch' },
  { code: 'pl', enFallback: 'Polish' },
  { code: 'ru', enFallback: 'Russian' },
  { code: 'uk', enFallback: 'Ukrainian' },
  { code: 'cs', enFallback: 'Czech' },
  { code: 'sk', enFallback: 'Slovak' },
  { code: 'hu', enFallback: 'Hungarian' },
  { code: 'ro', enFallback: 'Romanian' },
  { code: 'bg', enFallback: 'Bulgarian' },
  { code: 'hr', enFallback: 'Croatian' },
  { code: 'sr', enFallback: 'Serbian' },
  { code: 'sl', enFallback: 'Slovenian' },
  { code: 'bs', enFallback: 'Bosnian' },
  { code: 'mk', enFallback: 'Macedonian' },
  { code: 'sq', enFallback: 'Albanian' },
  { code: 'el', enFallback: 'Greek' },
  { code: 'tr', enFallback: 'Turkish' },
  { code: 'az', enFallback: 'Azerbaijani' },
  { code: 'ka', enFallback: 'Georgian' },
  { code: 'hy', enFallback: 'Armenian' },
  { code: 'he', enFallback: 'Hebrew' },
  { code: 'ar', enFallback: 'Arabic' },
  { code: 'fa', enFallback: 'Persian' },
  { code: 'ur', enFallback: 'Urdu' },
  { code: 'hi', enFallback: 'Hindi' },
  { code: 'bn', enFallback: 'Bengali' },
  { code: 'pa', enFallback: 'Punjabi' },
  { code: 'gu', enFallback: 'Gujarati' },
  { code: 'mr', enFallback: 'Marathi' },
  { code: 'ta', enFallback: 'Tamil' },
  { code: 'te', enFallback: 'Telugu' },
  { code: 'kn', enFallback: 'Kannada' },
  { code: 'ml', enFallback: 'Malayalam' },
  { code: 'si', enFallback: 'Sinhala' },
  { code: 'ne', enFallback: 'Nepali' },
  { code: 'th', enFallback: 'Thai' },
  { code: 'lo', enFallback: 'Lao' },
  { code: 'my', enFallback: 'Burmese' },
  { code: 'km', enFallback: 'Khmer' },
  { code: 'vi', enFallback: 'Vietnamese' },
  { code: 'id', enFallback: 'Indonesian' },
  { code: 'ms', enFallback: 'Malay' },
  { code: 'tl', enFallback: 'Tagalog' },
  { code: 'fil', enFallback: 'Filipino' },
  { code: 'zh', enFallback: 'Chinese' },
  { code: 'zh-Hans', enFallback: 'Chinese (Simplified)' },
  { code: 'zh-Hant', enFallback: 'Chinese (Traditional)' },
  { code: 'ja', enFallback: 'Japanese' },
  { code: 'ko', enFallback: 'Korean' },
  { code: 'mn', enFallback: 'Mongolian' },
  { code: 'sv', enFallback: 'Swedish' },
  { code: 'no', enFallback: 'Norwegian' },
  { code: 'nb', enFallback: 'Norwegian Bokmål' },
  { code: 'nn', enFallback: 'Norwegian Nynorsk' },
  { code: 'da', enFallback: 'Danish' },
  { code: 'fi', enFallback: 'Finnish' },
  { code: 'is', enFallback: 'Icelandic' },
  { code: 'et', enFallback: 'Estonian' },
  { code: 'lv', enFallback: 'Latvian' },
  { code: 'lt', enFallback: 'Lithuanian' },
  { code: 'ga', enFallback: 'Irish' },
  { code: 'cy', enFallback: 'Welsh' },
  { code: 'eu', enFallback: 'Basque' },
  { code: 'ca', enFallback: 'Catalan' },
  { code: 'gl', enFallback: 'Galician' },
  { code: 'af', enFallback: 'Afrikaans' },
  { code: 'sw', enFallback: 'Swahili' },
  { code: 'am', enFallback: 'Amharic' },
  { code: 'ha', enFallback: 'Hausa' },
  { code: 'yo', enFallback: 'Yoruba' },
  { code: 'ig', enFallback: 'Igbo' },
  { code: 'zu', enFallback: 'Zulu' },
  { code: 'xh', enFallback: 'Xhosa' },
  { code: 'so', enFallback: 'Somali' },
  { code: 'rw', enFallback: 'Kinyarwanda' },
  { code: 'mg', enFallback: 'Malagasy' },
  { code: 'ht', enFallback: 'Haitian Creole' },
  { code: 'lb', enFallback: 'Luxembourgish' },
  { code: 'mt', enFallback: 'Maltese' },
  { code: 'be', enFallback: 'Belarusian' },
  { code: 'kk', enFallback: 'Kazakh' },
  { code: 'uz', enFallback: 'Uzbek' },
  { code: 'ky', enFallback: 'Kyrgyz' },
  { code: 'tg', enFallback: 'Tajik' },
  { code: 'tk', enFallback: 'Turkmen' },
  { code: 'ps', enFallback: 'Pashto' },
  { code: 'ku', enFallback: 'Kurdish' },
  { code: 'yi', enFallback: 'Yiddish' },
  { code: 'eo', enFallback: 'Esperanto' },
  { code: 'la', enFallback: 'Latin' },
  { code: 'sa', enFallback: 'Sanskrit' },
  { code: 'bo', enFallback: 'Tibetan' },
  { code: 'dz', enFallback: 'Dzongkha' },
  { code: 'qu', enFallback: 'Quechua' },
  { code: 'gn', enFallback: 'Guarani' },
  { code: 'ay', enFallback: 'Aymara' },
  { code: 'mi', enFallback: 'Maori' },
  { code: 'sm', enFallback: 'Samoan' },
  { code: 'to', enFallback: 'Tongan' },
  { code: 'fj', enFallback: 'Fijian' },
  { code: 'ty', enFallback: 'Tahitian' },
  { code: 'haw', enFallback: 'Hawaiian' },
] as const;

const CODE_SET = new Set(LANGUAGE_CATALOG.map((e) => e.code));
const BY_CODE = new Map(LANGUAGE_CATALOG.map((e) => [e.code, e]));

export function isKnownLanguageCode(value: unknown): value is string {
  return typeof value === 'string' && CODE_SET.has(value);
}

/** Normalize a single language code; unknown → null. */
export function normalizeLanguageCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const code = value.trim();
  if (!code) return null;
  if (CODE_SET.has(code)) return code;
  const lower = code.toLowerCase();
  if (CODE_SET.has(lower)) return lower;
  return null;
}

export function languageDisplayName(code: string, locale: string): string {
  const normalized = code.trim();
  const key =
    BY_CODE.has(normalized)
      ? normalized
      : BY_CODE.has(normalized.toLowerCase())
        ? normalized.toLowerCase()
        : null;
  if (!key) return code;
  const map =
    resolveLanguageLabelLocale(locale) === 'es'
      ? LANGUAGE_DISPLAY_NAMES_ES
      : LANGUAGE_DISPLAY_NAMES_EN;
  return (
    map[key] ??
    LANGUAGE_DISPLAY_NAMES_EN[key] ??
    BY_CODE.get(key)?.enFallback ??
    key
  );
}

function resolveLanguageLabelLocale(locale: string): 'en' | 'es' {
  return (locale || 'en').toLowerCase().startsWith('es') ? 'es' : 'en';
}

export type LanguageSearchEntry = {
  code: string;
  label: string;
  haystack: string;
};

export function buildLanguageSearchEntries(
  locale: string,
): LanguageSearchEntry[] {
  return LANGUAGE_CATALOG.map((e) => {
    const label = languageDisplayName(e.code, locale);
    const esLabel = languageDisplayName(e.code, 'es');
    return {
      code: e.code,
      label,
      haystack: normalizeSearchQuery(
        [label, esLabel, e.code, e.enFallback].join(' '),
      ),
    };
  });
}

export function searchLanguageEntries(
  entries: readonly LanguageSearchEntry[],
  query: string,
  selected: ReadonlySet<string>,
): LanguageSearchEntry[] {
  const q = normalizeSearchQuery(query);
  return entries.filter((e) => {
    if (selected.has(e.code)) return false;
    if (!q) return true;
    return e.haystack.includes(q) || e.code.toLowerCase().includes(q);
  });
}

/**
 * Dedupe, keep catalog-known codes only, preserve order, cap at max.
 */
export function normalizeLanguageCodes(
  values: unknown,
  max = MAX_PROFILE_LANGUAGE_CODES,
): string[] {
  if (!Array.isArray(values)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    if (out.length >= max) break;
    const code = normalizeLanguageCode(raw);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    out.push(code);
  }
  return out;
}

export function canAddLanguageCode(
  selected: readonly string[],
  code: string,
  max = MAX_PROFILE_LANGUAGE_CODES,
): boolean {
  if (selected.length >= max) return false;
  const normalized = normalizeLanguageCode(code);
  if (!normalized) return false;
  return !selected.includes(normalized);
}

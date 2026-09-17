/**
 * Curated BCP-47 primary language tags for profile spoken languages.
 */

import { normalizeSearchQuery } from '../visibility/interestSearchCatalog';

export const MAX_PROFILE_LANGUAGES = 10;
export const MIN_PROFILE_LANGUAGES_CRJ = 1;

/**
 * Broad curated list (~100) of common language primary tags (lowercase).
 * Includes Tibetan (`bo`).
 */
export const LANGUAGE_CODES = [
  'en',
  'es',
  'pt',
  'fr',
  'de',
  'it',
  'ja',
  'ko',
  'zh',
  'ar',
  'hi',
  'ru',
  'nl',
  'pl',
  'tr',
  'vi',
  'th',
  'id',
  'ms',
  'sv',
  'no',
  'da',
  'fi',
  'el',
  'he',
  'uk',
  'cs',
  'ro',
  'hu',
  'sk',
  'bg',
  'hr',
  'sr',
  'sl',
  'lt',
  'lv',
  'et',
  'ca',
  'eu',
  'gl',
  'ga',
  'is',
  'mt',
  'cy',
  'sq',
  'mk',
  'bs',
  'af',
  'sw',
  'am',
  'bn',
  'gu',
  'kn',
  'ml',
  'mr',
  'pa',
  'ta',
  'te',
  'ur',
  'fa',
  'ps',
  'ne',
  'si',
  'my',
  'km',
  'lo',
  'ka',
  'hy',
  'az',
  'kk',
  'uz',
  'mn',
  'bo',
  'be',
  'tl',
  'fil',
  'jw',
  'jv',
  'su',
  'yo',
  'ig',
  'ha',
  'zu',
  'xh',
  'st',
  'sn',
  'rw',
  'so',
  'om',
  'ti',
  'ku',
  'ckb',
  'sd',
  'or',
  'as',
  'mai',
  'sa',
  'dv',
  'ug',
  'ky',
  'tg',
  'tk',
  'tt',
  'ba',
  'cv',
  'yi',
  'lb',
  'fy',
  'gd',
  'br',
  'oc',
  'co',
  'sc',
  'rm',
] as const;

export type LanguageCode = (typeof LANGUAGE_CODES)[number];

const LANGUAGE_CODE_SET = new Set<string>(LANGUAGE_CODES);

export type LanguageOption = {
  code: string;
  name: string;
};

export function normalizeLanguageCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const code = value.trim().toLowerCase();
  if (!LANGUAGE_CODE_SET.has(code)) return null;
  return code;
}

export function normalizeLanguageCodes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const code = normalizeLanguageCode(item);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    out.push(code);
    if (out.length >= MAX_PROFILE_LANGUAGES) break;
  }
  return out;
}

export function getLanguageDisplayName(code: string, locale: string): string {
  const normalized = normalizeLanguageCode(code);
  const fallback =
    normalized ??
    (typeof code === 'string' ? code.trim().toLowerCase() || code : '');
  if (!normalized) return fallback;
  try {
    const display = new Intl.DisplayNames([locale], { type: 'language' });
    const name = display.of(normalized);
    if (typeof name === 'string' && name.trim().length > 0) {
      return name;
    }
  } catch {
    // Fall through to code.
  }
  return normalized;
}

function toLanguageOption(code: string, locale: string): LanguageOption {
  return {
    code,
    name: getLanguageDisplayName(code, locale),
  };
}

export function filterLanguages(
  query: string,
  locale: string,
  excludeCodes?: ReadonlyArray<string> | ReadonlySet<string>,
): LanguageOption[] {
  const excluded = new Set<string>();
  if (excludeCodes) {
    for (const raw of excludeCodes) {
      const code = normalizeLanguageCode(raw);
      if (code) excluded.add(code);
    }
  }

  const q = normalizeSearchQuery(query);
  const options = LANGUAGE_CODES.filter((code) => !excluded.has(code)).map(
    (code) => toLanguageOption(code, locale),
  );

  if (!q) {
    return options.sort((a, b) =>
      a.name.localeCompare(b.name, locale, { sensitivity: 'base' }),
    );
  }

  return options
    .filter((option) => {
      const haystack = normalizeSearchQuery(`${option.code} ${option.name}`);
      return haystack.includes(q);
    })
    .sort((a, b) =>
      a.name.localeCompare(b.name, locale, { sensitivity: 'base' }),
    );
}

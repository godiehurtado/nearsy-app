/**
 * Zodiac presentation helpers (ENH-PROFILE-01).
 * Client never derives zodiac — only displays backend zodiacSign.
 */

export const ZODIAC_SIGNS = [
  'aries',
  'taurus',
  'gemini',
  'cancer',
  'leo',
  'virgo',
  'libra',
  'scorpio',
  'sagittarius',
  'capricorn',
  'aquarius',
  'pisces',
] as const;

export type ZodiacSign = (typeof ZODIAC_SIGNS)[number];

const SIGN_SET = new Set<string>(ZODIAC_SIGNS);

export const ZODIAC_SYMBOLS: Record<ZodiacSign, string> = {
  aries: '♈',
  taurus: '♉',
  gemini: '♊',
  cancer: '♋',
  leo: '♌',
  virgo: '♍',
  libra: '♎',
  scorpio: '♏',
  sagittarius: '♐',
  capricorn: '♑',
  aquarius: '♒',
  pisces: '♓',
};

/** Parse backend zodiacSign; unknown/missing → null. */
export function parseZodiacSign(value: unknown): ZodiacSign | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return SIGN_SET.has(normalized) ? (normalized as ZodiacSign) : null;
}

export function zodiacSymbol(sign: ZodiacSign): string {
  return ZODIAC_SYMBOLS[sign];
}

/** i18n key under discoveryProfile.zodiac.* / profileContext.zodiac.* */
export function zodiacI18nKey(sign: ZodiacSign): string {
  return sign;
}

/**
 * Western zodiac signs for Discovery profile context presentation.
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

const ZODIAC_SIGN_SET = new Set<string>(ZODIAC_SIGNS);

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

export function parseZodiacSign(value: unknown): ZodiacSign | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (!ZODIAC_SIGN_SET.has(normalized)) return null;
  return normalized as ZodiacSign;
}

export function zodiacSymbol(sign: ZodiacSign): string {
  return ZODIAC_SYMBOLS[sign];
}

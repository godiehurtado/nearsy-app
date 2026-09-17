/**
 * ISO 3166-1 alpha-2 country catalog for profile context (birth / residence).
 */

import { normalizeSearchQuery } from '../visibility/interestSearchCatalog';

/** Official ISO 3166-1 alpha-2 codes + XK (Kosovo, commonly needed). */
export const COUNTRY_CODES = [
  'AD',
  'AE',
  'AF',
  'AG',
  'AI',
  'AL',
  'AM',
  'AO',
  'AQ',
  'AR',
  'AS',
  'AT',
  'AU',
  'AW',
  'AX',
  'AZ',
  'BA',
  'BB',
  'BD',
  'BE',
  'BF',
  'BG',
  'BH',
  'BI',
  'BJ',
  'BL',
  'BM',
  'BN',
  'BO',
  'BQ',
  'BR',
  'BS',
  'BT',
  'BV',
  'BW',
  'BY',
  'BZ',
  'CA',
  'CC',
  'CD',
  'CF',
  'CG',
  'CH',
  'CI',
  'CK',
  'CL',
  'CM',
  'CN',
  'CO',
  'CR',
  'CU',
  'CV',
  'CW',
  'CX',
  'CY',
  'CZ',
  'DE',
  'DJ',
  'DK',
  'DM',
  'DO',
  'DZ',
  'EC',
  'EE',
  'EG',
  'EH',
  'ER',
  'ES',
  'ET',
  'FI',
  'FJ',
  'FK',
  'FM',
  'FO',
  'FR',
  'GA',
  'GB',
  'GD',
  'GE',
  'GF',
  'GG',
  'GH',
  'GI',
  'GL',
  'GM',
  'GN',
  'GP',
  'GQ',
  'GR',
  'GS',
  'GT',
  'GU',
  'GW',
  'GY',
  'HK',
  'HM',
  'HN',
  'HR',
  'HT',
  'HU',
  'ID',
  'IE',
  'IL',
  'IM',
  'IN',
  'IO',
  'IQ',
  'IR',
  'IS',
  'IT',
  'JE',
  'JM',
  'JO',
  'JP',
  'KE',
  'KG',
  'KH',
  'KI',
  'KM',
  'KN',
  'KP',
  'KR',
  'KW',
  'KY',
  'KZ',
  'LA',
  'LB',
  'LC',
  'LI',
  'LK',
  'LR',
  'LS',
  'LT',
  'LU',
  'LV',
  'LY',
  'MA',
  'MC',
  'MD',
  'ME',
  'MF',
  'MG',
  'MH',
  'MK',
  'ML',
  'MM',
  'MN',
  'MO',
  'MP',
  'MQ',
  'MR',
  'MS',
  'MT',
  'MU',
  'MV',
  'MW',
  'MX',
  'MY',
  'MZ',
  'NA',
  'NC',
  'NE',
  'NF',
  'NG',
  'NI',
  'NL',
  'NO',
  'NP',
  'NR',
  'NU',
  'NZ',
  'OM',
  'PA',
  'PE',
  'PF',
  'PG',
  'PH',
  'PK',
  'PL',
  'PM',
  'PN',
  'PR',
  'PS',
  'PT',
  'PW',
  'PY',
  'QA',
  'RE',
  'RO',
  'RS',
  'RU',
  'RW',
  'SA',
  'SB',
  'SC',
  'SD',
  'SE',
  'SG',
  'SH',
  'SI',
  'SJ',
  'SK',
  'SL',
  'SM',
  'SN',
  'SO',
  'SR',
  'SS',
  'ST',
  'SV',
  'SX',
  'SY',
  'SZ',
  'TC',
  'TD',
  'TF',
  'TG',
  'TH',
  'TJ',
  'TK',
  'TL',
  'TM',
  'TN',
  'TO',
  'TR',
  'TT',
  'TV',
  'TW',
  'TZ',
  'UA',
  'UG',
  'UM',
  'US',
  'UY',
  'UZ',
  'VA',
  'VC',
  'VE',
  'VG',
  'VI',
  'VN',
  'VU',
  'WF',
  'WS',
  'XK',
  'YE',
  'YT',
  'ZA',
  'ZM',
  'ZW',
] as const;

export type CountryCode = (typeof COUNTRY_CODES)[number];

const COUNTRY_CODE_SET = new Set<string>(COUNTRY_CODES);

export type CountryOption = {
  code: string;
  name: string;
  flag: string;
};

/** Regional Indicator Symbol Letter A (U+1F1E6). */
const REGIONAL_INDICATOR_A = 0x1f1e6;
const LATIN_A = 'A'.charCodeAt(0);

export function countryCodeToFlagEmoji(code: string): string {
  const normalized = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) return '';
  const first = REGIONAL_INDICATOR_A + (normalized.charCodeAt(0) - LATIN_A);
  const second = REGIONAL_INDICATOR_A + (normalized.charCodeAt(1) - LATIN_A);
  return String.fromCodePoint(first, second);
}

export function normalizeCountryCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase();
  if (!COUNTRY_CODE_SET.has(code)) return null;
  return code;
}

export function getCountryDisplayName(code: string, locale: string): string {
  const normalized = normalizeCountryCode(code);
  if (!normalized) return typeof code === 'string' ? code.trim().toUpperCase() || code : '';
  try {
    const display = new Intl.DisplayNames([locale], { type: 'region' });
    const name = display.of(normalized);
    if (typeof name === 'string' && name.trim().length > 0) {
      return name;
    }
  } catch {
    // Fall through to code.
  }
  return normalized;
}

function toCountryOption(code: string, locale: string): CountryOption {
  return {
    code,
    name: getCountryDisplayName(code, locale),
    flag: countryCodeToFlagEmoji(code),
  };
}

export function filterCountries(
  query: string,
  locale: string,
): CountryOption[] {
  const q = normalizeSearchQuery(query);
  const options = COUNTRY_CODES.map((code) => toCountryOption(code, locale));
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

export function resolveCountryOption(
  code: string | null | undefined,
  locale: string,
): CountryOption | null {
  const normalized = normalizeCountryCode(code ?? null);
  if (!normalized) return null;
  return toCountryOption(normalized, locale);
}

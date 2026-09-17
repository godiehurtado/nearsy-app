/**
 * ISO 3166-1 alpha-2 country catalog for Profile Context (ENH-PROFILE-01).
 * Canonical persisted value: uppercase alpha-2. Localized names via Intl.
 */

import { normalizeSearchQuery } from '../visibility/interestSearchCatalog';

export const ISO_COUNTRY_CODES = [
  "AF",
  "AX",
  "AL",
  "DZ",
  "AS",
  "AD",
  "AO",
  "AI",
  "AQ",
  "AG",
  "AR",
  "AM",
  "AW",
  "AU",
  "AT",
  "AZ",
  "BS",
  "BH",
  "BD",
  "BB",
  "BY",
  "BE",
  "BZ",
  "BJ",
  "BM",
  "BT",
  "BO",
  "BQ",
  "BA",
  "BW",
  "BV",
  "BR",
  "IO",
  "BN",
  "BG",
  "BF",
  "BI",
  "CV",
  "KH",
  "CM",
  "CA",
  "KY",
  "CF",
  "TD",
  "CL",
  "CN",
  "CX",
  "CC",
  "CO",
  "KM",
  "CG",
  "CD",
  "CK",
  "CR",
  "CI",
  "HR",
  "CU",
  "CW",
  "CY",
  "CZ",
  "DK",
  "DJ",
  "DM",
  "DO",
  "EC",
  "EG",
  "SV",
  "GQ",
  "ER",
  "EE",
  "SZ",
  "ET",
  "FK",
  "FO",
  "FJ",
  "FI",
  "FR",
  "GF",
  "PF",
  "TF",
  "GA",
  "GM",
  "GE",
  "DE",
  "GH",
  "GI",
  "GR",
  "GL",
  "GD",
  "GP",
  "GU",
  "GT",
  "GG",
  "GN",
  "GW",
  "GY",
  "HT",
  "HM",
  "VA",
  "HN",
  "HK",
  "HU",
  "IS",
  "IN",
  "ID",
  "IR",
  "IQ",
  "IE",
  "IM",
  "IL",
  "IT",
  "JM",
  "JP",
  "JE",
  "JO",
  "KZ",
  "KE",
  "KI",
  "KP",
  "KR",
  "KW",
  "KG",
  "LA",
  "LV",
  "LB",
  "LS",
  "LR",
  "LY",
  "LI",
  "LT",
  "LU",
  "MO",
  "MG",
  "MW",
  "MY",
  "MV",
  "ML",
  "MT",
  "MH",
  "MQ",
  "MR",
  "MU",
  "YT",
  "MX",
  "FM",
  "MD",
  "MC",
  "MN",
  "ME",
  "MS",
  "MA",
  "MZ",
  "MM",
  "NA",
  "NR",
  "NP",
  "NL",
  "NC",
  "NZ",
  "NI",
  "NE",
  "NG",
  "NU",
  "NF",
  "MK",
  "MP",
  "NO",
  "OM",
  "PK",
  "PW",
  "PS",
  "PA",
  "PG",
  "PY",
  "PE",
  "PH",
  "PN",
  "PL",
  "PT",
  "PR",
  "QA",
  "RE",
  "RO",
  "RU",
  "RW",
  "BL",
  "SH",
  "KN",
  "LC",
  "MF",
  "PM",
  "VC",
  "WS",
  "SM",
  "ST",
  "SA",
  "SN",
  "RS",
  "SC",
  "SL",
  "SG",
  "SX",
  "SK",
  "SI",
  "SB",
  "SO",
  "ZA",
  "GS",
  "SS",
  "ES",
  "LK",
  "SD",
  "SR",
  "SJ",
  "SE",
  "CH",
  "SY",
  "TW",
  "TJ",
  "TZ",
  "TH",
  "TL",
  "TG",
  "TK",
  "TO",
  "TT",
  "TN",
  "TR",
  "TM",
  "TC",
  "TV",
  "UG",
  "UA",
  "AE",
  "GB",
  "US",
  "UM",
  "UY",
  "UZ",
  "VU",
  "VE",
  "VN",
  "VG",
  "VI",
  "WF",
  "EH",
  "YE",
  "ZM",
  "ZW"
] as const;

export type IsoCountryCode = (typeof ISO_COUNTRY_CODES)[number];

const CODE_SET = new Set<string>(ISO_COUNTRY_CODES);

export function isIsoCountryCode(value: unknown): value is IsoCountryCode {
  return typeof value === 'string' && CODE_SET.has(value.toUpperCase());
}

/** Normalize to uppercase alpha-2 or null. */
export function normalizeCountryCode(value: unknown): IsoCountryCode | null {
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase();
  return CODE_SET.has(code) ? (code as IsoCountryCode) : null;
}

/** Regional-indicator flag emoji for a valid ISO code; empty if unknown. */
export function countryFlagEmoji(code: string): string {
  const cc = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc) || !CODE_SET.has(cc)) return '';
  const A = 0x1f1e6;
  return String.fromCodePoint(
    A + (cc.charCodeAt(0) - 65),
    A + (cc.charCodeAt(1) - 65),
  );
}

export function countryDisplayName(code: string, locale: string): string {
  const cc = code.trim().toUpperCase();
  if (!CODE_SET.has(cc)) return cc;
  try {
    const name = new Intl.DisplayNames([locale], { type: 'region' }).of(cc);
    if (name && name !== cc) return name;
  } catch {
    /* fall through */
  }
  try {
    const name = new Intl.DisplayNames(['en'], { type: 'region' }).of(cc);
    if (name) return name;
  } catch {
    /* fall through */
  }
  return cc;
}

export type CountrySearchEntry = {
  code: IsoCountryCode;
  flag: string;
  label: string;
  haystack: string;
};

export function buildCountrySearchEntries(locale: string): CountrySearchEntry[] {
  return ISO_COUNTRY_CODES.map((code) => {
    const label = countryDisplayName(code, locale);
    const flag = countryFlagEmoji(code);
    return {
      code,
      flag,
      label,
      haystack: normalizeSearchQuery([label, code, flag].join(' ')),
    };
  });
}

export function searchCountryEntries(
  entries: readonly CountrySearchEntry[],
  query: string,
): CountrySearchEntry[] {
  const q = normalizeSearchQuery(query);
  if (!q) return [...entries];
  return entries.filter(
    (e) => e.haystack.includes(q) || e.code.toLowerCase().includes(q),
  );
}

export function findCountryEntry(
  entries: readonly CountrySearchEntry[],
  code: string | null | undefined,
): CountrySearchEntry | null {
  const normalized = normalizeCountryCode(code);
  if (!normalized) return null;
  return entries.find((e) => e.code === normalized) ?? null;
}

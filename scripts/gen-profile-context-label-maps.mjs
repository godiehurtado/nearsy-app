/**
 * One-shot generator: builds static EN/ES display-name maps using Node ICU.
 * Run: node scripts/gen-profile-context-label-maps.mjs
 * Output is written into packages/shared/src/profileContext/
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'packages/shared/src/profileContext');

const countryCodes =
  'AF AX AL DZ AS AD AO AI AQ AG AR AM AW AU AT AZ BS BH BD BB BY BE BZ BJ BM BT BO BQ BA BW BV BR IO BN BG BF BI CV KH CM CA KY CF TD CL CN CX CC CO KM CG CD CK CR CI HR CU CW CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FK FO FJ FI FR GF PF TF GA GM GE DE GH GI GR GL GD GP GU GT GG GN GW GY HT HM VA HN HK HU IS IN ID IR IQ IE IM IL IT JM JP JE JO KZ KE KI KP KR KW KG LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MQ MR MU YT MX FM MD MC MN ME MS MA MZ MM NA NR NP NL NC NZ NI NE NG NU NF MK MP NO OM PK PW PS PA PG PY PE PH PN PL PT PR QA RE RO RU RW BL SH KN LC MF PM VC WS SM ST SA SN RS SC SL SG SX SK SI SB SO ZA GS SS ES LK SD SR SJ SE CH SY TW TJ TZ TH TL TG TK TO TT TN TR TM TC TV UG UA AE GB US UM UY UZ VU VE VN VG VI WF EH YE ZM ZW'.split(
    /\s+/,
  );

const languageCodes = [
  'en',
  'es',
  'pt',
  'fr',
  'de',
  'it',
  'nl',
  'pl',
  'ru',
  'uk',
  'cs',
  'sk',
  'hu',
  'ro',
  'bg',
  'hr',
  'sr',
  'sl',
  'bs',
  'mk',
  'sq',
  'el',
  'tr',
  'az',
  'ka',
  'hy',
  'he',
  'ar',
  'fa',
  'ur',
  'hi',
  'bn',
  'pa',
  'gu',
  'mr',
  'ta',
  'te',
  'kn',
  'ml',
  'si',
  'ne',
  'th',
  'lo',
  'my',
  'km',
  'vi',
  'id',
  'ms',
  'tl',
  'fil',
  'zh',
  'zh-Hans',
  'zh-Hant',
  'ja',
  'ko',
  'mn',
  'sv',
  'no',
  'nb',
  'nn',
  'da',
  'fi',
  'is',
  'et',
  'lv',
  'lt',
  'ga',
  'cy',
  'eu',
  'ca',
  'gl',
  'af',
  'sw',
  'am',
  'ha',
  'yo',
  'ig',
  'zu',
  'xh',
  'so',
  'rw',
  'mg',
  'ht',
  'lb',
  'mt',
  'be',
  'kk',
  'uz',
  'ky',
  'tg',
  'tk',
  'ps',
  'ku',
  'yi',
  'eo',
  'la',
  'sa',
  'bo',
  'dz',
  'qu',
  'gn',
  'ay',
  'mi',
  'sm',
  'to',
  'fj',
  'ty',
  'haw',
];

function regionNames(locale) {
  const dn = new Intl.DisplayNames([locale], { type: 'region' });
  const out = {};
  for (const code of countryCodes) {
    const name = dn.of(code);
    out[code] = name && name !== code ? name : code;
  }
  return out;
}

function languageNames(locale) {
  const dn = new Intl.DisplayNames([locale], { type: 'language' });
  const out = {};
  for (const code of languageCodes) {
    const name = dn.of(code);
    let label =
      name && name.toLowerCase() !== code.toLowerCase() ? name : code;
    // Spanish Intl language names are lowercase; UI chips use sentence case.
    if (locale.startsWith('es') && label.length > 0) {
      label = label.charAt(0).toLocaleUpperCase('es') + label.slice(1);
    }
    out[code] = label;
  }
  return out;
}

const countryEn = regionNames('en');
const countryEs = regionNames('es');
const languageEn = languageNames('en');
const languageEs = languageNames('es');

// Spot-check critical labels
const checks = [
  ['CO', countryEn.CO, 'Colombia'],
  ['US', countryEn.US, 'United States'],
  ['US', countryEs.US, 'Estados Unidos'],
  ['es', languageEn.es, 'Spanish'],
  ['es', languageEs.es, 'Español'],
  ['en', languageEn.en, 'English'],
  ['en', languageEs.en, 'Inglés'],
];
for (const [code, actual, expected] of checks) {
  if (actual !== expected) {
    console.warn(`WARN ${code}: got "${actual}", expected "${expected}"`);
  } else {
    console.log(`OK ${code} -> ${actual}`);
  }
}

function writeMapFile(fileName, exportBase, en, es, comment) {
  const body = `/**
 * ${comment}
 * Generated offline for Hermes-safe UI labels (no Intl.DisplayNames at runtime).
 * Do not hand-edit; regenerate via scripts/gen-profile-context-label-maps.mjs
 */

export const ${exportBase}_EN: Readonly<Record<string, string>> = ${JSON.stringify(en, null, 2)} as const;

export const ${exportBase}_ES: Readonly<Record<string, string>> = ${JSON.stringify(es, null, 2)} as const;
`;
  fs.writeFileSync(path.join(outDir, fileName), body);
  console.log('wrote', fileName, Object.keys(en).length);
}

writeMapFile(
  'countryDisplayNames.ts',
  'COUNTRY_DISPLAY_NAMES',
  countryEn,
  countryEs,
  'Static EN/ES ISO 3166-1 alpha-2 country display names.',
);
writeMapFile(
  'languageDisplayNames.ts',
  'LANGUAGE_DISPLAY_NAMES',
  languageEn,
  languageEs,
  'Static EN/ES BCP-47 language display names.',
);

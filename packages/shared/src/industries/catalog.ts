/**
 * Professional Industry catalog (Nearsy 2.1.0).
 *
 * `industry-catalog.v1.json` is a verbatim copy of the Owner-approved catalog
 * from Functions (`docs/industries/industry-catalog.v1.json`, version 1, commit
 * b574639, frozen by the Owner on 2026-11-12, decision record d6cb364). Never
 * edit it here: v1 is closed; a later catalog is a new version from Functions.
 *
 * Pure module: no React Native imports.
 */
import catalogJson from './industry-catalog.v1.json';
import { cleanIndustryName } from './industryRef';

export {
  INDUSTRY_ID_PATTERN,
  isIndustryId,
  parseIndustryRef,
  type IndustryRef,
} from './industryRef';

export type IndustryLocale = 'en' | 'es';

type Localized = { en: string; es: string };

export type IndustrySector = {
  id: string;
  order: number;
  label: Localized;
  iconKey: string;
};

export type Industry = {
  id: string;
  sector: string;
  order: number;
  status: 'active' | 'retired';
  replacedBy?: string;
  label: Localized;
  shortLabel: Localized;
  synonyms: { en: string[]; es: string[] };
  iconKey: string;
};

type IconKey = { key: string; material: string; ionicons: string };

type CatalogFile = {
  catalog: string;
  version: number;
  status: string;
  idPattern: string;
  fallbackIconKey: string;
  sectors: IndustrySector[];
  industries: Industry[];
  iconKeys: IconKey[];
};

const catalog = catalogJson as unknown as CatalogFile;

export const INDUSTRY_CATALOG_VERSION = catalog.version;

const industriesById = new Map(catalog.industries.map((item) => [item.id, item]));
const sectorsById = new Map(catalog.sectors.map((sector) => [sector.id, sector]));
const ioniconsByKey = new Map(catalog.iconKeys.map((icon) => [icon.key, icon.ionicons]));
const FALLBACK_IONICON =
  ioniconsByKey.get(catalog.fallbackIconKey) ?? 'business-outline';

export function industryLocale(language: string | null | undefined): IndustryLocale {
  return typeof language === 'string' && language.toLowerCase().startsWith('es')
    ? 'es'
    : 'en';
}

/** Active or retired: both display and match (contract §1 Lifecycle). */
export function getIndustry(id: string | null | undefined): Industry | null {
  if (!id) return null;
  return industriesById.get(id) ?? null;
}

export function getIndustries(): readonly Industry[] {
  return catalog.industries;
}

export function getIndustrySectors(): readonly IndustrySector[] {
  return catalog.sectors;
}

/**
 * Full label for the picker and profiles. A catalog id renders from the
 * bundle; an id this build does not know shows the Discovery `name` (English).
 */
export function industryLabel(
  id: string | null | undefined,
  locale: IndustryLocale,
  fallbackName?: string | null,
): string | null {
  const item = getIndustry(id);
  if (item) return item.label[locale];
  return cleanIndustryName(fallbackName);
}

/** Short label for push and inbox texts (≤ 32 characters). */
export function industryShortLabel(
  id: string | null | undefined,
  locale: IndustryLocale,
  fallbackName?: string | null,
): string | null {
  const item = getIndustry(id);
  if (item) return item.shortLabel[locale];
  return cleanIndustryName(fallbackName);
}

export function industryIonicon(id: string | null | undefined): string {
  const item = getIndustry(id);
  if (!item) return FALLBACK_IONICON;
  return ioniconsByKey.get(item.iconKey) ?? FALLBACK_IONICON;
}

export function sectorIonicon(sectorId: string): string {
  const sector = sectorsById.get(sectorId);
  return (sector && ioniconsByKey.get(sector.iconKey)) ?? FALLBACK_IONICON;
}

export type IndustrySection = {
  sector: IndustrySector;
  title: string;
  items: Industry[];
};

/** Picker groups: sectors by `order`, active items by `order`; retired hidden. */
export function industryPickerSections(locale: IndustryLocale): IndustrySection[] {
  return [...catalog.sectors]
    .sort((a, b) => a.order - b.order)
    .map((sector) => ({
      sector,
      title: sector.label[locale],
      items: catalog.industries
        .filter((item) => item.sector === sector.id && item.status === 'active')
        .sort((a, b) => a.order - b.order),
    }))
    .filter((section) => section.items.length > 0);
}

/** Case- and accent-insensitive comparison key. */
export function normalizeIndustrySearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

type SearchEntry = {
  item: Industry;
  labels: string[];
  synonyms: string[];
};

const searchIndex: SearchEntry[] = catalog.industries
  .filter((item) => item.status === 'active')
  .map((item) => ({
    item,
    labels: [item.label.en, item.label.es, item.shortLabel.en, item.shortLabel.es].map(
      normalizeIndustrySearch,
    ),
    synonyms: [...item.synonyms.en, ...item.synonyms.es].map(normalizeIndustrySearch),
  }));

/**
 * Contract §1 Search: labels and synonyms in both languages, ignoring case and
 * accents. Rank exactly as the contract (and Android): label prefix, then
 * exact synonym, then substring.
 * Ties keep the picker order. Retired items never appear.
 */
export function searchIndustries(query: string, locale: IndustryLocale): Industry[] {
  const q = normalizeIndustrySearch(query);
  if (!q) return [];
  const ranked: Array<{ item: Industry; rank: number; position: number }> = [];
  const position = new Map(
    industryPickerSections(locale).flatMap((section) => section.items).map((item, index) => [
      item.id,
      index,
    ]),
  );
  for (const entry of searchIndex) {
    let rank = 0;
    if (entry.labels.some((label) => label.startsWith(q))) {
      rank = 3;
    } else if (entry.synonyms.includes(q)) {
      rank = 2;
    } else if (
      entry.labels.some((label) => label.includes(q)) ||
      entry.synonyms.some((synonym) => synonym.includes(q))
    ) {
      rank = 1;
    }
    if (rank > 0) {
      ranked.push({ item: entry.item, rank, position: position.get(entry.item.id) ?? 0 });
    }
  }
  return ranked
    .sort((a, b) => b.rank - a.rank || a.position - b.position)
    .map((entry) => entry.item);
}

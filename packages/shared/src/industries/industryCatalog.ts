/**
 * Bundled industry catalog (Functions INDUSTRY_CONTRACT.md, version 1).
 * Free of React Native imports.
 *
 * - Ids are stable. Retired ids still display and match but are not offered.
 * - "Sin especificar / Not specified" is `null`; an absent field reads the same.
 * - An id this bundle does not know displays the Discovery `name` (English).
 */
import { INDUSTRY_CATALOG_DATA } from './industryCatalogData.ts';
import type { IndustryItem, IndustryLang, IndustrySector } from './industryCatalogTypes.ts';

export type { IndustryItem, IndustryLang, IndustrySector } from './industryCatalogTypes.ts';

export const INDUSTRY_CATALOG_VERSION = INDUSTRY_CATALOG_DATA.version;
export const INDUSTRY_ID_PATTERN = /^[a-z][a-z0-9_]{1,40}$/;

const BY_ID = new Map(INDUSTRY_CATALOG_DATA.industries.map((item) => [item.id, item]));
const SECTOR_BY_ID = new Map(INDUSTRY_CATALOG_DATA.sectors.map((sector) => [sector.id, sector]));
const ICON_BY_KEY = new Map(INDUSTRY_CATALOG_DATA.iconKeys.map((icon) => [icon.key, icon]));

export function industryLang(language: string | undefined | null): IndustryLang {
  return typeof language === 'string' && language.toLowerCase().startsWith('es') ? 'es' : 'en';
}

export function getIndustry(id: unknown): IndustryItem | null {
  return typeof id === 'string' ? BY_ID.get(id) ?? null : null;
}

/**
 * Stored value as written by the apps: a catalog-shaped id, or null. Absent,
 * null and anything malformed read as "Not specified".
 */
export function readIndustryId(value: unknown): string | null {
  return typeof value === 'string' && INDUSTRY_ID_PATTERN.test(value) ? value : null;
}

export function industryLabel(id: string, lang: IndustryLang, fallbackName?: string): string | null {
  const item = BY_ID.get(id);
  if (item) return item.label[lang];
  return fallbackName?.trim() || null;
}

export function industryShortLabel(id: string, lang: IndustryLang, fallbackName?: string): string | null {
  const item = BY_ID.get(id);
  if (item) return item.shortLabel[lang];
  return fallbackName?.trim() || null;
}

/** MaterialCommunityIcons glyph for an industry or sector; unknown keys use the fallback. */
export function industryMaterialIcon(iconKey: string | undefined): string {
  const icon =
    (iconKey ? ICON_BY_KEY.get(iconKey) : undefined) ??
    ICON_BY_KEY.get(INDUSTRY_CATALOG_DATA.fallbackIconKey);
  return icon?.material ?? 'domain';
}

export function industryIconFor(id: string | null | undefined): string {
  return industryMaterialIcon(id ? BY_ID.get(id)?.iconKey : undefined);
}

export type IndustryPickerSection = { sector: IndustrySector; items: IndustryItem[] };

const bySectorOrder = (a: IndustryItem, b: IndustryItem) => {
  const sa = SECTOR_BY_ID.get(a.sector)?.order ?? 0;
  const sb = SECTOR_BY_ID.get(b.sector)?.order ?? 0;
  return sa - sb || a.order - b.order;
};

/** Groups as picker headers, in catalog order. Retired items are not offered. */
export function industryPickerSections(): IndustryPickerSection[] {
  return [...INDUSTRY_CATALOG_DATA.sectors]
    .sort((a, b) => a.order - b.order)
    .map((sector) => ({
      sector,
      items: INDUSTRY_CATALOG_DATA.industries
        .filter((item) => item.sector === sector.id && item.status === 'active')
        .sort((a, b) => a.order - b.order),
    }))
    .filter((section) => section.items.length > 0);
}

export function normalizeIndustrySearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

type Indexed = { item: IndustryItem; labels: string[]; synonyms: string[] };

let index: Indexed[] | null = null;
function searchIndex(): Indexed[] {
  if (index) return index;
  index = INDUSTRY_CATALOG_DATA.industries
    .filter((item) => item.status === 'active')
    .sort(bySectorOrder)
    .map((item) => ({
      item,
      labels: [item.label.en, item.label.es, item.shortLabel.en, item.shortLabel.es].map(
        normalizeIndustrySearch,
      ),
      synonyms: [...item.synonyms.en, ...item.synonyms.es].map(normalizeIndustrySearch),
    }));
  return index;
}

/**
 * EN and ES labels and synonyms, without case or accents. Rank (contract §1):
 * label prefix, then exact synonym, then substring, where a word prefix leads
 * the substring hits; catalog order within a rank. An empty query returns
 * nothing (the picker shows the groups).
 */
export function searchIndustries(query: string): IndustryItem[] {
  const q = normalizeIndustrySearch(query);
  if (!q) return [];
  const ranked: Array<{ item: IndustryItem; rank: number; position: number }> = [];
  searchIndex().forEach((entry, position) => {
    let rank = 0;
    if (entry.labels.some((label) => label.startsWith(q))) {
      rank = 3;
    } else if (entry.synonyms.some((synonym) => synonym === q)) {
      rank = 2;
    } else if (
      // Still a substring hit, ahead of the others: a word of a label or synonym starts with it.
      [...entry.labels, ...entry.synonyms].some((text) =>
        text.split(/[\s,/()-]+/).some((word) => word.startsWith(q)),
      )
    ) {
      rank = 1.5;
    } else if (
      entry.labels.some((label) => label.includes(q)) ||
      entry.synonyms.some((synonym) => synonym.includes(q))
    ) {
      rank = 1;
    }
    if (rank > 0) ranked.push({ item: entry.item, rank, position });
  });
  return ranked.sort((a, b) => b.rank - a.rank || a.position - b.position).map((r) => r.item);
}

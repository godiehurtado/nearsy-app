/**
 * Industry icon colors, agreed with iOS (2.1.0 QA): one color per catalog v1
 * sector, taken from the Interests icon palette (customInterestIconCatalog).
 * Neighbouring sectors never share a color. "Not specified" and unknown ids
 * keep the caller's muted color. No catalog, id or library change.
 */
import { getIndustry } from './industryCatalog.ts';

export const INDUSTRY_SECTOR_COLORS: Readonly<Record<string, string>> = {
  agriculture: '#16A34A',
  mining_oil_gas: '#CA8A04',
  utilities: '#0D9488',
  construction: '#DC2626',
  manufacturing: '#4F46E5',
  wholesale: '#0891B2',
  retail: '#DB2777',
  transportation: '#2563EB',
  technology_media: '#7C3AED',
  finance_insurance: '#059669',
  real_estate_rental: '#EA580C',
  professional_services: '#0891B2',
  business_facilities: '#CA8A04',
  education: '#2563EB',
  health_social: '#DC2626',
  arts_recreation: '#C026D3',
  hospitality_food: '#EA580C',
  personal_services: '#DB2777',
  community_nonprofit: '#0891B2',
  public_administration: '#4F46E5',
};

export function industrySectorColor(sectorId: string | null | undefined): string | null {
  if (!sectorId) return null;
  return Object.prototype.hasOwnProperty.call(INDUSTRY_SECTOR_COLORS, sectorId)
    ? INDUSTRY_SECTOR_COLORS[sectorId]!
    : null;
}

/** The item's sector color, or `fallback` for null / unknown ids. */
export function industryIconColor(id: string | null | undefined, fallback: string): string {
  const item = id ? getIndustry(id) : null;
  return industrySectorColor(item?.sector) ?? fallback;
}

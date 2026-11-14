/**
 * Industry picker icon colors (QA 2.1.0): one color per catalog v1 sector,
 * taken from the Interests icon palette (interests/customInterestIconCatalog
 * PALETTE), so the picker reads like the Interests chips.
 *
 * Presentation only: keyed by the frozen v1 sector ids, never stored or sent.
 * The catalog JSON, its ids and its icons are unchanged. Android uses the same
 * table, so both apps color a sector the same way.
 */
import { getIndustry } from './catalog';

/** The Interests icon palette (same 12 hex values, same order). */
export const INTEREST_ICON_PALETTE = [
  '#CA8A04',
  '#DB2777',
  '#EA580C',
  '#16A34A',
  '#7C3AED',
  '#2563EB',
  '#0891B2',
  '#4F46E5',
  '#0D9488',
  '#059669',
  '#C026D3',
  '#DC2626',
] as const;

/** Sector id (catalog v1) → icon color. Neighbouring sectors never share one. */
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

/** Icon color for an industry id, or the fallback for unknown/null ids. */
export function industryIconColor(
  id: string | null | undefined,
  fallback: string,
): string {
  const item = getIndustry(id);
  if (!item) return fallback;
  return INDUSTRY_SECTOR_COLORS[item.sector] ?? fallback;
}

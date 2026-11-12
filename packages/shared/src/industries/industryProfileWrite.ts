/**
 * Writes of the professional industry (INDUSTRY_CONTRACT.md §2, §5). Pure.
 *
 * - Top-level `professionalIndustryId`: a catalog id, or `null` for "Not
 *   specified". Never deleteField; never written for the personal profile.
 * - `notifyNearbyIndustry`: written only when the person toggles it, never at
 *   signup. Absent reads as true.
 */
import { getIndustry } from './industryCatalog.ts';

export function buildProfessionalIndustryPatch(
  id: string | null,
): { professionalIndustryId: string | null } {
  if (id === null) return { professionalIndustryId: null };
  const item = getIndustry(id);
  // The picker only offers active ids; anything else is a programming error.
  if (!item || item.status !== 'active') throw new Error('industry-id-not-offered');
  return { professionalIndustryId: id };
}

export function resolveNotifyNearbyIndustry(value: unknown): boolean {
  return value !== false;
}

export function buildNotifyNearbyIndustryPatch(enabled: boolean): { notifyNearbyIndustry: boolean } {
  return { notifyNearbyIndustry: enabled };
}

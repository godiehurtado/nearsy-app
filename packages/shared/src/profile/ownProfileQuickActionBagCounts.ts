import { extractOwnProfileAffiliationSummaryCounts } from '../affiliations/postCrjAffiliationEditor.ts';
import { extractOwnProfileGallerySummaryCounts } from '../gallery/postCrjGalleryEditor.ts';
import { extractOwnProfileInterestSummaryCounts } from '../interests/postCrjInterestEditor.ts';

export function extractOwnProfileQuickActionBagCounts(
  doc: Record<string, unknown>,
): {
  interests: { personal: number; professional: number };
  affiliations: { personal: number; professional: number };
  gallery: { personal: number; professional: number };
} {
  return {
    interests: extractOwnProfileInterestSummaryCounts(doc),
    affiliations: extractOwnProfileAffiliationSummaryCounts(doc),
    gallery: extractOwnProfileGallerySummaryCounts(doc),
  };
}

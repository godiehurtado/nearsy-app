export type AffiliationSearchPhase =
  | 'idle'
  | 'searching'
  | 'selected'
  | 'custom_ready';

export type AffiliationSearchUiSnapshot = {
  phase: AffiliationSearchPhase;
  hideJourneyFooter: boolean;
  showAddCta: boolean;
  addName: string | null;
};

export const IDLE_AFFILIATION_SEARCH_UI: AffiliationSearchUiSnapshot = {
  phase: 'idle',
  hideJourneyFooter: false,
  showAddCta: false,
  addName: null,
};

/**
 * Keyboard Search Mode for CRJ Affiliations.
 * Selecting a suggestion never persists; Add remains explicit.
 */
export function resolveAffiliationSearchUi(input: {
  searchFocused: boolean;
  pickedName: string | null;
  customName: string;
  customNameValid: boolean;
  hasProviderResults: boolean;
  searchPending: boolean;
  suggestionsUnavailable: boolean;
  hasDraftImage: boolean;
}): AffiliationSearchUiSnapshot {
  const pendingCandidate = Boolean(input.pickedName) || input.hasDraftImage;
  const allowCustomAdd =
    input.customNameValid &&
    (input.hasDraftImage ||
      input.suggestionsUnavailable ||
      (input.customName.trim().length >= 2 &&
        !input.hasProviderResults &&
        !input.searchPending));
  const inSearch =
    input.searchFocused || pendingCandidate || allowCustomAdd;

  if (!inSearch) {
    return IDLE_AFFILIATION_SEARCH_UI;
  }
  if (input.pickedName) {
    return {
      phase: 'selected',
      hideJourneyFooter: true,
      showAddCta: true,
      addName: input.pickedName,
    };
  }
  if (allowCustomAdd) {
    return {
      phase: 'custom_ready',
      hideJourneyFooter: true,
      showAddCta: true,
      addName: input.customName || null,
    };
  }
  return {
    phase: 'searching',
    hideJourneyFooter: true,
    showAddCta: false,
    addName: null,
  };
}

/**
 * In-memory selected-tile logo. Draft upload wins; otherwise keep the search
 * HTTPS logoUrl. Persistence still strips ephemeral Logo.dev token URLs.
 */
export function resolveInMemorySelectedLogoUrl(
  draftImage?: string | null,
  matchedLogoUrl?: string | null,
): string | undefined {
  const draft = typeof draftImage === 'string' ? draftImage.trim() : '';
  if (draft) return draft;
  const matched = typeof matchedLogoUrl === 'string' ? matchedLogoUrl.trim() : '';
  if (matched) return matched;
  return undefined;
}

export function resolvePendingAffiliationSearchUi<T extends string>(
  snapshots: Partial<Record<T, AffiliationSearchUiSnapshot>>,
  categoryOrder: readonly T[],
): { categoryId: T; ui: AffiliationSearchUiSnapshot } | null {
  for (const categoryId of categoryOrder) {
    const ui = snapshots[categoryId];
    if (ui?.showAddCta) return { categoryId, ui };
  }
  return null;
}

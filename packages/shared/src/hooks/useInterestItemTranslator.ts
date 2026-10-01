import { useCallback } from 'react';
import { useTranslation } from '../i18n';

/** Catalog interest label translator used by `resolveInterestChips`. */
export function useInterestItemTranslator() {
  const { t } = useTranslation();
  return useCallback(
    (nameKey: string, fallback: string) =>
      t(`onboarding.profileCompletion.interests.items.${nameKey}` as any, {
        defaultValue: fallback,
      }),
    [t],
  );
}

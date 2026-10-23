import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { useTranslation } from '../i18n';
import type { ProfileMode } from '../profile/profileModeFields.ts';
import {
  bagOnlyOwnershipPresenceByMode,
  buildOwnProfileSocialSummary,
  ownProfileSocialSummarySubtitle,
  resolveOwnProfileSocialSummaryRequest,
  type OwnershipPresenceByMode,
  type SocialSummaryPresentation,
} from './ownProfileSocialSummary.ts';
import { loadOwnProfileSocialOwnershipOverlay } from './ownProfileSocialSummaryLoad.ts';

export function useOwnProfileSocialSummary(input: {
  getUid: () => string | null;
  mode: ProfileMode;
  mountedRef: { current: boolean };
}): {
  socialSubtitle: string;
  loadSocialSummary: (doc: Record<string, unknown>) => Promise<void>;
} {
  const { t } = useTranslation();
  const genRef = useRef(0);
  const getUidRef = useRef(input.getUid);
  getUidRef.current = input.getUid;
  const modeRef = useRef(input.mode);
  modeRef.current = input.mode;
  const cacheRef = useRef<{
    doc: Record<string, unknown>;
    presence: OwnershipPresenceByMode;
  } | null>(null);

  const [presentation, setPresentation] = useState<SocialSummaryPresentation>(
    () =>
      Platform.OS === 'android'
        ? { kind: 'loading' }
        : { kind: 'ready', count: 0 },
  );

  const applyCache = useCallback((mode: ProfileMode) => {
    const cache = cacheRef.current;
    if (!cache) return;
    const built = buildOwnProfileSocialSummary({
      doc: cache.doc,
      presence: cache.presence,
      mode,
    });
    setPresentation(built.presentation);
  }, []);

  useEffect(() => {
    applyCache(input.mode);
  }, [applyCache, input.mode]);

  const loadSocialSummary = useCallback(
    async (doc: Record<string, unknown>) => {
      const requestUid = getUidRef.current() ?? '';
      const gen = ++genRef.current;
      cacheRef.current = null;
      if (Platform.OS === 'android') {
        setPresentation({ kind: 'loading' });
      }
      const result = await resolveOwnProfileSocialSummaryRequest({
        platform: Platform.OS,
        doc,
        mode: modeRef.current,
        isCurrent: () =>
          gen === genRef.current &&
          requestUid === (getUidRef.current() ?? '') &&
          input.mountedRef.current,
        loadOverlay: loadOwnProfileSocialOwnershipOverlay,
      });
      if (!result) return;
      cacheRef.current = {
        doc,
        presence: result.presence ?? bagOnlyOwnershipPresenceByMode(),
      };
      applyCache(modeRef.current);
    },
    [applyCache, input.mountedRef],
  );

  const socialSubtitle = ownProfileSocialSummarySubtitle(presentation, {
    configured: (count) => t('profile.quickActions.configured', { count }),
    empty: t('profile.quickActions.empty'),
    checking: t('profile.quickActions.checking'),
    checkError: t('profile.quickActions.checkError'),
  });

  return { socialSubtitle, loadSocialSummary };
}

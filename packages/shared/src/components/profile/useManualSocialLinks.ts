import { trackSocialLinked } from '../../analytics/analytics';
import { useCallback, useEffect, useRef, useState } from 'react';

import { firebaseAuth } from '../../config/firebaseConfig';
import { useTranslation } from '../../i18n';
import type { ProfileMode } from '../../profile/profileModeFields';
import {
  saveManualSocialLink,
  type ManualSocialLinkId,
} from '../../social/manualSocialLinkCard';
import { persistManualSocialLink } from '../../social/manualSocialLinkStore';
import { shouldApplySocialEditorResult } from '../../social/onboardingSocialPersistence';

/**
 * Add, edit and remove for manual links, shared by the CRJ and the editor. Every
 * operation is written when it happens, so no Next, Skip or Back is involved. A
 * result that arrives after the screen closed or the session changed is ignored.
 */
export function useManualSocialLinks(input: {
  uid: string | null;
  mode: ProfileMode | null;
  values: Record<ManualSocialLinkId, string>;
  onSaved: (field: ManualSocialLinkId, url: string | null) => void;
}) {
  const { uid, mode, values, onSaved } = input;
  const { t } = useTranslation();
  const [target, setTarget] = useState<ManualSocialLinkId | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [cardError, setCardError] = useState<{
    field: ManualSocialLinkId;
    message: string;
  } | null>(null);
  const [busyField, setBusyField] = useState<ManualSocialLinkId | null>(null);

  const busyRef = useRef(false);
  const generationRef = useRef(0);
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  const valuesRef = useRef(values);
  valuesRef.current = values;

  useEffect(() => {
    // New account or mode: nothing in flight may reach this screen state.
    busyRef.current = false;
    setBusyField(null);
    setTarget(null);
    setModalError(null);
    setCardError(null);
    return () => {
      generationRef.current += 1;
    };
  }, [uid, mode]);

  const run = useCallback(
    async (field: ManualSocialLinkId, raw: string | null) => {
      if (!uid || !mode || busyRef.current) return;
      busyRef.current = true;
      const generation = generationRef.current;
      setBusyField(field);
      setModalError(null);
      setCardError(null);

      const isCurrent = () =>
        shouldApplySocialEditorResult({
          expectedUid: uid,
          expectedMode: mode,
          liveUid: firebaseAuth.currentUser?.uid ?? null,
          liveMode: mode,
          expectedGeneration: generation,
          liveGeneration: generationRef.current,
        });
      const result = await saveManualSocialLink({
        field,
        raw,
        isCurrent,
        persist: (key, url) => persistManualSocialLink(uid, mode, key, url),
      });
      if (result.status === 'stale') return;

      busyRef.current = false;
      setBusyField(null);
      if (result.status === 'saved') {
        // Adding only: an edit already had a value, and removal has no url.
        if (result.url && !valuesRef.current[field]?.trim()) {
          trackSocialLinked(field, 'manual', mode);
        }
        onSavedRef.current(field, result.url);
        setTarget(null);
        return;
      }
      if (result.status === 'invalid') {
        setModalError(t('profile.social.invalidValue'));
        return;
      }
      const message = t('profile.social.manual.saveFailed');
      if (raw == null) setCardError({ field, message });
      else setModalError(message);
    },
    [mode, t, uid],
  );

  const open = useCallback((field: ManualSocialLinkId) => {
    setModalError(null);
    setCardError(null);
    setTarget(field);
  }, []);

  const remove = useCallback(
    (field: ManualSocialLinkId) => {
      void run(field, null);
    },
    [run],
  );

  const platformKey = target ?? 'facebook';
  const platformLabel = t(
    `onboarding.profileCompletion.socialMedia.platforms.${platformKey}` as any,
  );

  return {
    busy: busyField != null,
    busyField,
    errorFor: (field: ManualSocialLinkId) =>
      cardError?.field === field ? cardError.message : null,
    open,
    remove,
    modalProps: {
      visible: target != null,
      platformLabel,
      placeholder: t(
        `onboarding.profileCompletion.socialMedia.placeholders.${platformKey}` as any,
      ),
      initialValue: target ? values[target] : '',
      editing: target ? !!values[target]?.trim() : false,
      errorText: modalError,
      saving: busyField != null,
      onCancel: () => {
        if (busyRef.current) return;
        setTarget(null);
        setModalError(null);
      },
      onSave: (value: string) => {
        if (target) void run(target, value);
      },
    },
  };
}

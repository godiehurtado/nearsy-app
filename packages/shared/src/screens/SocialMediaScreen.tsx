/**
 * Own Profile Social editor — Nearsy 2.0 CRJ social step + post-CRJ Website.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';

import { OwnProfileEditorShell } from '../components/registration/OwnProfileEditorShell';
import { OnboardingSocialMediaStep } from '../components/registration/OnboardingSocialMediaStep';
import { PrimaryButton } from '../components/PrimaryButton';
import { firebaseAuth, firestoreDb } from '../config/firebaseConfig';
import {
  buildPostCrjSocialLinksPersistencePatch,
} from '../social/onboardingSocialPersistence';
import {
  buildValuesForPostCrjSocialSave,
  emptyPostCrjSocialConnectedState,
  isPostCrjSocialEditorDirty,
  parsePostCrjSocialEditorParams,
  readPostCrjSocialEditorDraft,
  validatePostCrjSocialDraftForSave,
  type PostCrjSocialEditorDraft,
} from '../social/postCrjSocialEditor';
import {
  emptyCrjSocialDraftValues,
  type CrjSocialDraftValues,
  type CrjSocialPlatformId,
} from '../social/onboardingSocialCatalog';
import type { SocialCustomLink } from '../types/profile';
import type { CrjSocialFieldErrors } from '../social/socialLinkNormalize';
import { useAppTheme } from '../theme/ThemeContext';
import { fontSize, fontWeight } from '../theme/typography';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';
import { useTranslation } from '../i18n';

type ProfileMode = 'personal' | 'professional';

function emptyDraft(): PostCrjSocialEditorDraft {
  return {
    values: emptyCrjSocialDraftValues(),
    website: '',
    custom: [],
    connected: emptyPostCrjSocialConnectedState(),
  };
}

export default function SocialMediaScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { palette } = useAppTheme();
  const { t } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<ProfileMode>('personal');
  const [uid, setUid] = useState<string | null>(null);
  const [draft, setDraft] = useState<PostCrjSocialEditorDraft>(emptyDraft);
  const [snapshot, setSnapshot] = useState<PostCrjSocialEditorDraft>(emptyDraft);
  const [fieldErrors, setFieldErrors] = useState<
    CrjSocialFieldErrors & { website?: string }
  >({});

  const dirty = isPostCrjSocialEditorDirty(snapshot, draft);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const authUid = firebaseAuth.currentUser?.uid ?? null;
      const parsed = parsePostCrjSocialEditorParams(route.params ?? {}, authUid);
      if (!parsed.ok) {
        Alert.alert('Sign in required', 'Please sign in to edit social links.');
        navigation.goBack();
        return;
      }
      const { uid: targetUid, mode: targetMode } = parsed.params;
      setUid(targetUid);
      setMode(targetMode);

      const snap = await firestoreDb.collection('users').doc(targetUid).get();
      const exists =
        typeof snap.exists === 'function' ? snap.exists() : snap.exists;
      const data = (exists ? snap.data() : {}) as Record<string, unknown>;
      const loaded = readPostCrjSocialEditorDraft(data, targetMode);
      // Mark connected platforms that already have values.
      const connected = emptyPostCrjSocialConnectedState();
      (Object.keys(loaded.values) as CrjSocialPlatformId[]).forEach((id) => {
        if ((loaded.values[id] ?? '').trim()) connected[id] = true;
      });
      if (loaded.website.trim()) connected.website = true;
      const next = { ...loaded, connected };
      setDraft(next);
      setSnapshot(next);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not load social links.');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [navigation, route.params]);

  useEffect(() => {
    void load();
  }, [load]);

  const setValues = (values: CrjSocialDraftValues) => {
    setDraft((prev) => {
      const connected = { ...prev.connected };
      (Object.keys(values) as CrjSocialPlatformId[]).forEach((id) => {
        if ((values[id] ?? '').trim()) connected[id] = true;
      });
      return { ...prev, values, connected };
    });
  };

  const setCustom = (custom: SocialCustomLink[]) => {
    setDraft((prev) => ({ ...prev, custom }));
  };

  const save = async () => {
    if (!uid || saving) return;
    const validation = validatePostCrjSocialDraftForSave(draft, {
      requiredWhenConnected: 'Add a value or disconnect this network.',
      invalidValue: 'Enter a valid URL or handle.',
    });
    if (validation.ok === false) {
      setFieldErrors(validation.errors);
      return;
    }
    setSaving(true);
    try {
      const values = buildValuesForPostCrjSocialSave(draft);
      const patch = buildPostCrjSocialLinksPersistencePatch(
        mode,
        values,
        draft.custom,
        {
          website: draft.connected.website ? draft.website : '',
        },
      );
      await firestoreDb
        .collection('users')
        .doc(uid)
        .set({ ...patch, updatedAt: Date.now() }, { merge: true });
      setSnapshot(draft);
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not save social links.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <OwnProfileEditorShell
        title="Social"
        onBack={() => navigation.goBack()}
        scroll={false}
      >
        <View style={styles.centered}>
          <ActivityIndicator color={palette.primary} />
        </View>
      </OwnProfileEditorShell>
    );
  }

  return (
    <OwnProfileEditorShell
      title={t('onboarding.profileCompletion.socialMedia.title' as any, {
        defaultValue: 'Social media',
      })}
      eyebrow={mode === 'professional' ? 'Professional' : 'Personal'}
      body={t('onboarding.profileCompletion.socialMedia.body' as any, {
        defaultValue: 'Add the networks you use so people can find you.',
      })}
      onBack={() => navigation.goBack()}
      footer={
        <PrimaryButton
          label="Save social links"
          onPress={() => {
            void save();
          }}
          disabled={!dirty || saving}
          loading={saving}
        />
      }
    >
      <OnboardingSocialMediaStep
        values={draft.values}
        custom={draft.custom}
        onChangeValues={setValues}
        onChangeCustom={setCustom}
        fieldErrors={fieldErrors}
        onClearFieldError={(id) => {
          setFieldErrors((prev) => {
            if (!prev[id]) return prev;
            const next = { ...prev };
            delete next[id];
            return next;
          });
        }}
      />

      <View style={styles.websiteBlock}>
        <Text style={[styles.websiteLabel, { color: palette.textPrimary }]}>
          Website
        </Text>
        <TextInput
          value={draft.website}
          onChangeText={(website) => {
            setDraft((prev) => ({
              ...prev,
              website,
              connected: {
                ...prev.connected,
                website: website.trim().length > 0 || prev.connected.website,
              },
            }));
            if (fieldErrors.website) {
              setFieldErrors((prev) => {
                const next = { ...prev };
                delete next.website;
                return next;
              });
            }
          }}
          placeholder="https://yoursite.com"
          placeholderTextColor={palette.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          style={[
            styles.websiteInput,
            {
              color: palette.textPrimary,
              borderColor: fieldErrors.website
                ? palette.danger ?? '#DC2626'
                : palette.border,
              backgroundColor: palette.surface,
            },
          ]}
        />
        {fieldErrors.website ? (
          <Text style={styles.websiteError}>{fieldErrors.website}</Text>
        ) : null}
      </View>
    </OwnProfileEditorShell>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  websiteBlock: { marginTop: spacing.lg, marginBottom: spacing.xl },
  websiteLabel: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.xs,
  },
  websiteInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: fontSize.md,
  },
  websiteError: {
    color: '#DC2626',
    fontSize: fontSize.xs,
    marginTop: 6,
  },
});
